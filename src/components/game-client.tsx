"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, Hand, EquationTerm } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, evaluateEquation, calculateScore, CARD_VALUES } from '@/lib/game';
import { RefreshCw, Send, X, Lightbulb, Bot, User, LogOut, FilePlus } from 'lucide-react';
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
import { BotOutput, findBestEquation } from '@/ai/flows/bot-flow';
import { Skeleton } from './ui/skeleton';

type GameState = 'initial' | 'playerTurn' | 'botTurn' | 'ended';
type Player = 'human' | 'bot';
const MAX_DRAWS = 3;

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>('initial');
  const [deck, setDeck] = useState<CardType[]>([]);
  const [humanHand, setHumanHand] = useState<Hand>([]);
  const [botHand, setBotHand] = useState<Hand>([]);
  const [targetNumber, setTargetNumber] = useState<number>(0);
  const [targetCards, setTargetCards] = useState<CardType[]>([]);
  const [equation, setEquation] = useState<EquationTerm[]>([]);
  const [usedCardIndices, setUsedCardIndices] = useState<Set<number>>(new Set());
  
  const [humanScore, setHumanScore] = useState<number>(0);
  const [humanFinalResult, setHumanFinalResult] = useState<number>(0);
  const [botScore, setBotScore] = useState<number>(0);
  const [botFinalResult, setBotFinalResult] = useState<number>(0);
  const [botEquation, setBotEquation] = useState<EquationTerm[]>([]);
  const [botReasoning, setBotReasoning] = useState<string>("");
  
  const [showHint, setShowHint] = useState(false);
  const [humanDrawsLeft, setHumanDrawsLeft] = useState(MAX_DRAWS);
  const [botDrawsLeft, setBotDrawsLeft] = useState(MAX_DRAWS);
  
  const [winner, setWinner] = useState<Player | 'draw' | null>(null);
  const [isBotThinking, setIsBotThinking] = useState(false);
  
  const { toast } = useToast();

  const startGame = useCallback(() => {
    const newDeck = shuffleDeck(createDeck());
    const { target, cardsUsed } = generateTarget();
    
    setTargetNumber(target);
    setTargetCards(cardsUsed);

    setHumanHand(newDeck.slice(0, 5));
    setBotHand(newDeck.slice(5, 10));
    setDeck(newDeck.slice(10));
    
    setEquation([]);
    setUsedCardIndices(new Set());
    setHumanScore(0);
    setHumanFinalResult(0);
    setBotScore(0);
    setBotFinalResult(0);
    setBotEquation([]);
    setBotReasoning("");
    setWinner(null);
    setGameState('playerTurn');
    setShowHint(false);
    setIsBotThinking(false);
    setHumanDrawsLeft(MAX_DRAWS);
    setBotDrawsLeft(MAX_DRAWS);
  }, []);

  useEffect(() => {
    startGame();
  }, [startGame]);

  const handleCardClick = (card: CardType, index: number) => {
    if (gameState !== 'playerTurn' || usedCardIndices.has(index)) return;

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
  
  const endPlayerTurn = (result: number, cardsUsedCount: number) => {
    const newScore = calculateScore(result, targetNumber, cardsUsedCount);
    setHumanScore(newScore);
    setHumanFinalResult(result);
    setGameState('botTurn');
  };

  const handleDrawCard = () => {
    if (gameState !== 'playerTurn' || humanDrawsLeft <= 0 || deck.length === 0) return;

    const [newCard, ...restOfDeck] = deck;
    setHumanHand([...humanHand, newCard]);
    setDeck(restOfDeck);
    setHumanDrawsLeft(humanDrawsLeft - 1);
    toast({ title: "Card Drawn", description: "You drew a new card."});
  };

  const handlePass = () => {
    if (gameState !== 'playerTurn') return;
    endPlayerTurn(0, 0);
  };
  
  const handleSubmitEquation = () => {
    if (gameState !== 'playerTurn' || equation.length < 3) return;

    if (equation.filter(term => typeof term === 'string').length === 0) {
      toast({ title: "Invalid Equation", description: "An equation must contain at least one operator.", variant: 'destructive'});
      return;
    }

    if (equation.length > 0 && typeof equation[equation.length -1] !== 'number') {
      toast({ title: "Invalid Equation", description: "Equation must end with a number.", variant: 'destructive'});
      return;
    }

    const result = evaluateEquation(equation);

    if (typeof result === 'object' && result.error) {
        toast({ title: "Invalid Equation", description: result.error, variant: 'destructive'});
        return;
    }
    
    if (typeof result === 'number') {
      endPlayerTurn(result, usedCardIndices.size);
    }
  };

  const determineWinner = useCallback((currentHumanScore: number, currentBotScore: number) => {
    if (currentHumanScore > currentBotScore) {
      setWinner('human');
    } else if (currentBotScore > currentHumanScore) {
      setWinner('bot');
    } else {
      setWinner('draw');
    }
    setGameState('ended');
  }, []);
  
  const executeBotTurn = useCallback(async () => {
    if (gameState !== 'botTurn') {
      return;
    }

    setIsBotThinking(true);
    let botResponse: BotOutput | null = null;
    try {
      botResponse = await findBestEquation({ hand: botHand, target: targetNumber, drawsLeft: botDrawsLeft });

      if (gameState !== 'botTurn') { // Check again in case state changed during API call
        return;
      }
      
      setBotReasoning(botResponse.reasoning);

      if (botResponse.action === 'play' && botResponse.equation.length > 0) {
        const botEq = botResponse.equation as EquationTerm[];
        const evaluation = evaluateEquation(botEq);
        let currentBotScore = 0;
        let currentBotResult = 0;
        if (typeof evaluation === 'number') {
          currentBotScore = calculateScore(evaluation, targetNumber, botEq.length);
          currentBotResult = evaluation;
        }
        setBotScore(currentBotScore);
        setBotFinalResult(currentBotResult);
        setBotEquation(botEq);
        determineWinner(humanScore, currentBotScore);
      } else if (botResponse.action === 'draw') {
        if (deck.length > 0 && botDrawsLeft > 0) {
          const [newCard, ...restOfDeck] = deck;
          setBotHand([...botHand, newCard]);
          setDeck(restOfDeck);
          setBotDrawsLeft(botDrawsLeft - 1);
          
          // Bot gets to think again after drawing
          setTimeout(() => executeBotTurn(), 1000); 
        } else {
          // Can't draw, so just pass
          setBotScore(0);
          determineWinner(humanScore, 0);
        }
      } else { // 'pass'
        setBotScore(0);
        determineWinner(humanScore, 0);
      }

    } catch (error) {
      console.error("Bot AI error:", error);
      if (gameState === 'botTurn') {
        toast({ title: "Bot Error", description: "The bot encountered an error and passed its turn.", variant: "destructive"});
        setBotScore(0);
        determineWinner(humanScore, 0);
      }
    } finally {
        if (gameState !== 'botTurn' || (botResponse && botResponse.action !== 'draw')) {
            setIsBotThinking(false);
        }
    }
  }, [botHand, targetNumber, botDrawsLeft, determineWinner, gameState, toast, humanScore, deck]);

  useEffect(() => {
    if (gameState === 'botTurn') {
      const timer = setTimeout(() => executeBotTurn(), 1500); // Give a slight delay for realism
      return () => clearTimeout(timer);
    }
  }, [gameState, executeBotTurn]);

  const equationString = useMemo(() => equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : 'default'} className="text-xl p-2">{term}</Badge>
  )), [equation]);
  
  const botEquationString = useMemo(() => botEquation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : 'default'} className="text-xl p-2">{term}</Badge>
  )), [botEquation]);

  const targetEquation = useMemo(() => {
    if (!targetCards || targetCards.length === 0) return null;
    return targetCards.map(c => CARD_VALUES[c.rank]).join(' ');
  }, [targetCards]);

  const renderWinner = () => {
    if (!winner) return null;
    switch (winner) {
      case 'human': return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">You Win!</p>;
      case 'bot': return <p className="text-4xl md:text-5xl font-bold my-6 text-destructive">Bot Wins!</p>;
      case 'draw': return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">It's a Draw!</p>;
    }
  };

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

      {(gameState === 'ended' && !isBotThinking) && (
        <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
          <CardTitle className="text-4xl font-headline mb-4">Round Over!</CardTitle>
          {renderWinner()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
            <div className='space-y-2'>
              <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><User /> Your Score: <span className="text-primary">{humanScore}</span></h3>
              <div className="flex items-center justify-center gap-2 flex-wrap min-h-[52px]">
                Your equation:
                {equation.length > 0 ? (
                  <>
                  {equationString}
                  <span className="mx-2">=</span>
                  <span className="font-bold text-accent">{humanFinalResult}</span>
                  </>
                ) : <p>You passed.</p>}
              </div>
            </div>
            <div className='space-y-2'>
              <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><Bot /> Bot Score: <span className="text-destructive">{botScore}</span></h3>
              <div className="flex items-center justify-center gap-2 flex-wrap min-h-[52px]">
                Bot's equation:
                {botEquation.length > 0 ? (
                  <>
                  {botEquationString}
                  <span className="mx-2">=</span>
                  <span className="font-bold text-accent">{botFinalResult}</span>
                  </>
                ) : <p>Bot passed.</p>}
              </div>
              {botReasoning && (
                  <p className="text-sm text-muted-foreground italic mt-2">"{botReasoning}"</p>
              )}
            </div>
          </div>
          <Button onClick={startGame} size="lg" className="mt-8">Play Again</Button>
        </Card>
      )}
      
      {gameState === 'playerTurn' && (
        <Card className="shadow-lg sticky top-[85px] z-10 bg-card/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><User /> Your Turn</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 bg-muted p-4 rounded-lg min-h-[72px] text-2xl font-bold flex-wrap">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-lg font-normal">Click cards below to build an equation, or pass your turn.</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {equation.length >= 3 ? (
                <Button onClick={handleSubmitEquation} className="flex-grow col-span-2 md:col-span-1">
                  <Send className="mr-2 h-4 w-4"/> Submit Equation
                </Button>
              ) : (
                <Button onClick={handlePass} className="flex-grow col-span-2 md:col-span-1" variant="secondary">
                  <LogOut className="mr-2 h-4 w-4"/> Pass Turn
                </Button>
              )}
               <Button onClick={handleClearEquation} variant="destructive" className="flex-grow" disabled={equation.length === 0}>
                <X className="mr-2 h-4 w-4"/> Clear
              </Button>
              <Button onClick={handleDrawCard} variant="outline" className="flex-grow" disabled={humanDrawsLeft <= 0 || deck.length === 0}>
                <FilePlus className="mr-2 h-4 w-4" /> Draw ({humanDrawsLeft})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isBotThinking && (
        <Card className="shadow-lg p-6 flex flex-col items-center justify-center gap-4">
            <Bot className="h-10 w-10 animate-bounce text-primary" />
            <p className="text-xl font-headline">Bot is thinking...</p>
            <Skeleton className="h-4 w-48" />
        </Card>
      )}


      {gameState !== 'initial' && (
        <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold font-headline mb-4 mt-8 flex items-center gap-2"><Bot /> Bot's Hand</h2>
              <div className="flex flex-wrap justify-center gap-2 md:gap-4">
                {botHand.map((card, index) => (
                  <div key={`bot-${index}`} className="transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-10">
                    <GameCard
                      card={card}
                      isFaceDown={gameState !== 'ended'}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold font-headline mb-4 mt-8 flex items-center gap-2"><User /> Your Hand</h2>
              <div className="flex flex-wrap justify-center gap-2 md:gap-4">
                {humanHand.map((card, index) => (
                  <div key={`${card.suit}-${card.rank}-${index}`} className="transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-10">
                    <GameCard
                      card={card}
                      onClick={() => handleCardClick(card, index)}
                      className={cn(
                        'transition-all duration-200',
                        usedCardIndices.has(index) && "opacity-30 scale-90 -translate-y-4 cursor-not-allowed",
                        gameState !== 'playerTurn' && "cursor-not-allowed"
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
        </div>
      )}
    </div>
  );
}

    
