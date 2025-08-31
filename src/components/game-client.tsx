
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, EquationTerm, GameMode, Player } from '@/lib/types';
import { createDeck, shuffleDeck, generateTarget, evaluateEquation, calculateScore, getCardValues } from '@/lib/game';
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
import { Label } from './ui/label';
import { Slider } from './ui/slider';

type GameState = 'initial' | 'playerSelection' | 'playerTurn' | 'roundOver' | 'gameOver';

const TOTAL_ROUNDS = 3;

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>('playerSelection');
  const [gameMode, setGameMode] = useState<GameMode>('easy');
  const [numberOfPlayers, setNumberOfPlayers] = useState(2);
  const [players, setPlayers] = useState<Player[]>([]);

  const [deck, setDeck] = useState<CardType[]>([]);
  
  const [targetNumber, setTargetNumber] = useState<number>(0);
  const [targetCards, setTargetCards] = useState<CardType[]>([]);
  const [equation, setEquation] = useState<EquationTerm[]>([]);
  const [usedCardIndices, setUsedCardIndices] = useState<Set<number>>(new Set());
    
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  
  const [showHint, setShowHint] = useState(false);
  
  const [roundWinner, setRoundWinner] = useState<Player[] | null>(null);

  const [currentRound, setCurrentRound] = useState(1);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showTurnInterstitial, setShowTurnInterstitial] = useState(false);

  const { toast } = useToast();
  
  const CARD_VALUES = useMemo(() => getCardValues(gameMode), [gameMode]);

  const currentPlayer = useMemo(() => {
    if (players.length > 0) {
      return players[currentPlayerIndex];
    }
    return null;
  }, [players, currentPlayerIndex]);

  const activeHand = useMemo(() => {
    return currentPlayer?.hand ?? [];
  }, [currentPlayer]);

  const startNewGame = useCallback((mode: GameMode, numPlayers: number) => {
    setGameState('initial');
    setGameMode(mode);
    setNumberOfPlayers(numPlayers);
    setCurrentRound(1);
    setShowConfetti(false);
    
    // Reset total scores for all players
    const initialPlayers = Array.from({ length: numPlayers }, (_, i) => ({
      id: i,
      name: `Player ${i + 1}`,
      hand: [],
      roundScore: 0,
      totalScore: 0, 
      passed: false,
      finalResult: 0,
      equation: [],
    }));
    setPlayers(initialPlayers);

    startNewRound(mode, numPlayers, initialPlayers);
  }, []);
  
  const startNewRound = useCallback((mode: GameMode, numPlayers: number, currentPlayers: Player[]) => {
    const deckCount = numPlayers > 4 ? 2 : 1;
    let freshDeck = shuffleDeck(createDeck(deckCount));
    const { target, cardsUsed, updatedDeck } = generateTarget(freshDeck, mode);
    
    setTargetNumber(target);
    setTargetCards(cardsUsed);
    freshDeck = updatedDeck;
    
    const newPlayers = currentPlayers.map(p => {
        const hand = freshDeck.splice(0, 5);
        return {
          ...p,
          hand,
          roundScore: 0,
          passed: false,
          finalResult: 0,
          equation: [],
        }
    });

    // Player 1 automatically draws a card
    if (freshDeck.length > 0) {
        newPlayers[0].hand.push(freshDeck.shift()!);
    }

    setPlayers(newPlayers);
    setDeck(freshDeck);
    
    setEquation([]);
    setUsedCardIndices(new Set());
    setRoundWinner(null);
    setShowHint(false);
    setCurrentPlayerIndex(0);
    setGameState('playerTurn');
  }, []);

  const handleParenthesisClick = (paren: '(' | ')') => {
    setEquation([...equation, paren]);
  };

  const handleCardClick = (card: CardType, index: number) => {
    if (gameState !== 'playerTurn') return;
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
  
  const handleAllPlayersPass = useCallback(() => {
    toast({ title: "All players passed!", description: "Drawing a new card for each player."});
    
    let nextDeck = [...deck];
    const updatedPlayers = players.map(p => {
        const newHand = [...p.hand];
        if (nextDeck.length > 0) {
            newHand.push(nextDeck.shift()!);
        }
        return {...p, hand: newHand, passed: false };
    });
    
    setDeck(nextDeck);
    setPlayers(updatedPlayers);
    setEquation([]);
    setUsedCardIndices(new Set());
    setCurrentPlayerIndex(0);
    setGameState('playerTurn');
  }, [deck, players, toast]);

  const determineRoundWinner = useCallback((currentPlayers: Player[]) => {
    const highestScore = Math.max(...currentPlayers.map(p => p.roundScore));
    const winners = currentPlayers.filter(p => p.roundScore === highestScore);
    
    setRoundWinner(winners);

    const nextPlayers = currentPlayers.map(p => ({
        ...p,
        totalScore: p.totalScore + p.roundScore,
    }));
    
    setPlayers(nextPlayers);
    setGameState('roundOver');
  }, []);

  const switchTurn = () => {
    setEquation([]);
    setUsedCardIndices(new Set());
    
    const nextPlayerIndex = (currentPlayerIndex + 1) % numberOfPlayers;
    
    let nextDeck = [...deck];
    if (nextDeck.length > 0) {
      const updatedPlayers = [...players];
      updatedPlayers[nextPlayerIndex].hand.push(nextDeck.shift()!);
      setPlayers(updatedPlayers);
      setDeck(nextDeck);
      toast({title: `${players[nextPlayerIndex].name} Drew a Card`, description: `A new card has been added to ${players[nextPlayerIndex].name}'s hand.`});
    }

    setCurrentPlayerIndex(nextPlayerIndex);
    setGameState('playerTurn');
    if (numberOfPlayers > 1) {
      setShowTurnInterstitial(true);
    }
  };

  const endPlayerTurn = (result: number, cardsUsedCount: number, passed: boolean) => {
    const newScore = passed ? 0 : calculateScore(result, targetNumber, cardsUsedCount);
    
    const updatedPlayers = players.map((p, index) => {
        if (index === currentPlayerIndex) {
            return { ...p, roundScore: newScore, finalResult: result, equation: passed ? [] : equation, passed: passed };
        }
        return p;
    });

    setPlayers(updatedPlayers);

    if (updatedPlayers.every(p => p.passed)) {
        handleAllPlayersPass();
        return;
    }

    if (currentPlayerIndex === numberOfPlayers - 1) { // Last player's turn
        determineRoundWinner(updatedPlayers);
    } else {
        switchTurn();
    }
  };

  const handlePass = () => {
    if (gameState !== 'playerTurn' || !currentPlayer) return;
    endPlayerTurn(0, 0, true);
  };
  
  const handleSubmitEquation = () => {
    if (gameState !== 'playerTurn' || !currentPlayer) return;

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

    const result = evaluateEquation(equation, gameMode);

    if (typeof result === 'object' && result.error) {
        toast({ title: "Invalid Equation", description: result.error, variant: 'destructive'});
        return;
    }
    
    if (typeof result === 'number') {
      endPlayerTurn(result, usedCardIndices.size, false);
    }
  };

  const totalWinner = useMemo(() => {
    if (gameState !== 'gameOver') return [];
    if (players.length === 0) return [];
    const maxScore = Math.max(...players.map(p => p.totalScore));
    return players.filter(p => p.totalScore === maxScore);
  }, [players, gameState]);

  useEffect(() => {
    if (gameState === 'gameOver' && !showConfetti) {
        const player1Won = totalWinner.some(w => w.id === 0);
        if(player1Won) {
          setShowConfetti(true);
        }
    }
  }, [gameState, showConfetti, totalWinner]);


  const handleNextRound = () => {
    if (currentRound >= TOTAL_ROUNDS) {
      setGameState('gameOver');
    } else {
      setCurrentRound(prev => prev + 1);
      startNewRound(gameMode, numberOfPlayers, players);
    }
  };
  
  const handleNewGameClick = () => {
    startNewGame(gameMode, numberOfPlayers);
  }

  const handleBackToMenu = () => {
    setGameState('playerSelection');
  }

  const equationString = useMemo(() => equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*' || term === '/') ? 'default' : 'outline'} className="text-xl p-2">{term === '*' ? '×' : term === '/' ? '÷' : term}</Badge>
  )), [equation]);
  
  const targetEquation = useMemo(() => {
    if (!targetCards || targetCards.length === 0) return null;
    const CARD_VALUES = getCardValues(gameMode);
    if (gameMode === 'easy') {
      return targetCards.map(c => CARD_VALUES[c.rank]).join(' ');
    }
    // For pro mode, just show the cards
    return null;
  }, [targetCards, gameMode]);

  const renderRoundWinner = () => {
    if (!roundWinner || roundWinner.length === 0) return null;
    if (roundWinner.length > 1) {
        return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">It's a Draw!</p>;
    }
    return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">{roundWinner[0].name} Wins This Round!</p>;
  };

  const isPlayerTurn = gameState === 'playerTurn';

  if (gameState === 'playerSelection') {
    return (
      <div className="container mx-auto p-4 md:p-8 flex items-center justify-center min-h-[calc(100vh-150px)]">
        <Card className="text-center p-8 shadow-2xl animate-in fade-in-50 zoom-in-95 w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-4xl font-headline">Game Setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            <div className="space-y-4">
                <Label htmlFor="num-players" className="text-xl">Number of Players</Label>
                <div className="flex items-center gap-4">
                    <Slider
                        id="num-players"
                        min={2}
                        max={8}
                        step={1}
                        value={[numberOfPlayers]}
                        onValueChange={(value) => setNumberOfPlayers(value[0])}
                    />
                    <span className="text-2xl font-bold w-12 text-center">{numberOfPlayers}</span>
                </div>
            </div>
            <div className="space-y-4">
                <Label className="text-xl">Game Mode</Label>
                <div className="flex flex-col md:flex-row gap-4">
                    <Button onClick={() => startNewGame('easy', numberOfPlayers)} size="lg" className="h-24 text-2xl w-full">
                      <Baby className="mr-4 h-8 w-8" />
                      Easy
                    </Button>
                    <Button onClick={() => startNewGame('pro', numberOfPlayers)} size="lg" className="h-24 text-2xl w-full" variant="destructive">
                       <BrainCircuit className="mr-4 h-8 w-8" />
                       Pro
                    </Button>
                </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      {showConfetti && <Confetti recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
        <Card className="text-center p-4 shadow-lg w-full md:w-auto">
          <CardHeader className="p-0 mb-2">
            <CardTitle className="text-lg text-muted-foreground font-headline">Scoreboard (Round {currentRound}/{TOTAL_ROUNDS})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 grid gap-2" style={{gridTemplateColumns: `repeat(${numberOfPlayers}, 1fr)`}}>
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-lg font-bold">
                    <User /> {p.name.replace('Player ', 'P')}: <span className="text-primary">{p.totalScore}</span>
                </div>
              ))}
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
                <GameCard key={index} card={card} mode={gameMode} />
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
            <AlertDialogTitle className="font-headline text-4xl text-center">{players[(currentPlayerIndex)]?.name}'s Turn!</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg">
              Pass the device to {players[currentPlayerIndex]?.name}. A new card has been added to their hand.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-center items-center gap-2 my-4">
            <Users className="w-16 h-16 text-primary" />
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowTurnInterstitial(false)}>Start Turn</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {gameState === 'gameOver' && (
         <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
           <CardTitle className="text-5xl font-headline mb-4 flex items-center justify-center gap-4"><Trophy className="w-12 h-12 text-yellow-400" />Game Over!</CardTitle>
           {totalWinner.length > 1 && <p className="text-4xl font-bold my-6 text-muted-foreground">It's a tie between {totalWinner.map(p => p.name).join(' and ')}!</p>}
           {totalWinner.length === 1 && <p className="text-4xl font-bold my-6 text-primary">{totalWinner[0].name} is the Grand Winner!</p>}
           
           <div className="text-2xl font-bold">Final Scores</div>
           <div className="flex justify-center items-center gap-8 text-xl my-4 flex-wrap">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-2"><User /> {p.name}: <span className="text-primary">{p.totalScore}</span></div>
              ))}
           </div>
          
           <Button onClick={() => setGameState('playerSelection')} size="lg" className="mt-8">Play Again</Button>
         </Card>
       )}

      {gameState === 'roundOver' && (
        <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95">
          <CardTitle className="text-4xl font-headline mb-4">Round {currentRound} Over!</CardTitle>
          {renderRoundWinner()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
            {players.map(player => (
                <div key={player.id} className='space-y-2'>
                  <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><User /> {player.name} Score: <span className="text-primary">{player.roundScore}</span></h3>
                  <div className="flex items-center justify-center gap-2 flex-wrap min-h-[52px]">
                    Equation:
                    {!player.passed ? (
                      <>
                      {player.equation.map((term, i) => (
                        <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*' || term === '/') ? 'default' : 'outline'} className="text-xl p-2">{term === '*' ? '×' : term === '/' ? '÷' : term}</Badge>
                      ))}
                      <span className="mx-2">=</span>
                      <span className="font-bold text-accent">{player.finalResult}</span>
                      </>
                    ) : <p>Passed.</p>}
                  </div>
                </div>
            ))}
          </div>
          <Button onClick={handleNextRound} size="lg" className="mt-8">
            {currentRound >= TOTAL_ROUNDS ? 'Show Final Results' : 'Next Round'}
          </Button>
        </Card>
      )}
      
      {isPlayerTurn && currentPlayer && (
        <Card className="shadow-lg sticky top-4 z-10 bg-card/90 backdrop-blur-sm p-3 max-w-md mx-auto">
          <CardHeader className="p-0">
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <User />
              {currentPlayer.name}'s Turn ({gameMode} mode)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <div className="flex items-center gap-2 bg-muted p-2 rounded-lg min-h-[48px] text-xl font-bold flex-wrap">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-base font-normal">Click cards to build an equation.</span>}
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className={cn("grid grid-cols-2 gap-2", gameMode !== 'pro' && "hidden")}>
                <Button onClick={() => handleParenthesisClick('(')} variant="outline" size="sm" className="font-bold text-lg">(</Button>
                <Button onClick={() => handleParenthesisClick(')')} variant="outline" size="sm" className="font-bold text-lg">)</Button>
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

      {isPlayerTurn && currentPlayer && (
        <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-2xl font-bold font-headline mb-4 flex items-center justify-center gap-2">
                <User />
                {currentPlayer.name}'s Hand
              </h2>
              <div className="flex flex-wrap justify-center gap-2 md:gap-4">
                {activeHand.map((card, index) => (
                  <div key={`${card.suit}-${card.rank}-${index}`} className="transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-10">
                    <GameCard
                      card={card}
                      mode={gameMode}
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

    