
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
import { Game, Player, GameState, GameMode } from '@/lib/types';
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
const StartGameInputSchema = z.object({ gameId: z.string(), gameMode: z.enum(['easy', 'pro']), numberOfPlayers: z.number() });
const SetGameModeInputSchema = z.object({ gameId: z.string(), mode: z.enum(['easy', 'pro']) });

const PlayerActionInputSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  action: z.enum(['submit', 'pass']),
  equation: z.optional(z.array(z.union([z.string(), z.number()]))),
  cardsUsedCount: z.optional(z.number()),
});


// Flows
export const createGame = ai.defineFlow({ name: 'createGame', inputSchema: CreateGameInputSchema, outputSchema: z.string() }, async ({ creatorName }) => {
  let gameId: string;
  let gameDoc;
  let gameRef;

  do {
    gameId = generateShortId();
    gameRef = doc(db, 'games', gameId);
    gameDoc = await getDoc(gameRef);
  } while (gameDoc.exists());

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
  });
});

export const setGameMode = ai.defineFlow({ name: 'setGameMode', inputSchema: SetGameModeInputSchema}, async ({ gameId, mode }) => {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { gameMode: mode });
});

export const startGame = ai.defineFlow({ name: 'startGame', inputSchema: StartGameInputSchema }, async ({ gameId }) => {
  await runTransaction(db, async (transaction) => {
    // Read phase
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    const game = gameDoc.data() as Game;

    const playersQuery = query(collection(db, 'games', gameId, 'players'));
    const playerDocsSnap = await getDocs(playersQuery);
    const players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));

    // Write phase
    const deckCount = players.length > 4 ? 2 : 1;
    let freshDeck = shuffleDeck(createDeck(deckCount));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode);
    freshDeck = updatedDeck;
    
    const firstPlayerId = game.players[0];
    
    // Deal 5 cards to each player
    players.forEach(p => {
        const cardsToDeal = p.id === firstPlayerId ? 6 : 5;
        const hand = freshDeck.splice(0, cardsToDeal);
        const playerRef = doc(db, 'games', gameId, 'players', p.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });

    transaction.update(gameRef, {
        gameState: 'playerTurn',
        deck: freshDeck,
        targetNumber: target,
        targetCards: cardsUsed,
        currentPlayerId: firstPlayerId,
        currentRound: 1,
    });
  });
});


async function advanceTurn(gameId: string) {
    await runTransaction(db, async (transaction) => {
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

        if (allPlayersHaveActed) {
            // End of the round. Tally scores.
            const highestScore = Math.max(...players.map(p => p.roundScore));
            const winners = players.filter(p => p.roundScore === highestScore);
            
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
            const nextPlayerRef = doc(db, 'games', gameId, 'players', nextPlayerId);
            const nextPlayer = players.find(p => p.id === nextPlayerId!);
            let newDeck = game.deck;

            if (nextPlayer && newDeck.length > 0) {
                const newHand = [...nextPlayer.hand, newDeck.shift()!];
                transaction.update(nextPlayerRef, { hand: newHand });
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

      const result = evaluateEquation(equation, game.gameMode);
      if (typeof result === 'object' && result.error) {
        // This should be caught client-side, but as a fallback.
        throw new Error(`Invalid equation submitted: ${result.error}`);
      }

      if (typeof result === 'number') {
        const newScore = calculateScore(result, game.targetNumber, cardsUsedCount);
        transaction.update(playerRef, {
          roundScore: newScore,
          finalResult: result,
          equation: equation,
          passed: true, // Submitting also means you are done for the turn cycle
        });
      }
    } else { // action === 'pass'
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
    // Read phase
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    let game = gameDoc.data() as Game;
    
    if (game.currentRound >= game.totalRounds) {
      transaction.update(gameRef, { gameState: 'gameOver' });
      return;
    }
    
    const playersQuery = query(collection(db, 'games', gameId, 'players'));
    const playerDocsSnap = await getDocs(playersQuery);
    const players = playerDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Player));

    // Write phase
    const deckCount = players.length > 4 ? 2 : 1;
    let freshDeck = shuffleDeck(createDeck(deckCount));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode);
    freshDeck = updatedDeck;
    
    const firstPlayerId = game.players[0];
    
    // Reset players for the new round and deal 5 cards
    players.forEach(p => {
        const hand = freshDeck.splice(0, 5);
        const playerRef = doc(db, 'games', gameId, 'players', p.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });

    // Deal starting card to first player
    if (freshDeck.length > 0) {
      const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
      const firstPlayerDoc = players.find(p => p.id === firstPlayerId);
      if (firstPlayerDoc) {
          const startingHand = firstPlayerDoc.hand.slice(0,5);
          const newHand = [...startingHand, freshDeck.shift()!];
          transaction.update(firstPlayerRef, { hand: newHand });
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
  });
});

export const rematch = ai.defineFlow({ name: 'rematch', inputSchema: GameIdInputSchema, outputSchema: z.string() }, async ({ gameId }) => {
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
        // Need to check for existing player name in the new game lobby to prevent duplicates.
        // For simplicity in rematch, we assume names are unique from the original game.
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

    return newGameId;
});

    

    