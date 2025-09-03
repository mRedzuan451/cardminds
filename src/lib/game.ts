
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

export function createDeck(mode: GameMode, playerCount: number, allowedSpecialRanks: Rank[] = SPECIAL_RANKS): Card[] {
    const deck: Card[] = [];
    const deckCount = playerCount >= 4 ? 2 : 1;

    for (let i = 0; i < deckCount; i++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ id: `deck-${i}-${suit}-${rank}`, suit, rank });
            }
        }
    }

    if (mode === 'special') {
        const specialDecks = playerCount >= 4 ? 2 : 1;
        for (let i = 0; i < specialDecks; i++) {
            for (const rank of allowedSpecialRanks) {
                // Add two of each special card per deck
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
    
    // Safety check to prevent infinite loops if deck is unworkable
    let attempts = 0;

    while ((result === null || !Number.isInteger(result) || result <= 0 || result > 100) && attempts < 50) {
        attempts++;
        const tempDeck = [...currentDeck]; // Operate on a copy for each attempt
        
        const numIndex1 = tempDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        if (numIndex1 === -1) continue;
        let numCard1 = tempDeck.splice(numIndex1, 1)[0];
        
        const opIndex = tempDeck.findIndex(c => CARD_VALUES[c.rank] === '+' || CARD_VALUES[c.rank] === '-');
        if (opIndex === -1) {
            continue;
        }
        const opCard = tempDeck.splice(opIndex, 1)[0];

        const numIndex2 = tempDeck.findIndex(c => typeof CARD_VALUES[c.rank] === 'number');
        if (numIndex2 === -1) {
            continue;
        }
        let numCard2 = tempDeck.splice(numIndex2, 1)[0];
        
        let term1 = CARD_VALUES[numCard1.rank] as number;
        const operator = CARD_VALUES[opCard.rank] as string;
        let term3 = CARD_VALUES[numCard2.rank] as number;

        if (operator === '-' && term1 < term3) {
            [numCard1, numCard2] = [numCard2, numCard1];
            [term1, term3] = [term3, term1];
        }
        
        const tempCardsUsed = [numCard1, opCard, numCard2];
        const equation = [term1, operator, term3];
        const evalResult = evaluateEquation(equation, 'easy');

        if (typeof evalResult === 'number' && evalResult > 0 && evalResult <= 100 && Number.isInteger(evalResult)) {
            result = evalResult;
            cardsUsed = tempCardsUsed;
            // If we found a valid result, update the main deck
            const cardsUsedIds = new Set(cardsUsed.map(c => c.id));
            currentDeck = deck.filter(c => !cardsUsedIds.has(c.id));
        } else {
            result = null;
        }
    }
    
    if (result === null || cardsUsed.length === 0) {
      // Fallback if no suitable target could be generated
      console.warn("[generateEasyTarget] Could not generate a valid target. Defaulting to 10.");
      return { target: 10, cardsUsed: [], updatedDeck: deck };
    }

    return { target: result, cardsUsed, updatedDeck: currentDeck };
}

function generateProTarget(deck: Card[], mode: GameMode): { target: number; cardsUsed: Card[], updatedDeck: Card[] } {
  let currentDeck = [...deck];
  const CARD_VALUES = getCardValues(mode);
  
  const numberCards = currentDeck.filter(c => typeof CARD_VALUES[c.rank] === 'number' && c.suit !== 'Special');
  
  if (numberCards.length < 2) {
    return generateEasyTarget(deck, mode);
  }

  const card1Index = Math.floor(Math.random() * numberCards.length);
  let card1 = numberCards[card1Index]; 
  
  let card2Index = Math.floor(Math.random() * numberCards.length);
  while (card2Index === card1Index) {
      card2Index = Math.floor(Math.random() * numberCards.length);
  }
  let card2 = numberCards[card2Index];
  
  const val1 = CARD_VALUES[card1.rank] as number;
  const val2 = CARD_VALUES[card2.rank] as number;

  const target = parseInt(`${val1}${val2}`, 10);
  
  if (isNaN(target)) {
    return generateEasyTarget(deck, mode);
  }
  
  const cardsUsed = [card1, card2];
  const cardsUsedIds = new Set(cardsUsed.map(c => c.id));
  const updatedDeck = currentDeck.filter(c => !cardsUsedIds.has(c.id));

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
    return isNaN(fallbackResult.target) ? { ...fallbackResult, target: 10 } : fallbackResult;
  }
  
  return result;
}

export function evaluateEquation(equation: EquationTerm[], mode: GameMode): number | { error: string } {
    if (equation.length === 0) return { error: "Equation is empty." };

    if (mode === 'easy' && equation.length === 1 && typeof equation[0] === 'number') {
        return equation[0];
    }
    if (mode === 'easy') {
         if (equation.length < 3) {
            return { error: "An equation must have at least 3 terms." };
         }
         for(let i=0; i<equation.length; i++) {
            const term = equation[i];
            const isEven = i % 2 === 0;
            if (isEven && typeof term !== 'number') {
                 return { error: `Invalid syntax. Expected a number at position ${i+1}.`};
            }
            if (!isEven && typeof term !== 'string') {
                return { error: `Invalid syntax. Expected an operator at position ${i+1}.`};
            }
         }
    }


    let terms = [...equation];

    try {
        // Auto-insert multiplication for Pro/Special modes where numbers are next to parentheses
        if (mode === 'pro' || mode === 'special') {
            const newTerms: EquationTerm[] = [];
            for (let i = 0; i < terms.length; i++) {
                const currentTerm = terms[i];
                const nextTerm = terms[i + 1];
                newTerms.push(currentTerm);
                if (
                    (typeof currentTerm === 'number' && nextTerm === '(') ||
                    (currentTerm === ')' && typeof nextTerm === 'number') ||
                    (currentTerm === ')' && nextTerm === '(')
                ) {
                    newTerms.push('*');
                }
            }
            terms = newTerms;
        }

        // Handle Power of 2 (**) as a unary operator applied to the preceding number/group
        let powerProcessedTerms: EquationTerm[] = [];
        let i = 0;
        while (i < terms.length) {
            if (terms[i] === '**') {
                const base = powerProcessedTerms.pop();

                if (base === ')') {
                    let parenCount = 1;
                    const expressionInParen: EquationTerm[] = [')'];
                    while(parenCount > 0 && powerProcessedTerms.length > 0) {
                        const popped = powerProcessedTerms.pop();
                        expressionInParen.unshift(popped!);
                        if (popped === '(') parenCount--;
                        if (popped === ')') parenCount++;
                    }
                     if (parenCount !== 0) {
                        return { error: "Mismatched parentheses with power operator." };
                    }
                    const subExpression = expressionInParen.slice(1, -1);
                    const subResult = evaluateEquation(subExpression, mode);
                    if (typeof subResult === 'object' && subResult.error) {
                        return subResult;
                    }
                    powerProcessedTerms.push(Math.pow(subResult as number, 2));

                } else if (typeof base === 'number') {
                    powerProcessedTerms.push(Math.pow(base, 2));
                }
                else {
                    return { error: "Power operator must follow a number or a group." };
                }
                i++;
            } else {
                powerProcessedTerms.push(terms[i]);
                i++;
            }
        }
        terms = powerProcessedTerms;

        const expression = terms.join(' ').replace(/\s{2,}/g, ' ');

        // Final validation before eval
        const openParen = (expression.match(/\(/g) || []).length;
        const closeParen = (expression.match(/\)/g) || []).length;
        if (openParen !== closeParen) {
            return { error: 'Mismatched parentheses.' };
        }
        // Allows numbers, parentheses, and the basic operators.
        if (/[^0-9\s()+\-*/.]/.test(expression)) {
            return { error: 'Invalid characters in equation.'};
        }
        // Prevents things like `5 * * 2`
        if (/[\+\-\*\/]\s*[\+\-\*\/]/.test(expression)) {
            return { error: 'Consecutive operators are not allowed.' };
        }
        // Prevents empty parentheses `()` or `( )`
        if (/\(\s*\)/.test(expression)) {
            return { error: 'Empty parentheses are not allowed.' };
        }


        // Using a Function constructor for safer evaluation than direct eval()
        const result = new Function(`return ${expression}`)();

        if (typeof result !== 'number' || !isFinite(result)) {
            return { error: 'Invalid calculation result.' };
        }

        return result;

    } catch (e: any) {
        console.error("Equation evaluation error:", e);
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
