"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, Hand, EquationTerm } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, evaluateEquation, calculateScore, CARD_VALUES } from '@/lib/game';
import { RefreshCw, Send, X, Lightbulb, Bot, User, LogOut, FilePlus, Trophy } from 'lucide-react';
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
import Confetti from 'react-confetti';

type GameState = 'initial' | 'playerTurn' | 'botTurn' | 'roundOver' | 'gameOver';
type Player = 'human' | 'bot';
const MAX_DRAWS = 3;
const TOTAL_ROUNDS = 3;

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>('initial');
  const [deck, setDeck] = useState<CardType[]>([]);
  const [humanHand, setHumanHand] = useState<Hand>([]);
  const [botHand, setBotHand] = useState<Hand>([]);
  const [targetNumber, setTargetNumber] = useState<number>(0);
  const [targetCards, setTargetCards] = useState<CardType[]>([]);
  const [equation, setEquation] = useState<EquationTerm[]>([]);
  const [usedCardIndices, setUsedCardIndices] = useState<Set<number>>(new Set());
  
  const [humanRoundScore, setHumanRoundScore] = useState<number>(0);
  const [humanFinalResult, setHumanFinalResult] = useState<number>(0);
  const [botRoundScore, setBotRoundScore] = useState<number>(0);
  const [botFinalResult, setBotFinalResult] = useState<number>(0);
  const [botEquation, setBotEquation] = useState<EquationTerm[]>([]);
  const [botReasoning, setBotReasoning] = useState<string>("");
  
  const [showHint, setShowHint] = useState(false);
  const [humanDrawsLeft, setHumanDrawsLeft] = useState(MAX_DRAWS);
  const [botDrawsLeft, setBotDrawsLeft] = useState(MAX_DRAWS);
  
  const [roundWinner, setRoundWinner] = useState<Player | 'draw' | null>(null);
  const [isBotThinking, setIsBotThinking] = useState(false);

  const [currentRound, setCurrentRound] = useState(1);
  const [humanTotalScore, setHumanTotalScore] = useState(0);
  const [botTotalScore, setBotTotalScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const { toast } = useToast();

  const startNewGame = useCallback(() => {
    setCurrentRound(1);
    setHumanTotalScore(0);
    setBotTotalScore(0);
    setShowConfetti(false);
    startNewRound();
  }, []);
  
  const startNewRound = useCallback(() => {
    const newDeck = shuffleDeck(createDeck());
    const { target, cardsUsed } = generateTarget();
    
    setTargetNumber(target);
    setTargetCards(cardsUsed);

    setHumanHand(newDeck.slice(0, 5));
    setBotHand(newDeck.slice(5, 10));
    setDeck(newDeck.slice(10));
    
    setEquation([]);
    setUsedCardIndices(new Set());
    setHumanRoundScore(0);
    setHumanFinalResult(0);
    setBotRoundScore(0);
    setBotFinalResult(0);
    setBotEquation([]);
    setBotReasoning("");
    setRoundWinner(null);
    setShowHint(false);
    setIsBotThinking(false);
    setHumanDrawsLeft(MAX_DRAWS);
    setBotDrawsLeft(MAX_DRAWS);
    setGameState('playerTurn');
  }, []);


  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

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
    setHumanRoundScore(newScore);
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

  const determineRoundWinner = useCallback((currentHumanScore: number, currentBotScore: number) => {
    setHumanTotalScore(prev => prev + currentHumanScore);
    setBotTotalScore(prev => prev + currentBotScore);

    if (currentHumanScore > currentBotScore) {
      setRoundWinner('human');
    } else if (currentBotScore > currentHumanScore) {
      setRoundWinner('bot');
    } else {
      setRoundWinner('draw');
    }

    if (currentRound >= TOTAL_ROUNDS) {
      setGameState('gameOver');
      if (humanTotalScore + currentHumanScore > botTotalScore + currentBotScore) {
        setShowConfetti(true);
      }
    } else {
      setGameState('roundOver');
    }
  }, [currentRound, humanTotalScore, botTotalScore]);
  
  const executeBotTurn = useCallback(async (isMounted: () => boolean) => {
    if (!isMounted() || gameState !== 'botTurn') {
      setIsBotThinking(false);
      return;
    };

    setIsBotThinking(true);
    let botResponse: BotOutput | null = null;
    try {
      botResponse = await findBestEquation({ hand: botHand, target: targetNumber, drawsLeft: botDrawsLeft });

      if (!isMounted() || gameState !== 'botTurn') {
        setIsBotThinking(false);
        return;
      }
      
      setBotReasoning(botResponse.reasoning);

      if (botResponse.action === 'play' && botResponse.equation.length > 0) {
        const botEqRaw = botResponse.equation;
        const botEq = botEqRaw.map(term => CARD_VALUES[term as keyof typeof CARD_VALUES] || term) as EquationTerm[]

        const evaluation = evaluateEquation(botEq);
        let currentBotScore = 0;
        let currentBotResult = 0;
        if (typeof evaluation === 'number') {
          currentBotScore = calculateScore(evaluation, targetNumber, botEq.length);
          currentBotResult = evaluation;
        } else {
            console.error("Bot evaluation error:", evaluation.error);
        }
        setBotRoundScore(currentBotScore);
        setBotFinalResult(currentBotResult);
        setBotEquation(botEq);
        determineRoundWinner(humanRoundScore, currentBotScore);
      } else if (botResponse.action === 'draw') {
        if (deck.length > 0 && botDrawsLeft > 0) {
          const [newCard, ...restOfDeck] = deck;
          setBotHand([...botHand, newCard]);
          setDeck(restOfDeck);
          setBotDrawsLeft(botDrawsLeft - 1);
          
          setTimeout(() => executeBotTurn(isMounted), 2000); 
        } else {
          setBotRoundScore(0);
          determineRoundWinner(humanRoundScore, 0);
        }
      } else { // 'pass'
        setBotRoundScore(0);
        setBotFinalResult(0);
        setBotEquation([]);
        determineRoundWinner(humanRoundScore, 0);
      }

    } catch (error) {
      console.error("Bot AI error:", error);
      if (isMounted() && gameState === 'botTurn') {
        toast({ title: "Bot Error", description: "The bot encountered an error and passed its turn.", variant: "destructive"});
        setBotRoundScore(0);
        determineRoundWinner(humanRoundScore, 0);
      }
    } finally {
        if (isMounted() && (!botResponse || botResponse.action !== 'draw')) {
            setIsBotThinking(false);
        }
    }
  }, [botHand, targetNumber, botDrawsLeft, determineRoundWinner, toast, humanRoundScore, deck, gameState]);

  useEffect(() => {
    let isMounted = () => true;
    if (gameState === 'botTurn') {
      const timer = setTimeout(() => executeBotTurn(() => isMounted), 1500);
      return () => {
        isMounted = () => false;
        clearTimeout(timer);
      };
    }
  }, [gameState, executeBotTurn]);

  const handleNextRound = () => {
    setCurrentRound(prev => prev + 1);
    startNewRound();
  };

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

  const renderRoundWinner = () => {
    if (!roundWinner) return null;
    switch (roundWinner) {
      case 'human': return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">You Win This Round!</p>;
      case 'bot': return <p className="text-4xl md:text-5xl font-bold my-6 text-destructive">Bot Wins This Round!</p>;
      case 'draw': return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">It's a Draw!</p>;
    }
  };

  const totalWinner = useMemo(() => {
    if (gameState !== 'gameOver') return null;
    if (humanTotalScore > botTotalScore) return 'human';
    if (botTotalScore > humanTotalScore) return 'bot';
    return 'draw';
  }, [gameState, humanTotalScore, botTotalScore]);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      {showConfetti && totalWinner === 'human' && <Confetti recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
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
        
        <Card className="text-center p-4 shadow-lg flex-grow">
          <CardHeader className="p-0 mb-2">
            <CardTitle className="text-lg text-muted-foreground font-headline">Scoreboard (Round {currentRound}/{TOTAL_ROUNDS})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex justify-around items-center gap-4">
              <div className="flex items-center gap-2 text-xl font-bold">
                <User /> You: <span className="text-primary">{humanTotalScore}</span>
              </div>
              <div className="flex items-center gap-2 text-xl font-bold">
                <Bot /> Bot: <span className="text-destructive">{botTotalScore}</span>
              </div>
          </CardContent>
        </Card>

        <Button onClick={startNewGame} size="lg" className="shadow-lg w-full md:w-auto">
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

      {gameState === 'gameOver' && !isBotThinking && (
         <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
           <CardTitle className="text-5xl font-headline mb-4 flex items-center justify-center gap-4"><Trophy className="w-12 h-12 text-yellow-400" />Game Over!</CardTitle>
           {totalWinner === 'human' && <p className="text-4xl font-bold my-6 text-primary">You are the Grand Winner!</p>}
           {totalWinner === 'bot' && <p className="text-4xl font-bold my-6 text-destructive">The Bot is the Grand Winner!</p>}
           {totalWinner === 'draw' && <p className="text-4xl font-bold my-6 text-muted-foreground">It's a tie!</p>}
           
           <div className="text-2xl font-bold">Final Score</div>
           <div className="flex justify-center items-center gap-8 text-xl my-4">
              <div className="flex items-center gap-2"><User /> You: <span className="text-primary">{humanTotalScore}</span></div>
              <div className="flex items-center gap-2"><Bot /> Bot: <span className="text-destructive">{botTotalScore}</span></div>
           </div>
          
           <Button onClick={startNewGame} size="lg" className="mt-8">Play Again</Button>
         </Card>
       )}

      {(gameState === 'roundOver' && !isBotThinking) && (
        <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
          <CardTitle className="text-4xl font-headline mb-4">Round {currentRound} Over!</CardTitle>
          {renderRoundWinner()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
            <div className='space-y-2'>
              <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><User /> Your Score: <span className="text-primary">{humanRoundScore}</span></h3>
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
              <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><Bot /> Bot Score: <span className="text-destructive">{botRoundScore}</span></h3>
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
          <Button onClick={handleNextRound} size="lg" className="mt-8">Next Round</Button>
        </Card>
      )}
      
      {gameState === 'playerTurn' && (
        <Card className="shadow-lg sticky top-[100px] z-10 bg-card/90 backdrop-blur-sm">
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


      {gameState !== 'initial' && gameState !== 'gameOver' &&(
        <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold font-headline mb-4 mt-8 flex items-center gap-2"><Bot /> Bot's Hand</h2>
              <div className="flex flex-wrap justify-center gap-2 md:gap-4">
                {botHand.map((card, index) => (
                  <div key={`bot-${index}`} className="transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-10">
                    <GameCard
                      card={card}
                      isFaceDown={gameState !== 'roundOver' && gameState !== 'gameOver'}
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
