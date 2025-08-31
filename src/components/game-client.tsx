"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, Hand, EquationTerm } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, evaluateEquation, calculateScore, CARD_VALUES } from '@/lib/game';
import { RefreshCw, Send, X, Lightbulb, User, LogOut, FilePlus, Trophy, Users } from 'lucide-react';
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

type GameState = 'initial' | 'player1Turn' | 'player2Turn' | 'roundOver' | 'gameOver';
type Player = 'Player 1' | 'Player 2';
const MAX_DRAWS = 3;
const TOTAL_ROUNDS = 3;

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>('initial');
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

  const [currentPlayer, setCurrentPlayer] = useState<Player>('Player 1');
  
  const [showHint, setShowHint] = useState(false);
  const [drawsLeft, setDrawsLeft] = useState(MAX_DRAWS);
  
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

  const startNewGame = useCallback(() => {
    setCurrentRound(1);
    setPlayer1TotalScore(0);
    setPlayer2TotalScore(0);
    setShowConfetti(false);
    startNewRound();
  }, []);
  
  const startNewRound = useCallback(() => {
    const newDeck = shuffleDeck(createDeck());
    const { target, cardsUsed } = generateTarget();
    
    setTargetNumber(target);
    setTargetCards(cardsUsed);

    setPlayer1Hand(newDeck.slice(0, 5));
    setPlayer2Hand(newDeck.slice(5, 10));
    setDeck(newDeck.slice(10));
    
    setEquation([]);
    setUsedCardIndices(new Set());
    setPlayer1RoundScore(0);
    setPlayer1FinalResult(0);
    setPlayer1Equation([]);
    setPlayer2RoundScore(0);
    setPlayer2FinalResult(0);
    setPlayer2Equation([]);
    setRoundWinner(null);
    setShowHint(false);
    setDrawsLeft(MAX_DRAWS);
    setCurrentPlayer('Player 1');
    setGameState('player1Turn');
  }, []);


  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const handleCardClick = (card: CardType, index: number) => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;
    if (usedCardIndices.has(index)) return;

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
  
  const switchTurn = () => {
    setEquation([]);
    setUsedCardIndices(new Set());
    setDrawsLeft(MAX_DRAWS);
    if (currentPlayer === 'Player 1') {
      setCurrentPlayer('Player 2');
      setGameState('player2Turn');
      setShowTurnInterstitial(true);
    } else {
      // Player 2 finished, end of round
      determineRoundWinner();
    }
  };

  const endPlayerTurn = (result: number, cardsUsedCount: number) => {
    const newScore = calculateScore(result, targetNumber, cardsUsedCount);

    if (currentPlayer === 'Player 1') {
      setPlayer1RoundScore(newScore);
      setPlayer1FinalResult(result);
      setPlayer1Equation(equation);
      switchTurn();
    } else { // Player 2
      setPlayer2RoundScore(newScore);
      setPlayer2FinalResult(result);
      setPlayer2Equation(equation);
      determineRoundWinner();
    }
  };

  const handleDrawCard = () => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;
    if (drawsLeft <= 0 || deck.length === 0) return;

    const [newCard, ...restOfDeck] = deck;
    if (currentPlayer === 'Player 1') {
      setPlayer1Hand([...player1Hand, newCard]);
    } else {
      setPlayer2Hand([...player2Hand, newCard]);
    }
    setDeck(restOfDeck);
    setDrawsLeft(drawsLeft - 1);
    toast({ title: "Card Drawn", description: "You drew a new card."});
  };

  const handlePass = () => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;
    endPlayerTurn(0, 0);
  };
  
  const handleSubmitEquation = () => {
    if (gameState !== 'player1Turn' && gameState !== 'player2Turn') return;
    if (equation.length < 3) return;

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

  const determineRoundWinner = useCallback(() => {
    setPlayer1TotalScore(prev => prev + player1RoundScore);
    setPlayer2TotalScore(prev => prev + player2RoundScore);

    if (player1RoundScore > player2RoundScore) {
      setRoundWinner('Player 1');
    } else if (player2RoundScore > player1RoundScore) {
      setRoundWinner('Player 2');
    } else {
      setRoundWinner('draw');
    }

    if (currentRound >= TOTAL_ROUNDS) {
      setGameState('gameOver');
    } else {
      setGameState('roundOver');
    }
  }, [currentRound, player1RoundScore, player2RoundScore]);

  useEffect(() => {
    if (gameState === 'gameOver') {
      if (player1TotalScore > player2TotalScore) {
        setShowConfetti(true);
      }
    }
  }, [gameState, player1TotalScore, player2TotalScore]);

  const handleNextRound = () => {
    setCurrentRound(prev => prev + 1);
    startNewRound();
  };

  const equationString = useMemo(() => equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : 'default'} className="text-xl p-2">{term}</Badge>
  )), [equation]);
  
  const player1EquationString = useMemo(() => player1Equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : 'default'} className="text-xl p-2">{term}</Badge>
  )), [player1Equation]);

  const player2EquationString = useMemo(() => player2Equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : 'default'} className="text-xl p-2">{term}</Badge>
  )), [player2Equation]);

  const targetEquation = useMemo(() => {
    if (!targetCards || targetCards.length === 0) return null;
    return targetCards.map(c => CARD_VALUES[c.rank]).join(' ');
  }, [targetCards]);

  const renderRoundWinner = () => {
    if (!roundWinner) return null;
    switch (roundWinner) {
      case 'Player 1': return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">Player 1 Wins This Round!</p>;
      case 'Player 2': return <p className="text-4xl md:text-5xl font-bold my-6 text-destructive">Player 2 Wins This Round!</p>;
      case 'draw': return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">It's a Draw!</p>;
    }
  };

  const totalWinner = useMemo(() => {
    if (gameState !== 'gameOver') return null;
    if (player1TotalScore > player2TotalScore) return 'Player 1';
    if (player2TotalScore > player1TotalScore) return 'Player 2';
    return 'draw';
  }, [gameState, player1TotalScore, player2TotalScore]);

  const isPlayerTurn = gameState === 'player1Turn' || gameState === 'player2Turn';

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      {showConfetti && totalWinner === 'Player 1' && <Confetti recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
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
                <User /> P1: <span className="text-primary">{player1TotalScore}</span>
              </div>
              <div className="flex items-center gap-2 text-xl font-bold">
                <Users /> P2: <span className="text-destructive">{player2TotalScore}</span>
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

      <AlertDialog open={showTurnInterstitial} onOpenChange={setShowTurnInterstitial}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline text-4xl text-center">Player 2's Turn!</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg">
              Pass the device to Player 2.
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
          
           <Button onClick={startNewGame} size="lg" className="mt-8">Play Again</Button>
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
                {player1RoundScore > 0 ? (
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
                {player2RoundScore > 0 ? (
                  <>
                  {player2EquationString}
                  <span className="mx-2">=</span>
                  <span className="font-bold text-accent">{player2FinalResult}</span>
                  </>
                ) : <p>Passed.</p>}
              </div>
            </div>
          </div>
          <Button onClick={handleNextRound} size="lg" className="mt-8">Next Round</Button>
        </Card>
      )}
      
      {isPlayerTurn && (
        <Card className="shadow-lg sticky top-[88px] z-10 bg-card/90 backdrop-blur-sm">
          <CardHeader className="p-3">
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              {currentPlayer === 'Player 1' ? <User /> : <Users />}
              {currentPlayer}'s Turn
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex items-center gap-2 bg-muted p-2 rounded-lg min-h-[48px] text-xl font-bold flex-wrap">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-base font-normal">Click cards to build an equation.</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              {equation.length >= 3 ? (
                <Button onClick={handleSubmitEquation} className="flex-grow col-span-2 md:col-span-1" size="sm">
                  <Send className="mr-2 h-4 w-4"/> Submit
                </Button>
              ) : (
                <Button onClick={handlePass} className="flex-grow col-span-2 md:col-span-1" variant="secondary" size="sm">
                  <LogOut className="mr-2 h-4 w-4"/> Pass
                </Button>
              )}
               <Button onClick={handleClearEquation} variant="destructive" className="flex-grow" disabled={equation.length === 0} size="sm">
                <X className="mr-2 h-4 w-4"/> Clear
              </Button>
              <Button onClick={handleDrawCard} variant="outline" className="flex-grow" disabled={drawsLeft <= 0 || deck.length === 0} size="sm">
                <FilePlus className="mr-2 h-4 w-4" /> Draw ({drawsLeft})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPlayerTurn && (
        <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold font-headline mb-4 mt-8 flex items-center gap-2">
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
