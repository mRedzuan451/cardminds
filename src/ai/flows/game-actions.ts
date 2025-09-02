
'use server';
/**
 * @fileOverview Game actions managed by Genkit flows.
 * This file contains all the server-side logic for the CardMinds game.
 * It uses Firebase Firestore to store and manage the game state in real-time.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, runTransaction, arrayUnion, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { firebaseApp } from '@/lib/firebase';
import { Game, Player, GameState, GameMode, Card } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, calculateScore, evaluateEquation, getCardValues } from '@/lib/game';

const db = getFirestore(firebaseApp);

function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Schemas
const CardSchema = z.object({
    id: z.string(),
    suit: z.string(),
    rank: z.string(),
});
const CreateGameInputSchema = z.object({ creatorName: z.string() });
const GameIdInputSchema = z.object({ gameId: z.string() });
const JoinGameInputSchema = z.object({ gameId: z.string(), playerName: z.string() });
const StartGameInputSchema = z.object({ gameId: z.string(), gameMode: z.enum(['easy', 'pro', 'special']), numberOfPlayers: z.number() });
const SetGameModeInputSchema = z.object({ gameId: z.string(), mode: z.enum(['easy', 'pro', 'special']) });

const PlayerActionInputSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  action: z.enum(['submit', 'pass']),
  equation: z.optional(z.array(z.union([z.string(), z.number()]))),
  cardsUsed: z.optional(z.array(CardSchema)),
});

const SpecialActionInputSchema = z.object({
    gameId: z.string(),
    playerId: z.string(),
    card: CardSchema,
    target: z.optional(z.any()),
});

const EndSpecialActionInputSchema = z.object({
    gameId: z.string(),
});

const DiscardCardsInputSchema = z.object({
    gameId: z.string(),
    playerId: z.string(),
    cardsToDiscard: z.array(CardSchema),
});


// Flows
export const createGame = ai.defineFlow({ name: 'createGame', inputSchema: CreateGameInputSchema }, async ({ creatorName }) => {
  let gameId: string;
  let gameDoc;
  let gameRef;

  do {
    gameId = generateShortId();
    gameRef = doc(db, 'games', gameId);
    gameDoc = await getDoc(gameRef);
  } while (gameDoc.exists());
  console.log(`[createGame] Generated new gameId: ${gameId}`);

  const playersRef = collection(db, 'games', gameId, 'players');
  const newPlayerRef = doc(playersRef);
  const creatorId = newPlayerRef.id;

  const initialGameData: Game = {
    id: gameId,
    creatorId: creatorId,
    gameState: 'lobby',
    gameMode: 'easy',
    players: [creatorId],
    maxPlayers: 8,
    deck: [],
    targetNumber: 0,
    targetCards: [],
    currentPlayerId: creatorId,
    currentRound: 1,
    totalRounds: 3,
  };
  
  const creatorData: Player = {
      id: creatorId,
      name: creatorName,
      hand: [],
      roundScore: 0,
      totalScore: 0,
      passed: false,
      finalResult: 0,
      equation: []
  }

  const batch = writeBatch(db);
  batch.set(gameRef, initialGameData);
  batch.set(newPlayerRef, creatorData);
  
  await batch.commit();
  console.log(`[createGame] Game ${gameId} created successfully by ${creatorName} (${creatorId}).`);

  return gameId;
});

export const joinGame = ai.defineFlow({ name: 'joinGame', inputSchema: JoinGameInputSchema }, async ({ gameId, playerName }) => {
  const gameRef = doc(db, 'games', gameId);
  const playersRef = collection(db, 'games', gameId, 'players');
  
  // Check for existing player name outside of the transaction
  const q = query(playersRef, where("name", "==", playerName));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
      console.error(`[joinGame] Error: Player name '${playerName}' already exists in game '${gameId}'.`);
      throw new Error("A player with this name is already in the game.");
  }
  console.log(`[joinGame] Player name '${playerName}' is unique. Proceeding to join.`);

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
      throw new Error("Game not found.");
    }
    const game = gameDoc.data() as Game;
    if (game.gameState !== 'lobby') {
      throw new Error("Game has already started.");
    }
    if (game.players.length >= game.maxPlayers) {
        throw new Error("Game is full.");
    }

    const newPlayerRef = doc(playersRef);
    const newPlayerId = newPlayerRef.id;

    const newPlayerData: Player = {
        id: newPlayerId,
        name: playerName,
        hand: [],
        roundScore: 0,
        totalScore: 0,
        passed: false,
        finalResult: 0,
        equation: []
    }
    transaction.set(newPlayerRef, newPlayerData);
    transaction.update(gameRef, { players: arrayUnion(newPlayerId) });
    console.log(`[joinGame] Player '${playerName}' (${newPlayerId}) successfully joined game '${gameId}'.`);
  });
});

export const setGameMode = ai.defineFlow({ name: 'setGameMode', inputSchema: SetGameModeInputSchema}, async ({ gameId, mode }) => {
    const gameRef = doc(db, 'games', gameId);
    if (mode === 'special') {
        await updateDoc(gameRef, { gameMode: mode, totalRounds: 99, targetScore: 3000 });
    } else {
        await updateDoc(gameRef, { gameMode: mode, totalRounds: 3, targetScore: 0 });
    }
    console.log(`[setGameMode] Game mode for ${gameId} set to ${mode}`);
});

export const startGame = ai.defineFlow({ name: 'startGame', inputSchema: StartGameInputSchema }, async ({ gameId, numberOfPlayers }) => {
  await runTransaction(db, async (transaction) => {
    console.log(`[startGame] Attempting to start game ${gameId}`);
    // Read phase
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    const game = gameDoc.data() as Game;
    console.log(`[startGame] Game ${gameId} found. Mode: ${game.gameMode}`);

    const playersQuery = query(collection(db, 'games', gameId, 'players'));
    const playerDocsSnap = await getDocs(playersQuery);
    const players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));
    const playerCount = players.length;
    console.log(`[startGame] Found ${playerCount} players.`);

    // Write phase
    let freshDeck = shuffleDeck(createDeck(game.gameMode, playerCount));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode, playerCount);
    freshDeck = updatedDeck;
    console.log(`[startGame] Target generated: ${target}. Cards used:`, cardsUsed);
    
    const firstPlayerId = game.players[0];
    
    // Deal 5 cards to each player
    const dealtHands: Record<string, Card[]> = {};
    players.forEach(p => {
        const hand = freshDeck.splice(0, 5);
        dealtHands[p.id] = hand;
        const playerRef = doc(db, 'games', gameId, 'players', p.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });
    console.log(`[startGame] Dealt 5 cards to each player.`);

    // Deal starting card to first player
    if (freshDeck.length > 0) {
        const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
        const firstPlayerHand = dealtHands[firstPlayerId];
        if (firstPlayerHand) {
            const newHand = [...firstPlayerHand, freshDeck.shift()!];
            transaction.update(firstPlayerRef, { hand: newHand });
            console.log(`[startGame] Dealt starting card to first player ${firstPlayerId}.`);
        }
    }

    transaction.update(gameRef, {
        gameState: 'playerTurn',
        deck: freshDeck,
        targetNumber: target,
        targetCards: cardsUsed,
        currentPlayerId: firstPlayerId,
        currentRound: 1,
    });
    console.log(`[startGame] Game ${gameId} started. First turn: ${firstPlayerId}.`);
  });
});


async function advanceTurn(gameId: string) {
    await runTransaction(db, async (transaction) => {
        console.log(`[advanceTurn] Advancing turn for game ${gameId}`);
        // ========== READ PHASE ==========
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found");
        let game = gameDoc.data() as Game;
        
        const playersQuery = query(collection(db, 'games', gameId, 'players'));
        const playerDocsSnap = await getDocs(playersQuery);
let players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));

        // ========== LOGIC PHASE ==========
        
        // 1. Check if all players have acted (passed or submitted). This is the condition to end the round.
        const allPlayersHaveActed = players.every(p => p.passed);
        console.log(`[advanceTurn] All players have acted: ${allPlayersHaveActed}`);

        if (allPlayersHaveActed) {
            // End of the round. Tally scores.
            console.log(`[advanceTurn] Round over for game ${gameId}.`);
            
            // Update total scores
            players.forEach(p => {
                const newTotalScore = p.totalScore + p.roundScore;
                const playerRef = doc(db, 'games', gameId, 'players', p.id);
                transaction.update(playerRef, { totalScore: newTotalScore });
                // Update player object in local list for gameOver check
                p.totalScore = newTotalScore;
            });

            // Check for game over condition
            if (game.gameMode === 'special' && game.targetScore) {
                const winner = players.find(p => p.totalScore >= game.targetScore!);
                if (winner) {
                    transaction.update(gameRef, { gameState: 'gameOver' });
                    console.log(`[advanceTurn] Game over! ${winner.name} reached the target score.`);
                    return; // End transaction
                }
            }
            
            const highestScore = Math.max(...players.map(p => p.roundScore));
            const winners = players.filter(p => p.roundScore === highestScore);
            const roundWinnerIds = highestScore > 0 ? winners.map(w => w.id) : [];

            transaction.update(gameRef, {
                gameState: 'roundOver',
                roundWinnerIds,
            });
            console.log(`[advanceTurn] Game state set to 'roundOver'. Winners:`, winners.map(w => w.name));
            return; // End the transaction, round is over.
        }

        // 2. If the round is not over, advance to the next player who hasn't passed.
        const currentPlayerIndex = game.players.indexOf(game.currentPlayerId);
        let nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
        
        let nextPlayerId: string | null = null;
        
        // Find the next player who hasn't passed
        for (let i = 0; i < game.players.length; i++) {
            const potentialNextPlayerId = game.players[nextPlayerIndex];
            const playerDoc = players.find(p => p.id === potentialNextPlayerId);
            if (playerDoc && !playerDoc.passed) {
                nextPlayerId = potentialNextPlayerId;
                break;
            }
            nextPlayerIndex = (nextPlayerIndex + 1) % game.players.length;
        }

        if (nextPlayerId) {
            console.log(`[advanceTurn] Next player is ${nextPlayerId}.`);
            const nextPlayerRef = doc(db, 'games', gameId, 'players', nextPlayerId);
            const nextPlayer = players.find(p => p.id === nextPlayerId!);
            let newDeck = game.deck;

            if (nextPlayer && newDeck.length > 0) {
                const newCard = newDeck.shift()!;
                const newHand = [...nextPlayer.hand, newCard];
                transaction.update(nextPlayerRef, { hand: newHand });
                console.log(`[advanceTurn] Dealt card ${newCard.rank} of ${newCard.suit} to ${nextPlayerId}.`);
            }
            transaction.update(gameRef, { currentPlayerId: nextPlayerId, deck: newDeck });
        } else {
             // This case should be handled by the allPlayersHaveActed check, but as a fallback.
             console.error("[advanceTurn] Error: Could not find a next player who hasn't passed, but not all players have acted. This indicates a logic issue.");
        }
    });
}

export const playerAction = ai.defineFlow({ name: 'playerAction', inputSchema: PlayerActionInputSchema }, async (input) => {
  const { gameId, playerId, action } = input;
  console.log(`[playerAction] Received action '${action}' from player ${playerId} in game ${gameId}.`);
  
  await runTransaction(db, async (transaction) => {
    const gameRef = doc(db, 'games', gameId);
    const playerRef = doc(db, 'games', gameId, 'players', playerId);
    
    const gameDoc = await transaction.get(gameRef);
    const playerDoc = await transaction.get(playerRef);

    if (!gameDoc.exists() || !playerDoc.exists()) throw new Error("Game or player not found");
    const game = gameDoc.data() as Game;
    const player = playerDoc.data() as Player;

    if (game.currentPlayerId !== playerId) {
      console.warn(`[playerAction] Ignoring action from player ${playerId} because it's not their turn.`);
      return;
    }

    if (action === 'submit') {
      const { equation, cardsUsed } = input;
      if (equation === undefined || cardsUsed === undefined) {
        throw new Error("Submit action requires equation and cardsUsed.");
      }
      console.log(`[playerAction] Player ${playerId} submitted equation:`, equation);

      const result = evaluateEquation(equation, game.gameMode);
      if (typeof result === 'object' && result.error) {
        // This should be caught client-side, but as a fallback.
        throw new Error(`Invalid equation submitted: ${result.error}`);
      }
      console.log(`[playerAction] Equation result: ${result}`);
      
      const newScore = calculateScore(result as number, game.targetNumber, cardsUsed.length);
      console.log(`[playerAction] Calculated score for ${playerId}: ${newScore}`);

      // Remove used cards from hand
      const newHand = player.hand.filter(handCard => 
        !cardsUsed.some(usedCard => usedCard.id === handCard.id)
      );

      transaction.update(playerRef, {
        roundScore: newScore,
        finalResult: result,
        equation: equation,
        cardsUsed: cardsUsed,
        hand: newHand,
        passed: true, // Submitting also means you are done for the turn cycle
      });

    } else { // action === 'pass'
        console.log(`[playerAction] Player ${playerId} passed.`);
        transaction.update(playerRef, {
          passed: true, 
          equation: [], 
          cardsUsed: [],
          finalResult: 0, 
          roundScore: 0 
        });
    }
  });

  // Now that the player's action is committed, advance the turn.
  await advanceTurn(gameId);
});

export const nextRound = ai.defineFlow({ name: 'nextRound', inputSchema: GameIdInputSchema }, async ({ gameId }) => {
  let playerToDiscard: string | null = null;

  await runTransaction(db, async (transaction) => {
    console.log(`[nextRound] Starting next round for game ${gameId}`);
    // Read phase
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    let game = gameDoc.data() as Game;
    
    if (game.gameMode !== 'special' && game.currentRound >= game.totalRounds) {
      console.log(`[nextRound] Game over by rounds. Setting state to 'gameOver'.`);
      transaction.update(gameRef, { gameState: 'gameOver' });
      return;
    }
    
    const playersQuery = query(collection(db, 'games', gameId, 'players'));
    const playerDocsSnap = await getDocs(playersQuery);
    const players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));
    const playerCount = players.length;

    // Write phase
    let freshDeck = shuffleDeck(createDeck(game.gameMode, playerCount));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode, playerCount);
    freshDeck = updatedDeck;
    console.log(`[nextRound] New target: ${target}.`);
    
    const firstPlayerId = game.players[0];
    
    const dealtHands: Record<string, Card[]> = {};
    
    if (game.gameMode === 'special') {
        // In special mode, players keep their hand and draw 3 new cards
        for (const p of players) {
            const newCards = freshDeck.splice(0, 3);
            const newHand = [...p.hand, ...newCards];
            dealtHands[p.id] = newHand; // Store for the first player draw logic
            const playerRef = doc(db, 'games', gameId, 'players', p.id);
            transaction.update(playerRef, { 
                hand: newHand, 
                roundScore: 0, 
                passed: false, 
                finalResult: 0, 
                equation: [], 
                cardsUsed: [] 
            });

            // Check for discard condition
            if (newHand.length > 10 && !playerToDiscard) {
                playerToDiscard = p.id;
            }
        }

    } else {
        // In other modes, deal 5 fresh cards
        players.forEach(p => {
            const hand = freshDeck.splice(0, 5);
            dealtHands[p.id] = hand;
            const playerRef = doc(db, 'games', gameId, 'players', p.id);
            transaction.update(playerRef, { 
                hand, 
                roundScore: 0, 
                passed: false, 
                finalResult: 0, 
                equation: [], 
                cardsUsed: [] 
            });
        });
    }

    // Deal starting card to first player, but not in special mode
    if ((game.gameMode === 'easy' || game.gameMode === 'pro') && freshDeck.length > 0) {
      const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
      const firstPlayerHand = dealtHands[firstPlayerId];
      if (firstPlayerHand) {
          const newHand = [...firstPlayerHand, freshDeck.shift()!];
          transaction.update(firstPlayerRef, { hand: newHand });
          console.log(`[nextRound] Dealt starting card to first player ${firstPlayerId}.`);
      }
    }
    
    // Determine next game state
    if (playerToDiscard) {
        console.log(`[nextRound] Player ${playerToDiscard} must discard cards.`);
        transaction.update(gameRef, {
            gameState: 'discarding',
            discardingPlayerId: playerToDiscard,
            deck: freshDeck,
            targetNumber: target,
            targetCards: cardsUsed,
            currentPlayerId: playerToDiscard, // The player discarding is the current player
            currentRound: game.currentRound + 1,
            roundWinnerIds: [],
        });
    } else {
        transaction.update(gameRef, {
          gameState: 'playerTurn',
          deck: freshDeck,
          targetNumber: target,
          targetCards: cardsUsed,
          currentPlayerId: game.players[0],
          currentRound: game.currentRound + 1,
          roundWinnerIds: [],
        });
        console.log(`[nextRound] Round ${game.currentRound + 1} started.`);
    }
  });
});

export const discardCards = ai.defineFlow({ name: 'discardCards', inputSchema: DiscardCardsInputSchema }, async ({ gameId, playerId, cardsToDiscard }) => {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const playerRef = doc(db, 'games', gameId, 'players', playerId);
        const gameDoc = await transaction.get(gameRef);
        const playerDoc = await transaction.get(playerRef);

        if (!gameDoc.exists() || !playerDoc.exists()) throw new Error("Game or player not found");
        const game = gameDoc.data() as Game;
        const player = playerDoc.data() as Player;

        if (game.gameState !== 'discarding' || game.discardingPlayerId !== playerId) {
            throw new Error("Not the right time or player to discard.");
        }
        if (cardsToDiscard.length !== 3) {
            throw new Error("You must discard exactly 3 cards.");
        }

        const discardIds = new Set(cardsToDiscard.map(c => c.id));
        const newHand = player.hand.filter(c => !discardIds.has(c.id));

        if (newHand.length !== player.hand.length - 3) {
            throw new Error("Some cards to discard were not found in your hand.");
        }
        
        transaction.update(playerRef, { hand: newHand });
        transaction.update(gameRef, {
            gameState: 'playerTurn',
            discardingPlayerId: null,
            currentPlayerId: game.players[0] // Start turn from the first player in the list
        });
    });
});

export const rematch = ai.defineFlow({ name: 'rematch', inputSchema: GameIdInputSchema, outputSchema: z.string() }, async ({ gameId }) => {
    console.log(`[rematch] Creating rematch for game ${gameId}`);
    const oldGameRef = doc(db, 'games', gameId);
    const oldGameDoc = await getDoc(oldGameRef);
    if (!oldGameDoc.exists()) throw new Error("Original game not found.");
    
    const oldGameData = oldGameDoc.data() as Game;
    
    const playersQuery = query(collection(db, 'games', gameId, 'players'));
    const playerDocsSnap = await getDocs(playersQuery);
    const players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));

    let newGameId: string;
    let newGameDoc;
    let newGameRef;
    do {
      newGameId = generateShortId();
      newGameRef = doc(db, 'games', newGameId);
      newGameDoc = await getDoc(newGameRef);
    } while (newGameDoc.exists());
    console.log(`[rematch] New game ID for rematch: ${newGameId}`);

    const newGameData: Game = {
      id: newGameId,
      creatorId: oldGameData.creatorId,
      gameState: 'lobby',
      gameMode: oldGameData.gameMode,
      players: oldGameData.players,
      maxPlayers: oldGameData.maxPlayers,
      deck: [],
      targetNumber: 0,
      targetCards: [],
      currentPlayerId: oldGameData.creatorId,
      currentRound: 1,
      totalRounds: oldGameData.totalRounds,
      targetScore: oldGameData.targetScore
    };
    
    const batch = writeBatch(db);
    batch.set(newGameRef, newGameData);
    
    for (const player of players) {
        const newPlayerRef = doc(db, 'games', newGameId, 'players', player.id);
        const newPlayerData: Player = {
            id: player.id,
            name: player.name,
            hand: [],
            roundScore: 0,
            totalScore: 0,
            passed: false,
            finalResult: 0,
            equation: []
        };
        batch.set(newPlayerRef, newPlayerData);
    }
    
    batch.update(oldGameRef, { nextGameId: newGameId });
    await batch.commit();
    console.log(`[rematch] Rematch game ${newGameId} created successfully.`);

    return newGameId;
});


export const playSpecialCard = ai.defineFlow({ name: 'playSpecialCard', inputSchema: SpecialActionInputSchema }, async ({ gameId, playerId, card }) => {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const playerRef = doc(db, 'games', gameId, 'players', playerId);
        const gameDoc = await transaction.get(gameRef);
        const playerDoc = await transaction.get(playerRef);

        if (!gameDoc.exists() || !playerDoc.exists()) throw new Error("Game or player not found");
        const game = gameDoc.data() as Game;
        const player = playerDoc.data() as Player;

        // Find and remove card from hand
        const cardIndex = player.hand.findIndex(c => c.id === card.id);
        if (cardIndex === -1) throw new Error("Card not in hand");
        const newHandBeforeShuffle = [...player.hand];
        newHandBeforeShuffle.splice(cardIndex, 1);
        
        const cardRank = card.rank as 'CL' | 'SB' | 'SH' | 'DE';
        
        if (cardRank === 'SH') { // Shuffle Card - action is immediate
            let newDeck = [...game.deck];
            // The entire hand including the shuffle card gets discarded
            const handToDiscard = [...player.hand]; 
            const handSize = player.hand.length; 
            
            newDeck.push(...handToDiscard);
            newDeck = shuffleDeck(newDeck);
            
            // Draw the same number of cards back
            const newCardsForHand = newDeck.splice(0, handSize);
            
            transaction.update(playerRef, { hand: newCardsForHand });
            transaction.update(gameRef, { deck: newDeck });
            // The turn does not advance here. The player can now make a move.
            
        } else {
             // For other cards, remove the card and set game state to get more input
             transaction.update(playerRef, { hand: newHandBeforeShuffle });
             transaction.update(gameRef, { 
                gameState: 'specialAction',
                specialAction: {
                    playerId,
                    cardRank
                }
            });
        }
    });
});

export const resolveSpecialCard = ai.defineFlow({ name: 'resolveSpecialCard', inputSchema: SpecialActionInputSchema }, async ({ gameId, playerId, card, target }) => {
    let turnShouldAdvance = true;

    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found");
        const game = gameDoc.data() as Game;
        const cardRank = card.rank as 'CL' | 'SB' | 'SH' | 'DE';
        
        switch(cardRank) {
            case 'CL': { // Clone Card
                const playerRef = doc(db, 'games', gameId, 'players', playerId);
                const playerDoc = await transaction.get(playerRef);
                if (!playerDoc.exists()) throw new Error("Player not found");
                const player = playerDoc.data() as Player;
                const clonedCard = { ...(target as Card), id: `cloned-${Date.now()}` };
                const newHand = [...player.hand, clonedCard];
                transaction.update(playerRef, { hand: newHand });
                turnShouldAdvance = false; // Player does not pass their turn
                break;
            }
            case 'SB': { // Sabotage Card
                const targetPlayerId = target as string;
                const targetPlayerRef = doc(db, 'games', gameId, 'players', targetPlayerId);
                const targetPlayerDoc = await transaction.get(targetPlayerRef);
                if (!targetPlayerDoc.exists()) throw new Error("Target player not found");
                const targetPlayer = targetPlayerDoc.data() as Player;
                const hand = targetPlayer.hand;
                if(hand.length > 0) {
                    const cardToRemoveIndex = Math.floor(Math.random() * hand.length);
                    hand.splice(cardToRemoveIndex, 1);
                    transaction.update(targetPlayerRef, { hand: hand });
                }
                break;
            }
            case 'DE': { // Destiny Card
                const targetCardIndex = target as number;
                let newDeck = [...game.deck];
                const CARD_VALUES = getCardValues(game.gameMode);

                // Find the index of the first available number card in the deck
                const replacementCardIndex = newDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
                if (replacementCardIndex === -1) {
                    throw new Error("No number cards left in the deck to use for Destiny.");
                }
                
                // Remove the card from the deck and use it
                const newCard = newDeck.splice(replacementCardIndex, 1)[0];

                const newTargetCards = [...game.targetCards];
                newTargetCards[targetCardIndex] = newCard;

                // Re-evaluate the target number based on the new cards
                const cardValues = newTargetCards.map(c => CARD_VALUES[c.rank] as number);
                const newTargetNumber = parseInt(cardValues.join(''), 10);
                
                if (isNaN(newTargetNumber)) {
                    throw new Error("Destiny card created an invalid target number.");
                }

                transaction.update(gameRef, {
                    targetCards: newTargetCards,
                    targetNumber: newTargetNumber,
                    deck: newDeck
                });
                turnShouldAdvance = false; // Player does not pass their turn
                break;
            }
        }

        // For cards that end the turn, mark the player as having passed.
        if (turnShouldAdvance) {
            const actingPlayerRef = doc(db, 'games', gameId, 'players', playerId);
            transaction.update(actingPlayerRef, { passed: true });
        }
    });

     // After resolving, advance the turn if necessary
    if (turnShouldAdvance) {
        await advanceTurn(gameId);
    }
});

export const endSpecialAction = ai.defineFlow({ name: 'endSpecialAction', inputSchema: EndSpecialActionInputSchema}, async ({ gameId }) => {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        gameState: 'playerTurn',
        specialAction: null
    });
});
