import type { Suit, Rank, Card, EquationTerm } from './types';

export const SUITS: Suit[] = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const CARD_VALUES: Record<Rank, EquationTerm> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': '+', 'Q': '-', 'K': '*',
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateTarget(): { target: number; cardsUsed: Card[] } {
  const deck = shuffleDeck(createDeck());
  
  const numberCards = deck.filter(c => typeof CARD_VALUES[c.rank] === 'number');
  const operatorCards = deck.filter(c => typeof CARD_VALUES[c.rank] === 'string');

  let result: number | null = null;
  let cardsUsed: Card[] = [];
  
  while (result === null || !Number.isInteger(result) || result < 1 || result > 100) {
      cardsUsed = [
          numberCards[Math.floor(Math.random() * numberCards.length)],
          operatorCards[Math.floor(Math.random() * operatorCards.length)],
          numberCards[Math.floor(Math.random() * numberCards.length)],
      ];

      const [c1, c2, c3] = cardsUsed;
      const term1 = CARD_VALUES[c1.rank];
      const term2 = CARD_VALUES[c2.rank];
      const term3 = CARD_VALUES[c3.rank];
      
      try {
          result = new Function(`return ${term1} ${term2} ${term3}`)();
      } catch (e) {
          result = null;
      }
  }

  return { target: result, cardsUsed };
}

export function evaluateEquation(equation: EquationTerm[]): number | { error: string } {
  if (equation.length === 0) return { error: "Equation is empty." };
  
  for (let i = 0; i < equation.length; i++) {
    const term = equation[i];
    const isEven = i % 2 === 0;
    if (isEven && typeof term !== 'number') return { error: `Invalid equation: Expected a number at position ${i+1}.`};
    if (!isEven && typeof term !== 'string') return { error: `Invalid equation: Expected an operator at position ${i+1}.`};
  }
  if (equation.length % 2 === 0) return { error: "Equation must end with a number." };

  const equationString = equation.join(' ');
  try {
    const result = new Function(`return ${equationString}`)();
    if (typeof result !== 'number' || !isFinite(result)) {
      return { error: 'Invalid calculation result.' };
    }
    return result;
  } catch (e) {
    return { error: 'Invalid mathematical expression.' };
  }
}

export function calculateScore(result: number, target: number, cardsUsed: number): number {
  const difference = Math.abs(result - target);
  if (difference === 0 && cardsUsed > 0) {
    return 1000 - (cardsUsed * 20);
  }
  const score = Math.max(0, 500 - (difference * 10) - (cardsUsed * 20));
  return Math.round(score);
}
