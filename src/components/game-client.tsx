"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, Hand, EquationTerm } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, evaluateEquation, calculateScore, CARD_VALUES } from '@/lib/game';
import { RefreshCw, Send, SkipForward, X, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type GameState = 'initial' | 'playing' | 'ended';

const MAX_DRAWS = 3;

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>('initial');
  const [deck, setDeck] = useState<CardType[]>([]);
  const [hand, setHand] = useState<Hand>([]);
  const [targetNumber, setTargetNumber] = useState<number>(0);
  const [targetCards, setTargetCards] = useState<CardType[]>([]);
  const [equation, setEquation] = useState<EquationTerm[]>([]);
  const [usedCardIndices, setUsedCardIndices] = useState<Set<number>>(new Set());
  const [score, setScore] = useState<number>(0);
  const [finalResult, setFinalResult] = useState<number>(0);
  const [showHint, setShowHint] = useState(false);
  const [drawsRemaining, setDrawsRemaining] = useState(MAX_DRAWS);
  
  const { toast } = useToast();

  const startGame = useCallback(() => {
    const newDeck = shuffleDeck(createDeck());
    const { target, cardsUsed } = generateTarget();
    
    setTargetNumber(target);
    setTargetCards(cardsUsed);
    setHand(newDeck.slice(0, 5));
    setDeck(newDeck.slice(5));
    setEquation([]);
    setUsedCardIndices(new Set());
    setScore(0);
    setGameState('playing');
    setShowHint(false);
    setDrawsRemaining(MAX_DRAWS);
  }, []);

  useEffect(() => {
    startGame();
  }, [startGame]);

  const handleCardClick = (card: CardType, index: number) => {
    if (gameState !== 'playing' || usedCardIndices.has(index)) return;

    const value = CARD_VALUES[card.rank];
    const lastTerm = equation.length > 0 ? equation[equation.length - 1] : null;

    if ( (typeof value === 'number' && typeof lastTerm === 'number') || (typeof value === 'string' && typeof lastTerm === 'string')) {
        toast({ title: "Invalid Move", description: "You must alternate between numbers and operators.", variant: "destructive" });
        return;
    }
    
    setEquation([...equation, value]);
    setUsedCardIndices(new Set([...usedCardIndices, index]));
  };

  const handleClearEquation = () => {
    setEquation([]);
    setUsedCardIndices(new Set());
  };
  
  const handleSubmitEquation = () => {
    if (equation.length < 3) {
        toast({ title: "Invalid Equation", description: "An equation must contain at least one operator.", variant: 'destructive'});
        return;
    }

    const result = evaluateEquation(equation);

    if (typeof result === 'object' && result.error) {
        toast({ title: "Invalid Equation", description: result.error, variant: 'destructive'});
        return;
    }
    
    if (typeof result === 'number') {
        const newScore = calculateScore(result, targetNumber, usedCardIndices.size);
        setScore(newScore);
        setFinalResult(result);
        setGameState('ended');
    }
  };
  
  const handlePassAndDraw = () => {
    if (drawsRemaining <= 0) {
      toast({ title: "No draws left!", description: "You cannot draw any more cards this round.", variant: "destructive" });
      return;
    }
    if (deck.length === 0) {
      toast({ title: "No cards left!", description: "The deck is empty." });
      return;
    }
    if (hand.length >= 10) {
      toast({ title: "Hand is full!", description: "You can't have more than 10 cards." });
      return;
    }
    const [newCard, ...restOfDeck] = deck;
    setHand([...hand, newCard]);
    setDeck(restOfDeck);
    setDrawsRemaining(drawsRemaining - 1);
    toast({ title: "Passed Turn", description: "You drew a new card." });
  };
  
  const equationString = useMemo(() => equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : 'default'} className="text-xl p-2">{term}</Badge>
  )), [equation]);
  
  const targetEquation = useMemo(() => {
    if (!targetCards || targetCards.length === 0) return null;
    return targetCards.map(c => CARD_VALUES[c.rank]).join(' ');
  }, [targetCards]);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <Card className="text-center p-4 shadow-lg w-full md:w-auto">
          <CardHeader className="p-0 mb-1">
            <CardTitle className="text-lg text-muted-foreground font-headline">Target</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex items-center gap-2">
            <p className="text-5xl font-bold text-primary">{targetNumber}</p>
            <Button variant="ghost" size="icon" onClick={() => setShowHint(true)} className="text-muted-foreground">
              <Lightbulb className="h-6 w-6" />
              <span className="sr-only">Show hint</span>
            </Button>
          </CardContent>
        </Card>
        <div className="flex-grow" />
        <Button onClick={startGame} size="lg" className="shadow-lg w-full md:w-auto">
          <RefreshCw className="mr-2 h-5 w-5"/> New Game
        </Button>
      </div>

      <AlertDialog open={showHint} onOpenChange={setShowHint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline text-2xl">Target Combination</AlertDialogTitle>
            <AlertDialogDescription>
              Here's how the target number was created:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-center items-center gap-2 my-4">
              {targetCards.map((card, index) => (
                <GameCard key={index} card={card} />
              ))}
          </div>
          <p className="text-center text-2xl font-bold">
            {targetEquation} = <span className="text-primary">{targetNumber}</span>
          </p>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowHint(false)}>Got it!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {gameState === 'ended' && (
        <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
          <CardTitle className="text-4xl font-headline mb-4">Game Over!</CardTitle>
          <div className="text-xl md:text-2xl flex items-center justify-center gap-2 flex-wrap">
            Your equation:
            {equationString}
            <span className="mx-2">=</span>
            <span className="font-bold text-accent">{finalResult}</span>
          </div>
          <p className="text-4xl md:text-5xl font-bold my-6">Your Score: <span className="text-primary">{score}</span></p>
          <Button onClick={startGame} size="lg">Play Again</Button>
        </Card>
      )}
      
      {gameState === 'playing' && (
        <Card className="shadow-lg sticky top-[85px] z-10 bg-card/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline">Your Equation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 bg-muted p-4 rounded-lg min-h-[72px] text-2xl font-bold flex-wrap">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-lg font-normal">Click cards below to build...</span>}
            </div>
            <div className="grid grid-cols-2 md:flex gap-2 mt-4">
              <Button onClick={handleSubmitEquation} className="flex-grow">
                <Send className="mr-2 h-4 w-4"/> Submit
              </Button>
              <Button onClick={handlePassAndDraw} variant="secondary" className="flex-grow" disabled={drawsRemaining <= 0}>
                <SkipForward className="mr-2 h-4 w-4"/> Draw <Badge variant="outline" className="ml-2">{drawsRemaining} left</Badge>
              </Button>
              <Button onClick={handleClearEquation} variant="destructive" size="icon" disabled={equation.length === 0} className="col-span-2 md:col-auto md:w-auto">
                <X className="h-4 w-4"/>
                <span className="sr-only">Clear equation</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {gameState !== 'initial' && (
        <div>
          <h2 className="text-2xl font-bold font-headline mb-4 mt-8">Your Hand</h2>
          <div className="flex flex-wrap justify-center gap-2 md:gap-4">
            {hand.map((card, index) => (
              <div key={`${card.suit}-${card.rank}-${index}`} className="transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-10">
                <GameCard
                  card={card}
                  onClick={() => handleCardClick(card, index)}
                  className={cn(
                    'transition-all duration-200',
                    usedCardIndices.has(index) && "opacity-30 scale-90 -translate-y-4 cursor-not-allowed",
                    gameState !== 'playing' && "cursor-not-allowed"
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
