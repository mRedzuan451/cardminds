
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

function generateEasyTarget(deck: Card[]): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
    let currentDeck = [...deck];
    let result: number | null = null;
    let cardsUsed: Card[] = [];
    
    while (result === null || !Number.isInteger(result) || result <= 0 || result > 100) {
        currentDeck = shuffleDeck(createDeck());
        
        const numIndex1 = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        let numCard1 = currentDeck.splice(numIndex1, 1)[0];
        
        const opIndex = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'string');
        const opCard = currentDeck.splice(opIndex, 1)[0];

        const numIndex2 = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        let numCard2 = currentDeck.splice(numIndex2, 1)[0];
        
        let term1 = CARD_VALUES[numCard1.rank] as number;
        const operator = CARD_VALUES[opCard.rank] as string;
        let term3 = CARD_VALUES[numCard2.rank] as number;

        if (operator === '-' && term1 < term3) {
            [numCard1, numCard2] = [numCard2, numCard1];
            [term1, term3] = [term3, term1];
        }
        
        cardsUsed = [numCard1, opCard, numCard2];
        const equation = [term1, operator, term3];

        try {
            const evalResult = evaluateEquation(equation);
            if (typeof evalResult === 'number') {
                result = evalResult;
            } else {
                result = null;
            }
        } catch (e) {
            result = null;
        }
    }

    return { target: result, cardsUsed, updatedDeck: currentDeck };
}

function generateProTarget(deck: Card[]): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
  let currentDeck = [...deck];
  const numberCards = currentDeck.filter(c => typeof CARD_VALUES[c.rank] === 'number');
  
  const card1Index = Math.floor(Math.random() * numberCards.length);
  const card1 = numberCards[card1Index];
  numberCards.splice(card1Index, 1);
  
  const card2Index = Math.floor(Math.random() * numberCards.length);
  const card2 = numberCards[card2Index];

  const val1 = CARD_VALUES[card1.rank] as number;
  const val2 = CARD_VALUES[card2.rank] as number;

  const target = parseInt(`${val1}${val2}`, 10);
  const cardsUsed = [card1, card2];
  
  const updatedDeck = deck.filter(c => !cardsUsed.some(used => used.rank === c.rank && used.suit === c.suit));

  return { target, cardsUsed, updatedDeck };
}


export function generateTarget(deck: Card[], mode: 'easy' | 'pro'): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
  if (mode === 'pro') {
    return generateProTarget(deck);
  }
  return generateEasyTarget(deck);
}

export function evaluateEquation(equation: EquationTerm[]): number | { error: string } {
  if (equation.length === 0) return { error: "Equation is empty." };

  const equationString = equation.join(' ');
  try {
    // Basic validation to prevent arbitrary code execution
    const safeCharsRegex = /^[0-9+\-*/().\s]+$/;
    if (!safeCharsRegex.test(equationString)) {
        return { error: 'Invalid characters in equation.' };
    }

    const result = new Function(`return ${equationString}`)();
    if (typeof result !== 'number' || !isFinite(result)) {
      return { error: 'Invalid calculation result.' };
    }
    return result;
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { error: 'Invalid mathematical expression: Check parentheses and operators.'}
    }
    return { error: 'Invalid mathematical expression.' };
  }
}

export function calculateScore(result: number, target: number, cardsUsed: number): number {
  if (result === 0 && cardsUsed === 0) return 0; // Score for passing
  const difference = Math.abs(result - target);
  if (difference === 0 && cardsUsed > 0) {
    return 1000 - (cardsUsed * 20);
  }
  const score = Math.max(0, 500 - (difference * 10) - (cardsUsed * 20));
  return Math.round(score);
}

    