
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
import { createDeck, shuffleDeck, generateTarget, calculateScore, evaluateEquation } from '@/lib/game';

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
  cardsUsedCount: z.optional(z.number()),
});

const SpecialActionInputSchema = z.object({
    gameId: z.string(),
    playerId: z.string(),
    card: z.object({
        suit: z.string(),
        rank: z.string(),
    }),
    target: z.optional(z.any()),
});

const EndSpecialActionInputSchema = z.object({
    gameId: z.string(),
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
    await updateDoc(gameRef, { gameMode: mode });
    console.log(`[setGameMode] Game mode for ${gameId} set to ${mode}`);
});

export const startGame = ai.defineFlow({ name: 'startGame', inputSchema: StartGameInputSchema }, async ({ gameId }) => {
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
    console.log(`[startGame] Found ${players.length} players.`);

    // Write phase
    const deckCount = players.length > 4 ? 2 : 1;
    let freshDeck = shuffleDeck(createDeck(deckCount, game.gameMode));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode);
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
            const highestScore = Math.max(...players.map(p => p.roundScore));
            const winners = players.filter(p => p.roundScore === highestScore);
            console.log(`[advanceTurn] Round over. Highest score: ${highestScore}. Winners:`, winners.map(w => w.name));
            
            // It's possible for everyone to pass and score 0, which is a draw with no points.
            const roundWinnerIds = highestScore > 0 ? winners.map(w => w.id) : [];

            players.forEach(p => {
                const playerRef = doc(db, 'games', gameId, 'players', p.id);
                transaction.update(playerRef, { totalScore: p.totalScore + p.roundScore });
            });

            transaction.update(gameRef, {
                gameState: 'roundOver',
                roundWinnerIds,
            });
            console.log(`[advanceTurn] Game state set to 'roundOver'.`);
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
    if (!gameDoc.exists()) throw new Error("Game not found");
    const game = gameDoc.data() as Game;

    if (game.currentPlayerId !== playerId) {
      console.warn(`[playerAction] Ignoring action from player ${playerId} because it's not their turn.`);
      return;
    }

    if (action === 'submit') {
      const { equation, cardsUsedCount } = input;
      if (equation === undefined || cardsUsedCount === undefined) {
        throw new Error("Submit action requires equation and cardsUsedCount.");
      }
      console.log(`[playerAction] Player ${playerId} submitted equation:`, equation);

      const result = evaluateEquation(equation, game.gameMode);
      if (typeof result === 'object' && result.error) {
        // This should be caught client-side, but as a fallback.
        throw new Error(`Invalid equation submitted: ${result.error}`);
      }
      console.log(`[playerAction] Equation result: ${result}`);

      if (typeof result === 'number') {
        const newScore = calculateScore(result, game.targetNumber, cardsUsedCount);
        console.log(`[playerAction] Calculated score for ${playerId}: ${newScore}`);
        transaction.update(playerRef, {
          roundScore: newScore,
          finalResult: result,
          equation: equation,
          passed: true, // Submitting also means you are done for the turn cycle
        });
      }
    } else { // action === 'pass'
        console.log(`[playerAction] Player ${playerId} passed.`);
        transaction.update(playerRef, {
          passed: true, 
          equation: [], 
          finalResult: 0, 
          roundScore: 0 
        });
    }
  });

  // Now that the player's action is committed, advance the turn.
  await advanceTurn(gameId);
});

export const nextRound = ai.defineFlow({ name: 'nextRound', inputSchema: GameIdInputSchema }, async ({ gameId }) => {
  await runTransaction(db, async (transaction) => {
    console.log(`[nextRound] Starting next round for game ${gameId}`);
    // Read phase
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    let game = gameDoc.data() as Game;
    
    if (game.currentRound >= game.totalRounds) {
      console.log(`[nextRound] Game over. Setting state to 'gameOver'.`);
      transaction.update(gameRef, { gameState: 'gameOver' });
      return;
    }
    
    const playersQuery = query(collection(db, 'games', gameId, 'players'));
    const playerDocsSnap = await getDocs(playersQuery);
    const players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));

    // Write phase
    const deckCount = players.length > 4 ? 2 : 1;
    let freshDeck = shuffleDeck(createDeck(deckCount, game.gameMode));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode);
    freshDeck = updatedDeck;
    console.log(`[nextRound] New target: ${target}.`);
    
    const firstPlayerId = game.players[0];
    
    const dealtHands: Record<string, Card[]> = {};
    // Reset players for the new round and deal 5 cards
    players.forEach(p => {
        const hand = freshDeck.splice(0, 5);
        dealtHands[p.id] = hand;
        const playerRef = doc(db, 'games', gameId, 'players', p.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });

    // Deal starting card to first player
    if (freshDeck.length > 0) {
      const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
      const firstPlayerHand = dealtHands[firstPlayerId];
      if (firstPlayerHand) {
          const newHand = [...firstPlayerHand, freshDeck.shift()!];
          transaction.update(firstPlayerRef, { hand: newHand });
          console.log(`[nextRound] Dealt starting card to first player ${firstPlayerId}.`);
      }
    }

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
      totalRounds: 3,
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

        // Remove card from hand
        const cardIndex = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        if (cardIndex === -1) throw new Error("Card not in hand");
        const newHand = [...player.hand];
        newHand.splice(cardIndex, 1);
        transaction.update(playerRef, { hand: newHand });

        const cardRank = card.rank as 'CL' | 'SB' | 'SH' | 'DE';
        
        if (cardRank === 'SH') { // Shuffle Card - action is immediate
            let newDeck = [...game.deck];
            const cardsToDraw = player.hand.length - 1; // -1 because we removed the shuffle card
            const newCards = newDeck.splice(0, cardsToDraw);
            transaction.update(playerRef, { hand: newCards });
            transaction.update(gameRef, { deck: newDeck });
            await advanceTurn(gameId); // End turn after shuffling
        } else {
             // For other cards, set game state to get more input
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
                const player = playerDoc.data() as Player;
                const clonedCard = target as Card;
                const newHand = [...player.hand, clonedCard];
                transaction.update(playerRef, { hand: newHand });
                break;
            }
            case 'SB': { // Sabotage Card
                const targetPlayerId = target as string;
                const targetPlayerRef = doc(db, 'games', gameId, 'players', targetPlayerId);
                const targetPlayerDoc = await transaction.get(targetPlayerRef);
                const targetPlayer = targetPlayerDoc.data() as Player;
                const hand = targetPlayer.hand;
                const cardToRemoveIndex = Math.floor(Math.random() * hand.length);
                hand.splice(cardToRemoveIndex, 1);
                transaction.update(targetPlayerRef, { hand: hand });
                break;
            }
            case 'DE': { // Destiny Card
                const targetCardIndex = target as number;
                let newDeck = [...game.deck];
                const newCard = newDeck.shift()!;
                const newTargetCards = [...game.targetCards];
                newTargetCards[targetCardIndex] = newCard;

                const { target: newTargetNumber } = generateTarget(newDeck, game.gameMode);
                
                transaction.update(gameRef, {
                    targetCards: newTargetCards,
                    targetNumber: newTargetNumber,
                    deck: newDeck
                });
                break;
            }
        }
        
    });
     // After resolving, advance the turn
    await advanceTurn(gameId);
});

export const endSpecialAction = ai.defineFlow({ name: 'endSpecialAction', inputSchema: EndSpecialActionInputSchema}, async ({ gameId }) => {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        gameState: 'playerTurn',
        specialAction: null
    });
});
