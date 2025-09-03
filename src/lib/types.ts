
export type Suit = 'Spades' | 'Hearts' | 'Diamonds' | 'Clubs' | 'Special';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'CL' | 'SB' | 'SH' | 'DE';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type Hand = Card[];

export type EquationTerm = number | string; // e.g., 5, '+', 10

export type GameMode = 'easy' | 'pro' | 'special';

export interface Player {
    id: string; // Corresponds to Firebase Auth UID in the future
    name: string;
    hand: Hand;
    roundScore: number;
    totalScore: number;
    passed: boolean;
    finalResult: number;
    equation: EquationTerm[];
    cardsUsed?: Card[];
}

export type GameState = 'lobby' | 'playerTurn' | 'roundOver' | 'gameOver' | 'specialAction' | 'discarding';

export interface Game {
    id: string;
    creatorId: string;
    gameState: GameState;
    gameMode: GameMode;
    players: string[]; // list of player IDs
    maxPlayers: number;
    deck: Card[];
    targetNumber: number;
    targetCards: Card[];
    currentPlayerId: string;
    currentRound: number;
    totalRounds: number;
    targetScore: number;
    roundWinnerIds?: string[];
    nextGameId?: string;
    specialAction?: {
        playerId: string;
        cardRank: 'CL' | 'SB' | 'SH' | 'DE';
    };
    discardingPlayerId?: string | null;
    allowedSpecialCards?: Rank[];
    lastSpecialCardPlay?: {
        cardRank: 'CL' | 'SB' | 'SH' | 'DE';
        playerName: string;
        targetPlayerName?: string;
        timestamp: number;
    } | null;
}
