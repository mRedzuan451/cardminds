import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { SpecialIcons } from '@/components/icons';
import { SPECIAL_RANKS } from '@/lib/game';

export default function RulesPage() {
  const specialCards = [
      { rank: 'CL', name: 'Clone', description: 'Play this card to duplicate any non-special card in your hand.' },
      { rank: 'SB', name: 'Sabotage', description: 'Play this card to steal a random card from an opponent of your choice.' },
      { rank: 'SH', name: 'Shuffle', description: 'Play this card to instantly shuffle the cards currently in your hand.' },
      { rank: 'DE', name: 'Destiny', description: 'Play this card to re-roll one of the face-up Target Cards, changing the Target Number.' },
  ];

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
            <p>Most cards represent their number value. Face cards, however, have special values depending on the game mode:</p>
            <div className="flex flex-wrap gap-4 my-4 justify-center">
              <GameCard card={{ suit: 'Spades', rank: 'J', id: '1' }} mode="easy" />
              <GameCard card={{ suit: 'Hearts', rank: 'Q', id: '2' }} mode="easy" />
              <GameCard card={{ suit: 'Clubs', rank: 'K', id: '3' }} mode="easy" />
              <GameCard card={{ suit: 'Diamonds', rank: 'A', id: '4' }} mode="easy" />
            </div>
            <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
              <li><span className="font-bold">2-10:</span> Face value</li>
              <li><span className="font-bold">Jack (J):</span> Addition (+)</li>
              <li><span className="font-bold">Queen (Q):</span> Subtraction (-)</li>
              <li><span className="font-bold">Ace (A):</span> The number 1</li>
              <li><span className="font-bold">King (K) in Easy Mode:</span> Multiplication (*)</li>
              <li><span className="font-bold">King (K) in Pro Mode:</span> Division (/)</li>
              <li><span className="font-bold">King (K) in Special Mode:</span> Power of 2 (^2)</li>
            </ul>
            <p className="mt-4">
              In <strong>Pro Mode</strong>, multiplication must be done using parentheses, for example: (5+2)7 would be invalid, but (5+2)*7 is how you would do it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Gameplay</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>The game starts with a random Target Number and 5 cards in your hand.</li>
              <li>On your turn, you will automatically draw one new card.</li>
              <li>You then have two choices:</li>
              <li className="ml-4 mt-2">
                <strong>A) Play an Equation:</strong> Select cards from your hand to form a valid equation (e.g., 7 + 1). Once you submit, your score is calculated and the round ends.
              </li>
              <li className="ml-4 mt-2">
                <strong>B) Pass:</strong> If you cannot or do not want to make an equation, you can pass your turn.
              </li>
              <li>If all players pass, the round ends. The player with the highest round score wins the round.</li>
              <li>The game is played over 3 rounds in Easy/Pro mode. In Special mode, the game continues until a player reaches the target score.</li>
            </ol>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Game Modes</h2>
            <div className="space-y-2">
              <h3 className="font-bold text-xl">Easy Mode</h3>
              <p>A simpler mode where equations must alternate between numbers and operators. The King card is multiplication (*).</p>
              <h3 className="font-bold text-xl mt-2">Pro Mode</h3>
              <p>A more complex mode where the target is generated from two concatenated cards (e.g. a 2 and 5 make a target of 25). The King card is division (/). Parentheses `()` can be used to group operations.</p>
              <h3 className="font-bold text-xl mt-2">Special Mode</h3>
              <p>This mode includes everything in Pro Mode, but adds powerful special cards to the deck. The King is now Power of 2 (^2). Instead of a set number of rounds, the first player to reach the target score (usually 3,000 points) wins the game.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Special Cards</h2>
            <p>Exclusive to Special Mode, these cards introduce powerful strategic actions.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {specialCards.map(sc => {
                  const card = { id: sc.rank, suit: 'Special' as const, rank: sc.rank as "CL" | "SB" | "SH" | "DE" };
                  return (
                      <div key={sc.rank} className="flex items-center gap-4 bg-muted p-4 rounded-lg">
                          <GameCard card={card} mode="special" className="w-20 md:w-24 flex-shrink-0" />
                          <div>
                              <h3 className="font-bold text-xl font-headline text-amber-600">{sc.name}</h3>
                              <p className="text-base text-foreground/80">{sc.description}</p>
                          </div>
                      </div>
                  )
              })}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2 font-headline">Scoring</h2>
            <p>Your score is based on two factors: how close your result is to the target, and how few cards you used.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>The smaller the difference between your result and the target, the higher your score.</li>
              <li>Using fewer cards gives you a better score.</li>
              <li>A perfect match on the target number gives a significant bonus! (1000 points)</li>
            </ul>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
