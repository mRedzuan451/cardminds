export type Suit = 'Spades' | 'Hearts' | 'Diamonds' | 'Clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Hand = Card[];

export type EquationTerm = number | string; // e.g., 5, '+', 10
