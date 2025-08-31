'use server';
/**
 * @fileOverview A bot that plays the CardCalc game.
 *
 * - findBestEquation - A function that finds the best equation given a hand and a target.
 * - BotInput - The input type for the findBestEquation function.
 * - BotOutput - The return type for the findBestEquation function.
 */

import { ai } from '@/ai/genkit';
import { EquationTerm, Hand } from '@/lib/types';
import { CARD_VALUES } from '@/lib/game';
import { z } from 'genkit';

const CardSchema = z.object({
  suit: z.enum(['Spades', 'Hearts', 'Diamonds', 'Clubs']),
  rank: z.enum(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']),
});

const BotInputSchema = z.object({
  hand: z.array(CardSchema).describe("The bot's current hand of cards."),
  target: z.number().describe('The target number the bot should aim for.'),
});
export type BotInput = z.infer<typeof BotInputSchema>;

const BotOutputSchema = z.object({
    shouldPass: z.boolean().describe('Whether the bot has decided to pass its turn.'),
    equation: z.array(z.union([z.string(), z.number()])).describe('The equation the bot wants to play. Empty if passing.'),
    reasoning: z.string().describe('A brief explanation of why the bot made this decision.'),
});
export type BotOutput = z.infer<typeof BotOutputSchema>;


export async function findBestEquation(input: BotInput): Promise<BotOutput> {
  return botFlow(input);
}

const botSystemPrompt = `You are a bot playing a card game called CardCalc. Your goal is to use the cards in your hand to create a mathematical equation that results in a number as close as possible to the target number.

Here are the rules for card values:
- Cards 2-10 are worth their face value.
- Ace (A) is worth 1.
- Jack (J) is the addition operator (+).
- Queen (Q) is the subtraction operator (-).
- King (K) is the multiplication operator (*).

An equation must alternate between numbers and operators (e.g., 7 + 1). It must contain at least one operator.

Based on the hand of cards you are given and the target number, you must decide on the best possible move. Your options are:
1.  **Play an Equation**: Find the combination of cards in your hand that forms an equation resulting in a number closest to the target. Your response should include this equation.
2.  **Pass**: If you cannot form a valid equation, or if no equation gets you reasonably close to the target, you can choose to pass your turn.

Analyze your hand carefully. Evaluate different combinations. Return your decision as a structured JSON object. Provide a brief reasoning for your choice. For example, if you find a perfect solution, your reasoning might be "Found an equation that exactly matches the target." If you pass, it might be "No valid equations can be formed with the current hand."
`;

const prompt = ai.definePrompt({
  name: 'cardCalcBotPrompt',
  input: { schema: BotInputSchema },
  output: { schema: BotOutputSchema },
  system: botSystemPrompt,
  prompt: `My hand is: {{json hand}}. The target is {{target}}. What is my best move?`,
});


const botFlow = ai.defineFlow(
  {
    name: 'botFlow',
    inputSchema: BotInputSchema,
    outputSchema: BotOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
