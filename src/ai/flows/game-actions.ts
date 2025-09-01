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
import { createDeck, shuffleDeck, generateTarget, calculateScore } from '@/lib/game';

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
  result: z.optional(z.number()),
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
    
    const playersRef = collection(db, 'games', gameId, 'players');
    const q = query(playersRef, where("name", "==", playerName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        throw new Error("A player with this name is already in the game.");
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
    
    players.forEach(player => {
        const hand = freshDeck.splice(0, 5);
        const playerRef = doc(db, 'games', gameId, 'players', player.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });

    // The first player draws a card to start their turn
    if (freshDeck.length > 0) {
      const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
      const firstPlayer = players.find(p => p.id === firstPlayerId)!;
      const currentHand = firstPlayer.hand.length > 0 ? firstPlayer.hand : freshDeck.splice(0, 5);
      const newHand = [...currentHand, freshDeck.shift()!];
      transaction.update(firstPlayerRef, { hand: newHand });
    }

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
        
        const activePlayers = players.filter(p => !p.passed);

        // ========== WRITE PHASE ==========
        if (activePlayers.length === 0) { // All active players have now passed or submitted
            const highestScore = Math.max(...players.map(p => p.roundScore));
            
            // Case 1: Someone scored, round is over.
            if (highestScore > 0) {
                const winners = players.filter(p => p.roundScore === highestScore);
                players.forEach(p => {
                    const playerRef = doc(db, 'games', gameId, 'players', p.id);
                    transaction.update(playerRef, { totalScore: p.totalScore + p.roundScore });
                });
                transaction.update(gameRef, {
                    gameState: 'roundOver',
                    roundWinnerIds: winners.map(w => w.id),
                });
            } else { // Case 2: Everyone passed with 0 score, deal new cards and continue round.
                let newDeck = game.deck;
                players.forEach(p => {
                    const playerRef = doc(db, 'games', gameId, 'players', p.id);
                    const newHand = [...p.hand];
                    if (newDeck.length > 0) {
                        newHand.push(newDeck.shift()!);
                    }
                    transaction.update(playerRef, { passed: false, hand: newHand });
                });
                
                // The turn stays with the player who triggered the "all-pass" state.
                transaction.update(gameRef, { 
                    deck: newDeck,
                    currentPlayerId: game.currentPlayerId 
                });
            }
        } else { // Case 3: At least one player is still active, advance to the next one.
            const currentPlayerIndex = game.players.indexOf(game.currentPlayerId);
            let nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
            let nextPlayerId = game.players[nextPlayerIndex];
            
            // Find the next player who hasn't passed
            while(players.find(p => p.id === nextPlayerId)?.passed) {
                nextPlayerIndex = (nextPlayerIndex + 1) % game.players.length;
                nextPlayerId = game.players[nextPlayerIndex];
            }
            
            const nextPlayer = players.find(p => p.id === nextPlayerId);
            if (nextPlayer) {
              const nextPlayerRef = doc(db, 'games', gameId, 'players', nextPlayerId);
              const newHand = [...nextPlayer.hand];
              if (game.deck.length > 0) {
                  newHand.push(game.deck.shift()!);
              }
              transaction.update(nextPlayerRef, { hand: newHand });
              transaction.update(gameRef, { currentPlayerId: nextPlayerId, deck: game.deck });
            }
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

    if (action === 'submit') {
      const { equation, result, cardsUsedCount } = input;
      const newScore = calculateScore(result!, game.targetNumber, cardsUsedCount!);
      if (newScore > 0) {
          transaction.update(playerRef, {
            roundScore: newScore,
            finalResult: result,
            equation: equation,
            passed: true,
          });
      } else {
          // If score is 0, treat it as a pass
          transaction.update(playerRef, {
            roundScore: 0,
            finalResult: 0,
            equation: [],
            passed: true,
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

    players.forEach(p => {
        const hand = freshDeck.splice(0, 5);
        const playerRef = doc(db, 'games', gameId, 'players', p.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });

    if (freshDeck.length > 0) {
      const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
      const newHand = [ ...players.find(p => p.id === firstPlayerId)!.hand, freshDeck.shift()!];
      // This is tricky, we need to get the hand dealt above. We will just deal 5 again
      const hand = freshDeck.splice(0,5);
      hand.push(freshDeck.shift()!);
      transaction.update(firstPlayerRef, { hand: hand });
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

export const rematch = ai.defineFlow({ name: 'rematch', inputSchema: GameIdInputSchema }, async ({ gameId }) => {
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
    
    players.forEach(player => {
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
    });

    batch.update(oldGameRef, { nextGameId: newGameId });
    
    await batch.commit();

    return newGameId;
});