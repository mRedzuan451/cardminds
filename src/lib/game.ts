
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
    ...PRO_CARD_VALUES,
    'K': '**' // Power of
};


export function getCardValues(mode: GameMode): Record<Rank, EquationTerm> {
    if (mode === 'special') return SPECIAL_CARD_VALUES;
    if (mode === 'pro') return PRO_CARD_VALUES;
    return EASY_CARD_VALUES;
}

export function createDeck(mode: GameMode, playerCount: number): Card[] {
    let deck: Card[] = [];
    // Use 2 decks for 4 or more players
    const deckCount = playerCount >= 4 ? 2 : 1;

    // Create the standard card decks
    for (let i = 0; i < deckCount; i++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                // Generate a guaranteed unique ID
                deck.push({ id: `deck-${i}-${suit}-${rank}`, suit, rank });
            }
        }
    }

    // Add special cards for "Special" mode
    if (mode === 'special') {
        const setsOfSpecialCards = deckCount;
        
        for (let i = 0; i < setsOfSpecialCards; i++) {
            // Add a set of 2 of each special card type
            for (const rank of SPECIAL_RANKS) {
                deck.push({ id: `deck-${i}-special-${rank}-1`, suit: 'Special', rank });
                deck.push({ id: `deck-${i}-special-${rank}-2`, suit: 'Special', rank });
            }
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
        currentDeck = shuffleDeck([...deck]); // Use a shuffled copy of the actual game deck
        
        const numIndex1 = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        if (numIndex1 === -1) continue;
        let numCard1 = currentDeck.splice(numIndex1, 1)[0];
        
        const opIndex = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'string' && CARD_VALUES[c.rank] !== '/' && CARD_VALUES[c.rank] !== '**' && c.suit !== 'Special');
        if (opIndex === -1) {
            currentDeck.push(numCard1); // put card back
            continue;
        }
        const opCard = currentDeck.splice(opIndex, 1)[0];

        const numIndex2 = currentDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        if (numIndex2 === -1) {
            currentDeck.push(numCard1, opCard); // put cards back
            continue;
        }
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

        if (result === null) {
            // If we failed for any reason, put the cards back in the deck to try again
             deck.push(...cardsUsed);
        }
    }

    // The cards are already removed from currentDeck during the loop
    return { target: result, cardsUsed, updatedDeck: currentDeck };
}

function generateProTarget(deck: Card[], mode: GameMode): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
  let currentDeck = [...deck];
  const CARD_VALUES = getCardValues(mode);
  
  // Create a temporary list of number cards to choose from for the target
  const numberCards = currentDeck.filter(c => typeof CARD_VALUES[c.rank] === 'number' && c.suit !== 'Special');
  
  // If we don't have enough number cards, fall back to easy generation
  if (numberCards.length < 2) {
    return generateEasyTarget(deck, mode);
  }

  // Randomly select two distinct number cards for the target
  const card1Index = Math.floor(Math.random() * numberCards.length);
  let card1 = numberCards[card1Index]; 
  
  // Make sure second card is different
  let card2Index = Math.floor(Math.random() * numberCards.length);
  while (card2Index === card1Index) {
      card2Index = Math.floor(Math.random() * numberCards.length);
  }
  let card2 = numberCards[card2Index];
  
  const val1 = CARD_VALUES[card1.rank] as number;
  const val2 = CARD_VALUES[card2.rank] as number;

  const target = parseInt(`${val1}${val2}`, 10);
  const cardsUsed = [card1, card2];
  
  // Now, create the final updated deck by removing ONLY the cards used for the target from the ORIGINAL deck
  const cardsUsedIds = new Set(cardsUsed.map(c => c.id));
  const updatedDeck = currentDeck.filter(c => !cardsUsedIds.has(c.id));

  if (isNaN(target)) {
    return generateEasyTarget(deck, mode);
  }

  return { target, cardsUsed, updatedDeck };
}


export function generateTarget(deck: Card[], mode: GameMode, playerCount: number): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
  let result;
  if (mode === 'pro' || mode === 'special') {
    result = generateProTarget(deck, mode);
  } else {
    result = generateEasyTarget(deck, mode);
  }

  if (isNaN(result.target)) {
    console.error("[generateTarget] Fallback: Target was NaN, generating easy target instead.");
    const fallbackResult = generateEasyTarget(deck, mode);
    // If even the easy target fails (highly unlikely), default to a safe value.
    return isNaN(fallbackResult.target) ? { ...fallbackResult, target: 10 } : fallbackResult;
  }
  
  return result;
}

export function evaluateEquation(equation: EquationTerm[], mode: GameMode): number | { error: string } {
  if (equation.length === 0) return { error: "Equation is empty." };

  let terms = [...equation];

   // In special mode, handle '**' (power) as a postfix operator needing '2'
  if (mode === 'special') {
    const specialTerms: EquationTerm[] = [];
    for (let i = 0; i < terms.length; i++) {
        const currentTerm = terms[i];
        if (currentTerm === '**') {
            // It becomes power of 2
            specialTerms.push(currentTerm, 2);
        } else {
            specialTerms.push(currentTerm);
        }
    }
    terms = specialTerms;
  }
  
  if (mode === 'pro' || mode === 'special') {
    const newTerms: EquationTerm[] = [];
    for (let i = 0; i < terms.length; i++) {
        const currentTerm = terms[i];
        const nextTerm = terms[i + 1];

        newTerms.push(currentTerm);

        if (typeof currentTerm === 'number' && nextTerm === '(') {
            newTerms.push('*');
        } else if (currentTerm === ')' && typeof nextTerm === 'number') {
            newTerms.push('*');
        } else if (currentTerm === ')' && nextTerm === '(') {
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
    if (op === '**') return 3;
    return 0;
  };

  const applyOp = () => {
    const op = ops.pop();
    if (!op) return;

    if (op === '**') {
      const left = values.pop();
      const right = values.pop(); // In our case, the '2'
       if (left === undefined || right === undefined) {
        throw new Error('Invalid expression for power operation');
      }
      values.push(Math.pow(right, left));
      return;
    }

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
    // Shunting-yard algorithm
    // We process the equation from right to left because of how power of 2 is implemented
    for (let i = terms.length - 1; i >= 0; i--) {
        const term = terms[i];
        if (typeof term === 'number') {
            values.push(term);
        } else if (term === ')') {
            ops.push(term);
        } else if (term === '(') {
            while (ops.length && ops[ops.length - 1] !== ')') {
                applyOp();
            }
            if (ops.length === 0) throw new Error('Mismatched parentheses');
            ops.pop(); // Pop ')'
        } else { // Operator
            while (ops.length && precedence(ops[ops.length - 1]) > precedence(term as string)) {
                applyOp();
            }
            ops.push(term as string);
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
