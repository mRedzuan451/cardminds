
'use server';
/**
 * @fileOverview Game actions managed by Genkit flows.
 * This file contains all the server-side logic for the CardCalc game.
 * It uses Firebase Firestore to store and manage the game state in real-time.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, runTransaction, arrayUnion, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { firebaseApp } from '@/lib/firebase';
import { Game, Player, GameState, GameMode } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, calculateScore } from '@/lib/game';

const db = getFirestore(firebaseApp);

// Schemas
const CreateGameInputSchema = z.object({ creatorName: z.string() });
const GameIdInputSchema = z.object({ gameId: z.string() });
const JoinGameInputSchema = z.object({ gameId: z.string(), playerName: z.string() });
const StartGameInputSchema = z.object({ gameId: z.string(), gameMode: z.enum(['easy', 'pro']), numberOfPlayers: z.number() });
const SetGameModeInputSchema = z.object({ gameId: z.string(), mode: z.enum(['easy', 'pro']) });
const PlayerActionInputSchema = z.object({ gameId: z.string(), playerId: z.string() });
const SubmitEquationInputSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  equation: z.array(z.union([z.string(), z.number()])),
  result: z.number(),
  cardsUsedCount: z.number(),
});

// Flows
export const createGame = ai.defineFlow({ name: 'createGame', inputSchema: CreateGameInputSchema, outputSchema: z.string() }, async ({ creatorName }) => {
  const gamesRef = collection(db, 'games');
  const newGameRef = doc(gamesRef);
  const gameId = newGameRef.id;

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
    passCount: 0,
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
  batch.set(newGameRef, initialGameData);
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

export const startGame = ai.defineFlow({ name: 'startGame', inputSchema: StartGameInputSchema }, async ({ gameId, gameMode }) => {
  const gameRef = doc(db, 'games', gameId);
  
  await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error("Game not found");
      const game = gameDoc.data() as Game;

      const playersRef = collection(db, 'games', gameId, 'players');
      const playerDocs = await getDocs(playersRef);
      const players = playerDocs.docs.map(doc => ({ ...doc.data(), id: doc.id } as Player));

      const deckCount = players.length > 4 ? 2 : 1;
      let freshDeck = shuffleDeck(createDeck(deckCount));
      const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, gameMode);

      freshDeck = updatedDeck;
      
      players.forEach(player => {
          const hand = freshDeck.splice(0, 5);
          const playerRef = doc(db, 'games', gameId, 'players', player.id);
          transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
      });

      // Player 1 draws a card to start
      const firstPlayerId = game.players[0];
      if (firstPlayerId && freshDeck.length > 0) {
        const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
        const firstPlayerDoc = players.find(p => p.id === firstPlayerId);
        if(firstPlayerDoc) {
            const newHand = [...firstPlayerDoc.hand, ...freshDeck.splice(0,5), freshDeck.shift()!];
            transaction.update(firstPlayerRef, { hand: newHand });
        }
      }

      transaction.update(gameRef, {
        gameState: 'playerTurn',
        deck: freshDeck,
        targetNumber: target,
        targetCards: cardsUsed,
        currentPlayerId: game.players[0],
        currentRound: 1,
        passCount: 0
      });
  });
});

async function advanceTurn(gameId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found");
        
        let game = gameDoc.data() as Game;
        const playersRef = collection(db, 'games', gameId, 'players');
        const playerDocs = await getDocs(playersRef);
        let players = playerDocs.docs.map(d => ({...d.data(), id: d.id})) as Player[];
        // Reorder players to match game.players array order
        players.sort((a,b) => game.players.indexOf(a.id) - game.players.indexOf(b.id));

        const currentPlayerIndex = game.players.indexOf(game.currentPlayerId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
        const nextPlayerId = game.players[nextPlayerIndex];

        // Check if all players have passed
        const allPlayersPassed = players.every(p => p.passed);
        if (allPlayersPassed) {
             players.forEach(p => {
                 const newHand = [...p.hand];
                 if (game.deck.length > 0) {
                     newHand.push(game.deck.shift()!);
                 }
                 const playerRef = doc(db, 'games', gameId, 'players', p.id);
                 transaction.update(playerRef, { hand: newHand, passed: false });
             });
             transaction.update(gameRef, { currentPlayerId: game.players[0], passCount: 0, deck: game.deck });
             return;
        }

        const isRoundOver = players.filter(p => !p.passed).length === 0;

        if (isRoundOver) {
            const highestScore = Math.max(...players.map(p => p.roundScore));
            const winners = players.filter(p => p.roundScore === highestScore);
            
            players.forEach(p => {
                const playerRef = doc(db, 'games', gameId, 'players', p.id);
                transaction.update(playerRef, { totalScore: p.totalScore + p.roundScore });
            });

            transaction.update(gameRef, {
                gameState: 'roundOver',
                roundWinnerIds: winners.map(w => w.id),
            });
        } else { // It's just the next player's turn
            const nextPlayerRef = doc(db, 'games', gameId, 'players', nextPlayerId);
            const nextPlayerDoc = players.find(p => p.id === nextPlayerId);
            
            if (nextPlayerDoc) {
                const newHand = [...nextPlayerDoc.hand];
                if (game.deck.length > 0) {
                    newHand.push(game.deck.shift()!);
                }
                transaction.update(nextPlayerRef, { hand: newHand });
            }
            transaction.update(gameRef, { currentPlayerId: nextPlayerId, deck: game.deck });
        }
    });
}


export const submitEquation = ai.defineFlow({ name: 'submitEquation', inputSchema: SubmitEquationInputSchema }, async ({ gameId, playerId, equation, result, cardsUsedCount }) => {
  await runTransaction(db, async (transaction) => {
    const gameRef = doc(db, 'games', gameId);
    const playerRef = doc(db, 'games', gameId, 'players', playerId);
    
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    const game = gameDoc.data() as Game;

    const newScore = calculateScore(result, game.targetNumber, cardsUsedCount);

    transaction.update(playerRef, {
      roundScore: newScore,
      finalResult: result,
      equation: equation,
      passed: true, // Mark as passed to signify turn is over
    });
  });
  await advanceTurn(gameId);
});

export const passTurn = ai.defineFlow({ name: 'passTurn', inputSchema: PlayerActionInputSchema }, async ({ gameId, playerId }) => {
    await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, 'games', gameId, 'players', playerId);
        const gameRef = doc(db, 'games', gameId);

        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found");
        const game = gameDoc.data() as Game;

        transaction.update(playerRef, { passed: true, equation: [], finalResult: 0, roundScore: 0 });
        transaction.update(gameRef, { passCount: game.passCount + 1 });
    });
    await advanceTurn(gameId);
});

export const nextRound = ai.defineFlow({ name: 'nextRound', inputSchema: GameIdInputSchema }, async ({ gameId }) => {
  await runTransaction(db, async (transaction) => {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found");
    let game = gameDoc.data() as Game;

    if (game.currentRound >= game.totalRounds) {
      transaction.update(gameRef, { gameState: 'gameOver' });
      return;
    }
    
    const playersRef = collection(db, 'games', gameId, 'players');
    const playerDocs = await getDocs(playersRef);
    let players = playerDocs.docs.map(d => ({...d.data(), id: d.id})) as Player[];

    const deckCount = players.length > 4 ? 2 : 1;
    let freshDeck = shuffleDeck(createDeck(deckCount));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, game.gameMode);

    freshDeck = updatedDeck;

    players.forEach(p => {
        const hand = freshDeck.splice(0, 5);
        const playerRef = doc(db, 'games', gameId, 'players', p.id);
        transaction.update(playerRef, { hand, roundScore: 0, passed: false, finalResult: 0, equation: [] });
    });
    
    // Start of new round, first player draws a card
    const firstPlayerId = game.players[0];
    if (firstPlayerId && freshDeck.length > 0) {
        const firstPlayerRef = doc(db, 'games', gameId, 'players', firstPlayerId);
        const firstPlayerDoc = players.find(p => p.id === firstPlayerId)!;
        const currentHand = firstPlayerDoc.hand.length > 0 ? firstPlayerDoc.hand : freshDeck.splice(0,5);
        const newHand = [...currentHand, freshDeck.shift()!];
        transaction.update(firstPlayerRef, { hand: newHand });
    }

    transaction.update(gameRef, {
      gameState: 'playerTurn',
      deck: freshDeck,
      targetNumber: target,
      targetCards: cardsUsed,
      currentPlayerId: game.players[0],
      currentRound: game.currentRound + 1,
      passCount: 0,
      roundWinnerIds: [],
    });
  });
});
