
import type { Suit, Rank, Card, EquationTerm, GameMode } from './types';

export const SUITS: Suit[] = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SPECIAL_RANKS: Rank[] = ['CL', 'SB', 'SH', 'DE'];

const BASE_CARD_VALUES: Record<Rank, EquationTerm> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': '+', 'Q': '-', 'K': '*',
  'CL': 'Clone', 'SB': 'Sabotage', 'SH': 'Shuffle', 'DE': 'Destiny'
};

export const PRO_CARD_VALUES: Record<Rank, EquationTerm> = {
    ...BASE_CARD_VALUES,
    'K': '/'
};

export const EASY_CARD_VALUES: Record<Rank, EquationTerm> = {
    ...BASE_CARD_VALUES,
    'K': '*'
};

export const SPECIAL_CARD_VALUES: Record<Rank, EquationTerm> = {
    ...EASY_CARD_VALUES
};


export function getCardValues(mode: GameMode): Record<Rank, EquationTerm> {
    if (mode === 'pro') return PRO_CARD_VALUES;
    if (mode === 'special') return SPECIAL_CARD_VALUES;
    return EASY_CARD_VALUES;
}

export function createDeck(deckCount = 1, mode: GameMode = 'easy'): Card[] {
  let deck: Card[] = [];
  for (let i = 0; i < deckCount; i++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  if (mode === 'special') {
    for (const rank of SPECIAL_RANKS) {
        // Add 2 of each special card
        deck.push({ suit: 'Special', rank });
        deck.push({ suit: 'Special', rank });
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

function generateEasyTarget(deck: Card[], mode: GameMode): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
    let currentDeck = [...deck];
    let result: number | null = null;
    let cardsUsed: Card[] = [];
    const CARD_VALUES = getCardValues(mode);
    
    while (result === null || !Number.isInteger(result) || result <= 0 || result > 100) {
        currentDeck = shuffleDeck(createDeck(1, mode));
        
        const numIndex1 = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        let numCard1 = currentDeck.splice(numIndex1, 1)[0];
        
        const opIndex = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'string' && CARD_VALUES[c.rank] !== '/' && c.suit !== 'Special');
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
            const evalResult = evaluateEquation(equation, 'easy');
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
  const CARD_VALUES = getCardValues('pro');
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


export function generateTarget(deck: Card[], mode: GameMode): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
  if (mode === 'pro') {
    return generateProTarget(deck);
  }
  return generateEasyTarget(deck, mode);
}

export function evaluateEquation(equation: EquationTerm[], mode: GameMode): number | { error: string } {
  if (equation.length === 0) return { error: "Equation is empty." };

  let terms = [...equation];
  
  if (mode === 'pro') {
    const newTerms: EquationTerm[] = [];
    for (let i = 0; i < terms.length; i++) {
        newTerms.push(terms[i]);
        const currentTerm = terms[i];
        const nextTerm = terms[i + 1];
        if (currentTerm === ')' && typeof nextTerm === 'number') {
            newTerms.push('*');
        } else if (typeof currentTerm === 'number' && nextTerm === '(') {
            newTerms.push('*');
        }
    }
    terms = newTerms;
  }

  const values: number[] = [];
  const ops: string[] = [];

  const precedence = (op: string): number => {
    if (op === '+' || op === '-') return 1;
    if (op === '*' || op === '/') return 2;
    return 0;
  };

  const applyOp = () => {
    const op = ops.pop();
    if (!op) return;
    const right = values.pop();
    const left = values.pop();
    if (left === undefined || right === undefined) {
      throw new Error('Invalid expression');
    }
    switch (op) {
      case '+': values.push(left + right); break;
      case '-': values.push(left - right); break;
      case '*': values.push(left * right); break;
      case '/':
        if (right === 0) throw new Error('Division by zero');
        values.push(left / right);
        break;
    }
  };

  try {
    for (const term of terms) {
      if (typeof term === 'number') {
        values.push(term);
      } else if (term === '(') {
        ops.push(term);
      } else if (term === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') {
          applyOp();
        }
        if (ops.length === 0) throw new Error('Mismatched parentheses');
        ops.pop(); // Pop '('.
      } else { // Operator
        while (ops.length && precedence(ops[ops.length - 1]) >= precedence(term)) {
          applyOp();
        }
        ops.push(term);
      }
    }

    while (ops.length) {
      applyOp();
    }

    if (values.length !== 1 || ops.length !== 0) {
        throw new Error('Invalid expression');
    }

    const result = values[0];
    if (typeof result !== 'number' || !isFinite(result)) {
      return { error: 'Invalid calculation result.' };
    }
    return result;

  } catch (e: any) {
    return { error: e.message || 'Invalid mathematical expression.' };
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
