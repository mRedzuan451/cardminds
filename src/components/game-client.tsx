
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, Hand, EquationTerm } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, evaluateEquation, calculateScore, CARD_VALUES } from '@/lib/game';
import { RefreshCw, Send, X, Lightbulb, User, LogOut, Trophy, Users, BrainCircuit, Baby, ArrowLeft } from 'lucide-react';
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
import Confetti from 'react-confetti';

type GameState = 'initial' | 'modeSelection' | 'player1Turn' | 'player2Turn' | 'roundOver' | 'gameOver';
type GameMode = 'easy' | 'pro';
type Player = 'Player 1' | 'Player 2';
const TOTAL_ROUNDS = 3;

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>('modeSelection');
  const [gameMode, setGameMode] = useState<GameMode>('easy');
  const [deck, setDeck] = useState<CardType[]>([]);
  const [player1Hand, setPlayer1Hand] = useState<Hand>([]);
  const [player2Hand, setPlayer2Hand] = useState<Hand>([]);
  const [targetNumber, setTargetNumber] = useState<number>(0);
  const [targetCards, setTargetCards] = useState<CardType[]>([]);
  const [equation, setEquation] = useState<EquationTerm[]>([]);
  const [usedCardIndices, setUsedCardIndices] = useState<Set<number>>(new Set());
  
  const [player1RoundScore, setPlayer1RoundScore] = useState<number>(0);
  const [player1FinalResult, setPlayer1FinalResult] = useState<number>(0);
  const [player1Equation, setPlayer1Equation] = useState<EquationTerm[]>([]);
  const [player2RoundScore, setPlayer2RoundScore] = useState<number>(0);
  const [player2FinalResult, setPlayer2FinalResult] = useState<number>(0);
  const [player2Equation, setPlayer2Equation] = useState<EquationTerm[]>([]);
  
  const [player1Passed, setPlayer1Passed] = useState(false);
  const [player2Passed, setPlayer2Passed] = useState(false);

  const [currentPlayer, setCurrentPlayer] = useState<Player>('Player 1');
  
  const [showHint, setShowHint] = useState(false);
  
  const [roundWinner, setRoundWinner] = useState<Player | 'draw' | null>(null);

  const [currentRound, setCurrentRound] = useState(1);
  const [player1TotalScore, setPlayer1TotalScore] = useState(0);
  const [player2TotalScore, setPlayer2TotalScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showTurnInterstitial, setShowTurnInterstitial] = useState(false);

  const { toast } = useToast();

  const activeHand = useMemo(() => {
    return currentPlayer === 'Player 1' ? player1Hand : player2Hand;
  }, [currentPlayer, player1Hand, player2Hand]);

  const startNewGame = useCallback((mode: GameMode) => {
    setGameMode(mode);
    setCurrentRound(1);
    setPlayer1TotalScore(0);
    setPlayer2TotalScore(0);
    setShowConfetti(false);
    startNewRound(mode);
  }, []);
  
  const startNewRound = useCallback((mode: GameMode) => {
    let freshDeck = shuffleDeck(createDeck());
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, mode);
    
    setTargetNumber(target);
    setTargetCards(cardsUsed);
    freshDeck = updatedDeck;

    const p1Hand = freshDeck.slice(0, 5);
    const p2Hand = freshDeck.slice(5, 10);
    let remainingDeck = freshDeck.slice(10);
    
    // Player 1 automatically draws a card
    if (remainingDeck.length > 0) {
      p1Hand.push(remainingDeck.shift()!);
    }

    setPlayer1Hand(p1Hand);
    setPlayer2Hand(p2Hand);
    setDeck(remainingDeck);
    
    setEquation([]);
    setUsedCardIndices(new Set());
    setPlayer1RoundScore(0);
    setPlayer1FinalResult(0);
    setPlayer1Equation([]);
    setPlayer1Passed(false);
    setPlayer2RoundScore(0);
    setPlayer2FinalResult(0);
    setPlayer2Equation([]);
    setPlayer2Passed(false);
    setRoundWinner(null);
    setShowHint(false);
    setCurrentPlayer('Player 1');
    setGameState('player1Turn');
  }, []);

  const handleParenthesisClick = (paren: '(' | ')') => {
    setEquation([...equation, paren]);
  };

  const handleCardClick = (card: CardType, index: number) => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;
    if (usedCardIndices.has(index)) return;

    const value = CARD_VALUES[card.rank];
    const lastTerm = equation.length > 0 ? equation[equation.length - 1] : null;

    if (gameMode === 'easy') {
      if ( (typeof value === 'number' && typeof lastTerm === 'number') || (typeof value === 'string' && typeof lastTerm === 'string')) {
          toast({ title: "Invalid Move", description: "You must alternate between numbers and operators.", variant: "destructive" });
          return;
      }
    }
    
    setEquation([...equation, value]);
    setUsedCardIndices(new Set([...usedCardIndices, index]));
  };

  const handleClearEquation = () => {
    setEquation([]);
    setUsedCardIndices(new Set());
  };
  
  const handleBothPlayersPass = useCallback(() => {
    toast({ title: "Both players passed!", description: "Drawing a new card for each player."});
    let nextDeck = [...deck];
    let p1Hand = [...player1Hand];
    let p2Hand = [...player2Hand];

    if (nextDeck.length > 0) {
      p1Hand.push(nextDeck.shift()!);
    }
    if (nextDeck.length > 0) {
      p2Hand.push(nextDeck.shift()!);
    }
    
    setDeck(nextDeck);
    setPlayer1Hand(p1Hand);
    setPlayer2Hand(p2Hand);
    
    setEquation([]);
    setUsedCardIndices(new Set());
    setPlayer1Passed(false);
    setPlayer2Passed(false);
    setCurrentPlayer('Player 1');
    setGameState('player1Turn');
  }, [deck, player1Hand, player2Hand, toast]);


  const determineRoundWinner = useCallback((p1s: number, p2s: number) => {
    let winner: Player | 'draw' | null = null;
    
    if (p1s > p2s) {
      winner = 'Player 1';
    } else if (p2s > p1s) {
      winner = 'Player 2';
    } else {
      winner = 'draw';
    }
    setRoundWinner(winner);

    const nextP1Total = player1TotalScore + p1s;
    const nextP2Total = player2TotalScore + p2s;
    
    setPlayer1TotalScore(nextP1Total);
    setPlayer2TotalScore(nextP2Total);

    setGameState('roundOver');

    if (currentRound >= TOTAL_ROUNDS) {
      if (nextP1Total > nextP2Total && winner === 'Player 1') {
        setShowConfetti(true);
      }
    }
  }, [currentRound, player1TotalScore, player2TotalScore]);

  const switchTurn = () => {
    setEquation([]);
    setUsedCardIndices(new Set());
    
    let nextPlayer2Hand = [...player2Hand];
    let nextDeck = [...deck];
    if (nextDeck.length > 0) {
      nextPlayer2Hand.push(nextDeck.shift()!);
      setPlayer2Hand(nextPlayer2Hand);
      setDeck(nextDeck);
      toast({title: "Player 2 Drew a Card", description: "A new card has been added to Player 2's hand."});
    }

    setCurrentPlayer('Player 2');
    setGameState('player2Turn');
    setShowTurnInterstitial(true);
  };

  const endPlayerTurn = (result: number, cardsUsedCount: number, passed: boolean) => {
    const newScore = passed ? 0 : calculateScore(result, targetNumber, cardsUsedCount);

    if (currentPlayer === 'Player 1') {
      setPlayer1RoundScore(newScore);
      setPlayer1FinalResult(result);
      setPlayer1Equation(equation);
      setPlayer1Passed(passed);
      switchTurn();
    } else { // Player 2
      setPlayer2RoundScore(newScore);
      setPlayer2FinalResult(result);
      setPlayer2Equation(equation);
      setPlayer2Passed(passed);
      
      if (passed && player1Passed) {
        handleBothPlayersPass();
      } else {
        determineRoundWinner(player1RoundScore, newScore);
      }
    }
  };


  const handlePass = () => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;
    endPlayerTurn(0, 0, true);
  };
  
  const handleSubmitEquation = () => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;

    if (gameMode === 'easy') {
      if (equation.length < 3) return;
      if (equation.filter(term => typeof term === 'string').length === 0) {
        toast({ title: "Invalid Equation", description: "An equation must contain at least one operator.", variant: 'destructive'});
        return;
      }
      if (equation.length > 0 && typeof equation[equation.length -1] !== 'number') {
        toast({ title: "Invalid Equation", description: "Equation must end with a number.", variant: 'destructive'});
        return;
      }
    }


    const result = evaluateEquation(equation);

    if (typeof result === 'object' && result.error) {
        toast({ title: "Invalid Equation", description: result.error, variant: 'destructive'});
        return;
    }
    
    if (typeof result === 'number') {
      endPlayerTurn(result, usedCardIndices.size, false);
    }
  };

  const totalWinner = useMemo(() => {
    if (currentRound < TOTAL_ROUNDS && gameState !== 'gameOver') return 'draw';
    if (player1TotalScore > player2TotalScore) return 'Player 1';
    if (player2TotalScore > player1TotalScore) return 'Player 2';
    return 'draw';
  }, [player1TotalScore, player2TotalScore, currentRound, gameState]);

  useEffect(() => {
    if (gameState === 'gameOver' && totalWinner === 'Player 1' && !showConfetti) {
        setShowConfetti(true);
    }
  }, [gameState, showConfetti, totalWinner]);


  const handleNextRound = () => {
    if (currentRound >= TOTAL_ROUNDS) {
      setGameState('gameOver');
    } else {
      setCurrentRound(prev => prev + 1);
      startNewRound(gameMode);
    }
  };
  
  const handleNewGameClick = () => {
    startNewGame(gameMode);
  }

  const handleBackToMenu = () => {
    setGameState('modeSelection');
  }

  const equationString = useMemo(() => equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*') ? 'default' : 'outline'} className="text-xl p-2">{term}</Badge>
  )), [equation]);
  
  const player1EquationString = useMemo(() => player1Equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*') ? 'default' : 'outline'} className="text-xl p-2">{term}</Badge>
  )), [player1Equation]);

  const player2EquationString = useMemo(() => player2Equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*') ? 'default' : 'outline'} className="text-xl p-2">{term}</Badge>
  )), [player2Equation]);

  const targetEquation = useMemo(() => {
    if (!targetCards || targetCards.length === 0) return null;
    if (gameMode === 'easy') {
      return targetCards.map(c => CARD_VALUES[c.rank]).join(' ');
    }
    // For pro mode, just show the cards
    return null;
  }, [targetCards, gameMode]);

  const renderRoundWinner = () => {
    if (!roundWinner) return null;
    switch (roundWinner) {
      case 'Player 1': return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">Player 1 Wins This Round!</p>;
      case 'Player 2': return <p className="text-4xl md:text-5xl font-bold my-6 text-destructive">Player 2 Wins This Round!</p>;
      case 'draw': return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">It's a Draw!</p>;
    }
  };

  const isPlayerTurn = gameState === 'player1Turn' || gameState === 'player2Turn';

  if (gameState === 'modeSelection') {
    return (
      <div className="container mx-auto p-4 md:p-8 flex items-center justify-center min-h-[calc(100vh-150px)]">
        <Card className="text-center p-8 shadow-2xl animate-in fade-in-50 zoom-in-95">
          <CardHeader>
            <CardTitle className="text-4xl font-headline">Choose Your Mode</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row gap-4">
            <Button onClick={() => startNewGame('easy')} size="lg" className="h-24 text-2xl w-full">
              <Baby className="mr-4 h-8 w-8" />
              Easy
            </Button>
            <Button onClick={() => startNewGame('pro')} size="lg" className="h-24 text-2xl w-full" variant="destructive">
               <BrainCircuit className="mr-4 h-8 w-8" />
               Pro
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      {showConfetti && totalWinner === 'Player 1' && <Confetti recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
        <Card className="text-center p-4 shadow-lg w-full md:w-auto">
          <CardHeader className="p-0 mb-2">
            <CardTitle className="text-lg text-muted-foreground font-headline">Scoreboard (Round {currentRound}/{TOTAL_ROUNDS})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex justify-around items-center gap-4">
              <div className="flex items-center gap-2 text-xl font-bold">
                <User /> P1: <span className="text-primary">{player1TotalScore}</span>
              </div>
              <div className="flex items-center gap-2 text-xl font-bold">
                <Users /> P2: <span className="text-destructive">{player2TotalScore}</span>
              </div>
          </CardContent>
        </Card>
        
        <div className="w-full md:w-auto flex-grow flex flex-col items-center justify-center gap-4">
            <div className="flex gap-2 w-full max-w-xs">
              <Button onClick={handleNewGameClick} size="lg" className="shadow-lg flex-grow">
                <RefreshCw className="mr-2 h-5 w-5"/> New Game
              </Button>
              <Button onClick={handleBackToMenu} size="lg" className="shadow-lg" variant="outline">
                <ArrowLeft className="mr-2 h-5 w-5"/> Menu
              </Button>
            </div>
            <Card className="text-center p-4 shadow-lg w-full max-w-xs">
            <CardHeader className="p-0 mb-1">
                <CardTitle className="text-lg text-muted-foreground font-headline">Target</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex items-center justify-center gap-2">
                <p className="text-6xl font-bold text-primary">{targetNumber}</p>
                <Button variant="ghost" size="icon" onClick={() => setShowHint(true)} className="text-muted-foreground">
                <Lightbulb className="h-6 w-6" />
                <span className="sr-only">Show hint</span>
                </Button>
            </CardContent>
            </Card>
        </div>

        <div className="w-full md:w-auto" />


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
           {targetEquation && (
            <p className="text-center text-2xl font-bold">
              {targetEquation} = <span className="text-primary">{targetNumber}</span>
            </p>
          )}
          {gameMode === 'pro' && (
             <p className="text-center text-2xl font-bold">
                Concatenated to form <span className="text-primary">{targetNumber}</span>
             </p>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowHint(false)}>Got it!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showTurnInterstitial} onOpenChange={setShowTurnInterstitial}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline text-4xl text-center">Player 2's Turn!</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg">
              Pass the device to Player 2. A new card has been added to their hand.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-center items-center gap-2 my-4">
            <Users className="w-16 h-16 text-destructive" />
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowTurnInterstitial(false)}>Start Turn</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {gameState === 'gameOver' && (
         <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
           <CardTitle className="text-5xl font-headline mb-4 flex items-center justify-center gap-4"><Trophy className="w-12 h-12 text-yellow-400" />Game Over!</CardTitle>
           {totalWinner === 'Player 1' && <p className="text-4xl font-bold my-6 text-primary">Player 1 is the Grand Winner!</p>}
           {totalWinner === 'Player 2' && <p className="text-4xl font-bold my-6 text-destructive">Player 2 is the Grand Winner!</p>}
           {totalWinner === 'draw' && <p className="text-4xl font-bold my-6 text-muted-foreground">It's a tie!</p>}
           
           <div className="text-2xl font-bold">Final Score</div>
           <div className="flex justify-center items-center gap-8 text-xl my-4">
              <div className="flex items-center gap-2"><User /> Player 1: <span className="text-primary">{player1TotalScore}</span></div>
              <div className="flex items-center gap-2"><Users /> Player 2: <span className="text-destructive">{player2TotalScore}</span></div>
           </div>
          
           <Button onClick={() => setGameState('modeSelection')} size="lg" className="mt-8">Play Again</Button>
         </Card>
       )}

      {gameState === 'roundOver' && (
        <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
          <CardTitle className="text-4xl font-headline mb-4">Round {currentRound} Over!</CardTitle>
          {renderRoundWinner()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
            <div className='space-y-2'>
              <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><User /> Player 1 Score: <span className="text-primary">{player1RoundScore}</span></h3>
              <div className="flex items-center justify-center gap-2 flex-wrap min-h-[52px]">
                Equation:
                {!player1Passed ? (
                  <>
                  {player1EquationString}
                  <span className="mx-2">=</span>
                  <span className="font-bold text-accent">{player1FinalResult}</span>
                  </>
                ) : <p>Passed.</p>}
              </div>
            </div>
            <div className='space-y-2'>
              <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><Users /> Player 2 Score: <span className="text-destructive">{player2RoundScore}</span></h3>
              <div className="flex items-center justify-center gap-2 flex-wrap min-h-[52px]">
                Equation:
                {!player2Passed ? (
                  <>
                  {player2EquationString}
                  <span className="mx-2">=</span>
                  <span className="font-bold text-accent">{player2FinalResult}</span>
                  </>
                ) : <p>Passed.</p>}
              </div>
            </div>
          </div>
          <Button onClick={handleNextRound} size="lg" className="mt-8">
            {currentRound >= TOTAL_ROUNDS ? 'Show Final Results' : 'Next Round'}
          </Button>
        </Card>
      )}
      
      {isPlayerTurn && (
        <Card className="shadow-lg sticky top-4 z-10 bg-card/90 backdrop-blur-sm p-3 max-w-md mx-auto">
          <CardHeader className="p-0">
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              {currentPlayer === 'Player 1' ? <User /> : <Users />}
              {currentPlayer}'s Turn ({gameMode} mode)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <div className="flex items-center gap-2 bg-muted p-2 rounded-lg min-h-[48px] text-xl font-bold flex-wrap">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-base font-normal">Click cards to build an equation.</span>}
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className={cn("grid grid-cols-3 gap-2", gameMode === 'pro' && "grid-cols-2")}>
                {gameMode === 'pro' && (
                  <>
                    <Button onClick={() => handleParenthesisClick('(')} variant="outline" size="sm" className="font-bold text-lg">(</Button>
                    <Button onClick={() => handleParenthesisClick(')')} variant="outline" size="sm" className="font-bold text-lg">)</Button>
                  </>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={handleSubmitEquation} className="flex-grow" size="sm" disabled={equation.length === 0}>
                  <Send className="mr-2 h-4 w-4"/> Submit
                </Button>
                <Button onClick={handlePass} className="flex-grow" variant="secondary" size="sm">
                  <LogOut className="mr-2 h-4 w-4"/> Pass
                </Button>
                <Button onClick={handleClearEquation} variant="destructive" className="flex-grow" disabled={equation.length === 0} size="sm">
                  <X className="mr-2 h-4 w-4"/> Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isPlayerTurn && (
        <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-2xl font-bold font-headline mb-4 flex items-center justify-center gap-2">
                {currentPlayer === 'Player 1' ? <User /> : <Users />}
                {currentPlayer}'s Hand
              </h2>
              <div className="flex flex-wrap justify-center gap-2 md:gap-4">
                {activeHand.map((card, index) => (
                  <div key={`${card.suit}-${card.rank}-${index}`} className="transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-10">
                    <GameCard
                      card={card}
                      onClick={() => handleCardClick(card, index)}
                      className={cn(
                        'transition-all duration-200',
                        usedCardIndices.has(index) && "opacity-30 scale-90 -translate-y-4 cursor-not-allowed",
                        !isPlayerTurn && "cursor-not-allowed"
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
