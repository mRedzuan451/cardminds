import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function RulesPage() {
  return (
    <div className="container mx-auto max-w-4xl py-12 px-4">
      <Card className="shadow-2xl">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-4xl font-headline text-primary">Game Rules</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Game</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8 text-lg text-foreground/90">
          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Objective</h2>
            <p>
              Use the cards in your hand to create a mathematical equation whose result is as close as possible to the randomly generated Target Number.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Card Values</h2>
            <p>Most cards represent their number value. Face cards, however, represent operators or the number one:</p>
            <div className="flex flex-wrap gap-4 my-4 justify-center">
              <GameCard card={{ suit: 'Spades', rank: 'J' }} />
              <GameCard card={{ suit: 'Hearts', rank: 'Q' }} />
              <GameCard card={{ suit: 'Clubs', rank: 'K' }} />
              <GameCard card={{ suit: 'Diamonds', rank: 'A' }} />
            </div>
            <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
              <li><span className="font-bold">2-10:</span> Face value</li>
              <li><span className="font-bold">Jack (J):</span> Addition (+)</li>
              <li><span className="font-bold">Queen (Q):</span> Subtraction (-)</li>
              <li><span className="font-bold">King (K):</span> Multiplication (*)</li>
              <li><span className="font-bold">Ace (A):</span> The number 1</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Gameplay</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>The game starts with a random Target Number and 5 cards in your hand.</li>
              <li>On your turn, you have two choices:</li>
              <li className="ml-4 mt-2">
                <strong>A) Play an Equation:</strong> Select cards from your hand to form a valid equation (e.g., 7 + 1). The equation must alternate between numbers and operators. Once you submit, your score is calculated and the round ends.
              </li>
              <li className="ml-4 mt-2">
                <strong>B) Pass & Draw:</strong> If you cannot or do not want to make an equation, you can pass your turn. You will draw one new card into your hand.
              </li>
              <li>The game ends when you submit an equation. To start a new game, click the "New Game" button.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Scoring</h2>
            <p>Your score is based on two factors: how close your result is to the target, and how few cards you used.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>The smaller the difference between your result and the target, the higher your score.</li>
              <li>Using fewer cards gives you a better score.</li>
              <li>A perfect match on the target number gives a significant bonus!</li>
            </ul>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
