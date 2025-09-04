
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDocument, useCollection } from 'react-firebase-hooks/firestore';
import { doc, collection, onSnapshot, getFirestore } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GameCard } from '@/components/game-card';
import { useToast } from '@/hooks/use-toast';
import type { Card as CardType, EquationTerm, GameState, Game, Player, Rank } from '@/lib/types';
import { evaluateEquation, getCardValues, SPECIAL_RANKS } from '@/lib/game';
import { RefreshCw, Send, X, Lightbulb, User, LogOut, Trophy, Users, BrainCircuit, Baby, ArrowLeft, Copy, Sparkles, Settings } from 'lucide-react';
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
import { firebaseApp } from '@/lib/firebase';
import * as gameActions from '@/ai/flows/game-actions';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from './ui/dialog';
import { Checkbox } from './ui/checkbox';

const db = getFirestore(firebaseApp);


function SpecialCardConfig({ game, onSave, onCancel }: { game: Game, onSave: (allowed: Rank[]) => void, onCancel: () => void }) {
    const [selectedCards, setSelectedCards] = useState<Set<Rank>>(new Set(game.allowedSpecialCards ?? SPECIAL_RANKS));
    const CARD_VALUES = getCardValues('special');

    const handleToggle = (rank: Rank) => {
        const newSelection = new Set(selectedCards);
        if (newSelection.has(rank)) {
            newSelection.delete(rank);
        } else {
            newSelection.add(rank);
        }
        setSelectedCards(newSelection);
    };

    const handleSave = () => {
        onSave(Array.from(selectedCards));
    };

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="font-headline text-2xl">Configure Special Cards</DialogTitle>
                    <DialogDescription>
                        Select which special cards will be included in the deck for this game.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                    {SPECIAL_RANKS.map(rank => (
                        <div key={rank} className="flex flex-col items-center gap-2">
                             <GameCard
                                card={{ id: rank, suit: 'Special', rank }}
                                mode="special"
                                onClick={() => handleToggle(rank)}
                                className={cn(!selectedCards.has(rank) && "opacity-50 grayscale")}
                            />
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id={`check-${rank}`}
                                    checked={selectedCards.has(rank)}
                                    onCheckedChange={() => handleToggle(rank)}
                                />
                                <label
                                    htmlFor={`check-${rank}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    {CARD_VALUES[rank]}
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                    <Button onClick={handleSave}>Save Configuration</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function GameClient({ gameId, playerName }: { gameId: string, playerName: string }) {
  const [gameDoc, loading, error] = useDocument(doc(db, 'games', gameId));
  const [playersCollection] = useCollection(collection(db, 'games', gameId, 'players'));

  const [localPlayerName, setLocalPlayerName] = useState(playerName);
  const [equation, setEquation] = useState<EquationTerm[]>([]);
  const [usedCardIndices, setUsedCardIndices] = useState<Set<number>>(new Set());
  const [showHint, setShowHint] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isRematching, setIsRematching] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [selectedToDiscard, setSelectedToDiscard] = useState<Set<string>>(new Set());
  const [isSpecialConfigOpen, setIsSpecialConfigOpen] = useState(false);
  
  const { toast } = useToast();
  const router = useRouter();

  const game = useMemo(() => gameDoc?.data() as Game | undefined, [gameDoc]);
  const players = useMemo(() => playersCollection?.docs.map(d => ({...d.data(), id: d.id})) as Player[] | undefined, [playersCollection]);

  const localPlayer = useMemo(() => players?.find(p => p.name === localPlayerName), [players, localPlayerName]);
  const lastSpecialPlayRef = useRef(game?.lastSpecialCardPlay);


  const CARD_VALUES = useMemo(() => getCardValues(game?.gameMode ?? 'easy'), [game?.gameMode]);
  
  useEffect(() => {
    if (game?.lastSpecialCardPlay) {
        if (lastSpecialPlayRef.current?.timestamp !== game.lastSpecialCardPlay.timestamp) {
            const { cardRank, playerName, targetPlayerName } = game.lastSpecialCardPlay;
            const cardName = CARD_VALUES[cardRank as Rank];
            let description = `${playerName} played the ${cardName} card!`;
            
            if (cardRank === 'SB' && targetPlayerName) {
                description = `${playerName} used ${cardName} on ${targetPlayerName}!`;
            } else if (cardRank === 'SH') {
                description = `${playerName} used the ${cardName} card and shuffled their hand!`;
            } else if (cardRank === 'CL') {
                 description = `${playerName} used the ${cardName} card to clone a card!`;
            } else if (cardRank === 'DE') {
                description = `${playerName} used the ${cardName} card to change the target!`;
            }

            toast({
                title: 'Special Card Played!',
                description: description,
            });
        }
        lastSpecialPlayRef.current = game.lastSpecialCardPlay;
    }
}, [game?.lastSpecialCardPlay, toast, CARD_VALUES]);

  useEffect(() => {
    if (game?.nextGameId) {
        const playerQueryParam = `?player=${encodeURIComponent(localPlayerName)}`;
        router.push(`/game/${game.nextGameId}${playerQueryParam}`);
    }
  }, [game, router, localPlayerName]);

  useEffect(() => {
    if (!loading && !gameDoc?.exists()) {
      toast({ title: "Game not found", description: "The game ID you entered doesn't exist.", variant: "destructive" });
      router.push('/');
    }
  }, [gameDoc, loading, router, toast]);
  
  useEffect(() => {
    if (localPlayer) {
      setHasJoined(true);
    }
  }, [localPlayer]);

  useEffect(() => {
    const join = async () => {
      if (game && players && !loading && gameDoc?.exists() && !hasJoined) {
        if (!players.find(p => p.name === localPlayerName)) {
          try {
            console.log(`[GameClient] Player '${localPlayerName}' not found in game '${gameId}', attempting to join.`);
            await gameActions.joinGame({ gameId, playerName: localPlayerName });
            toast({ title: `Joined game!`, description: `Welcome, ${localPlayerName}!`});
            setHasJoined(true); 
          } catch (e: any) {
            console.error(`[GameClient] Error joining game:`, e);
            toast({ title: 'Error joining game', description: e.message, variant: 'destructive' });
            router.push('/');
          }
        } else {
            console.log(`[GameClient] Player '${localPlayerName}' already in game '${gameId}'. Skipping join.`);
            setHasJoined(true);
        }
      }
    };
    join();
  }, [game, players, gameId, localPlayerName, router, toast, hasJoined, loading, gameDoc]);


  const currentPlayer = useMemo(() => {
    if (!game || !players || players.length === 0) return null;
    return players.find(p => p.id === game.currentPlayerId);
  }, [game, players]);
  
  const isMyTurn = useMemo(() => {
    return currentPlayer?.id === localPlayer?.id && game?.gameState === 'playerTurn';
  }, [currentPlayer, localPlayer, game]);

  const isDiscarding = useMemo(() => {
    return game?.gameState === 'discarding' && game.discardingPlayerId === localPlayer?.id;
  }, [game, localPlayer]);

  // Reset equation when turn changes
  useEffect(() => {
    if (!isMyTurn) {
        handleClearEquation();
    }
  }, [isMyTurn]);

  // Reset discard selection when discard state changes
  useEffect(() => {
    if (!isDiscarding) {
        setSelectedToDiscard(new Set());
    }
  }, [isDiscarding]);


  const activeHand = useMemo(() => {
    return localPlayer?.hand ?? [];
  }, [localPlayer]);

  const handRow1 = useMemo(() => activeHand.slice(0, 7), [activeHand]);
  const handRow2 = useMemo(() => activeHand.slice(7), [activeHand]);
  
  const handleParenthesisClick = (paren: '(' | ')') => {
    setEquation([...equation, paren]);
  };

  const handleCardClick = (card: CardType, index: number) => {
    if (!isMyTurn) return;
    if (usedCardIndices.has(index)) return;

    if (card.suit === 'Special' && localPlayer) {
        gameActions.playSpecialCard({ gameId, playerId: localPlayer.id, card });
        return;
    }

    const value = CARD_VALUES[card.rank];
    const lastTerm = equation.length > 0 ? equation[equation.length - 1] : null;

    if (game?.gameMode === 'easy') {
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

  const handlePass = async () => {
    if (!isMyTurn || !localPlayer) return;
    try {
      await gameActions.playerAction({ gameId, playerId: localPlayer.id, action: 'pass' });
      handleClearEquation();
    } catch(e: any) {
       toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };
  
  const handleSubmitEquation = async () => {
    if (!isMyTurn || !localPlayer || !game) return;

    if (game.gameMode === 'easy') {
        if (equation.length === 1) {
            if (typeof equation[0] !== 'number') {
                toast({ title: "Invalid Submission", description: "If you submit one card, it must be a number.", variant: 'destructive'});
                return;
            }
        } else if (equation.length > 1) {
            if (typeof equation[equation.length - 1] !== 'number') {
                toast({ title: "Invalid Equation", description: "Equation must end with a number.", variant: 'destructive'});
                return;
            }
        }
    }

    const result = evaluateEquation(equation, game.gameMode);

    if (typeof result === 'object' && result.error) {
        if (game.gameMode === 'special') {
            toast({ title: "Invalid Equation", description: result.error, variant: 'destructive'});
        }
        return;
    }

    const cardsUsed = Array.from(usedCardIndices).map(index => activeHand[index]);
    
    try {
      await gameActions.playerAction({
        gameId,
        playerId: localPlayer.id,
        action: 'submit',
        equation,
        cardsUsed: cardsUsed,
      });
      handleClearEquation();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };
  
  const handleStartGame = async () => {
    if (!game || !players) return;
    if (players.length < 1) {
      toast({ title: "Not enough players", description: "You need at least 1 player to start.", variant: 'destructive' });
      return;
    }
    if (game.creatorId !== localPlayer?.id) {
       toast({ title: "Only the creator can start the game", variant: 'destructive' });
       return;
    }
    await gameActions.startGame({ gameId });
  };
  
  const handleSetGameMode = async (mode: 'easy' | 'pro' | 'special') => {
    if (game?.creatorId === localPlayer?.id) {
        if (mode === 'special') {
            setIsSpecialConfigOpen(true);
        } else {
            await gameActions.setGameMode({gameId, mode});
        }
    }
  }

  const handleSaveSpecialConfig = async (allowedCards: Rank[]) => {
    await gameActions.setAllowedSpecialCards({ gameId, allowedCards });
    await gameActions.setGameMode({ gameId, mode: 'special' });
    setIsSpecialConfigOpen(false);
    toast({ title: "Special Mode Configured!", description: "The special cards for this game have been set." });
  };

  const totalWinner = useMemo(() => {
    if (game?.gameState !== 'gameOver' || !players) return [];
    if (players.length === 0) return [];
    const maxScore = Math.max(...players.map(p => p.totalScore));
    return players.filter(p => p.totalScore === maxScore);
  }, [players, game]);
  
  useEffect(() => {
    if (game?.gameState === 'gameOver' && !showConfetti) {
        const playerIsWinner = totalWinner.some(w => w.id === localPlayer?.id);
        if (playerIsWinner) {
          setShowConfetti(true);
        }
    }
  }, [game, showConfetti, totalWinner, localPlayer]);
  
  const handleNextRound = async () => {
     if (game && game.creatorId === localPlayer?.id) {
        await gameActions.nextRound({gameId});
     }
  };
  
  const handleNewGameClick = async () => {
    if (!localPlayerName) {
      toast({ title: 'Player name not found', description: 'Cannot create a new game.', variant: 'destructive' });
      return;
    }
    try {
      const newGameId = await gameActions.createGame({ creatorName: localPlayerName });
      if (newGameId) {
        router.push(`/game/${newGameId}?player=${encodeURIComponent(localPlayerName)}`);
      }
    } catch(e) {
        console.error('Failed to create game:', e);
        toast({ title: 'Failed to create game', description: 'Please try again.', variant: 'destructive' });
    }
  }
  
  const handleRematch = async () => {
    if (isRematching) return;
    setIsRematching(true);
    try {
        await gameActions.rematch({gameId});
        toast({ title: "New game created!", description: "Starting a new match with the same players." });
    } catch(e: any) {
        console.error('Failed to create rematch:', e);
        toast({ title: 'Failed to create new game', description: e.message, variant: 'destructive' });
    }
    setIsRematching(false);
  }

  const handleBackToMenu = () => {
    router.push('/');
  }
  
  const copyGameId = () => {
    navigator.clipboard.writeText(gameId);
    toast({title: "Game ID Copied!", description: "Share it with your friends to join."});
  }

  const handleSpecialAction = async (target: any) => {
    if (!game || !game.specialAction || !localPlayer) return;
    await gameActions.resolveSpecialCard({
        gameId,
        playerId: localPlayer.id,
        card: { suit: 'Special', rank: game.specialAction.cardRank, id: '' }, // id can be dummy
        target
    });
    await gameActions.endSpecialAction({ gameId });
  };

  const handleDiscardCardClick = (card: CardType) => {
    const newSelection = new Set(selectedToDiscard);
    if (newSelection.has(card.id)) {
        newSelection.delete(card.id);
    } else {
        if (newSelection.size < 3) {
            newSelection.add(card.id);
        } else {
            toast({ title: "You can only select 3 cards to discard.", variant: "destructive" });
        }
    }
    setSelectedToDiscard(newSelection);
  };
  
  const handleConfirmDiscard = async () => {
    if (!isDiscarding || !localPlayer || selectedToDiscard.size !== 3) return;
    const cardsToDiscard = activeHand.filter(card => selectedToDiscard.has(card.id));
    try {
        await gameActions.discardCards({ gameId, playerId: localPlayer.id, cardsToDiscard });
    } catch (e: any) {
        toast({ title: "Error Discarding Cards", description: e.message, variant: "destructive" });
    }
  };
  
  const renderSpecialActionUI = () => {
    if (game?.gameState !== 'specialAction' || !game.specialAction || game.specialAction.playerId !== localPlayer?.id) return null;

    const { cardRank } = game.specialAction;

    return (
        <AlertDialog open={true}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Play {CARD_VALUES[cardRank as Rank]} Card</AlertDialogTitle>
                </AlertDialogHeader>
                {cardRank === 'CL' && (
                    <div>
                        <p>Select a card from your hand to clone:</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {activeHand.map((card, index) => (
                                <GameCard key={card.id} card={card} mode={game.gameMode} onClick={() => handleSpecialAction(card)} />
                            ))}
                        </div>
                    </div>
                )}
                {cardRank === 'SB' && (
                     <div>
                        <p>Select a player to sabotage:</p>
                        <div className="flex flex-col gap-2 mt-2">
                             {players?.filter(p => p.id !== localPlayer?.id).map(p => (
                                 <Button key={p.id} onClick={() => handleSpecialAction(p.id)}>{p.name}</Button>
                             ))}
                        </div>
                     </div>
                )}
                 {cardRank === 'DE' && (
                    <div>
                        <p>Select a target card to re-roll:</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {game.targetCards.map((card, index) => (
                                <GameCard key={card.id} card={card} mode={game.gameMode} onClick={() => handleSpecialAction(index)} />
                            ))}
                        </div>
                    </div>
                )}
                 <AlertDialogFooter>
                    <Button variant="ghost" onClick={() => gameActions.endSpecialAction({ gameId })}>Cancel</Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

const renderDiscardUI = () => {
    if (!isDiscarding) return null;

    return (
        <AlertDialog open={true}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Too Many Cards!</AlertDialogTitle>
                    <AlertDialogDescription>
                        Your hand has more than 10 cards. Please select exactly 3 cards to discard.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div>
                    <p className="mb-2 font-bold">Selected: {selectedToDiscard.size} / 3</p>
                    <div className="flex flex-wrap gap-2 justify-center max-h-64 overflow-y-auto">
                        {activeHand.map((card) => (
                            <GameCard
                                key={card.id}
                                card={card}
                                mode={game?.gameMode}
                                onClick={() => handleDiscardCardClick(card)}
                                className={cn(selectedToDiscard.has(card.id) && "ring-4 ring-offset-2 ring-primary")}
                            />
                        ))}
                    </div>
                </div>
                <AlertDialogFooter>
                    <Button
                        disabled={selectedToDiscard.size !== 3}
                        onClick={handleConfirmDiscard}
                    >
                        Confirm Discard
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};


  const equationString = useMemo(() => equation.map((term, i) => (
    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*' || term === '/') ? 'default' : 'outline'} className="text-xl p-2">{term === '*' ? '×' : term === '/' ? '÷' : term === '**' ? '^2' : term}</Badge>
  )), [equation]);
  
  const targetEquation = useMemo(() => {
    if (!game || !game.targetCards || game.targetCards.length === 0) return null;
    const CARD_VALUES = getCardValues(game.gameMode);
    if (game.gameMode === 'easy' || game.gameMode === 'special') {
      return game.targetCards.map(c => CARD_VALUES[c.rank]).join(' ');
    }
    return null;
  }, [game]);
  
  const renderRoundWinner = () => {
    if (!game || !game.roundWinnerIds || game.roundWinnerIds.length === 0 || !players) return null;
    const winners = players.filter(p => game.roundWinnerIds?.includes(p.id));
    if (winners.length > 1) {
        return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">It&apos;s a Draw!</p>;
    }
    if (winners.length === 0) {
      return <p className="text-4xl md:text-5xl font-bold my-6 text-muted-foreground">No winner this round!</p>;
    }
    return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">{winners[0].name} Wins This Round!</p>;
  };
  
  const isGameOver = useMemo(() => {
      if (!game || !players) return false;
      if (game.gameState === 'gameOver') return true;
      if (game.gameMode === 'special' && game.targetScore) {
          return players.some(p => p.totalScore >= game.targetScore!);
      }
      return game.gameMode !== 'special' && game.currentRound >= game.totalRounds;
  }, [game, players]);
  
  if (loading || !game || !players || !localPlayer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-12 w-12 animate-spin text-primary" />
          <p className="text-xl text-muted-foreground">Loading Game...</p>
        </div>
      </div>
    );
  }

  if (game.gameState === 'lobby') {
    return (
      <div className="container mx-auto p-4 md:p-8 flex items-center justify-center min-h-[calc(100vh-150px)]">
        {isSpecialConfigOpen && localPlayer.id === game.creatorId && (
            <SpecialCardConfig
                game={game}
                onSave={handleSaveSpecialConfig}
                onCancel={() => setIsSpecialConfigOpen(false)}
            />
        )}
        <Card className="text-center p-8 shadow-2xl animate-in fade-in-50 zoom-in-95 w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-4xl font-headline">Game Lobby</CardTitle>
            <CardDescription className="text-lg">Waiting for players to join...</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            <div className="space-y-4">
              <Button onClick={copyGameId} variant="outline" className="w-full text-lg">
                <Copy className="mr-2 h-5 w-5" /> Game ID: {gameId}
              </Button>
            </div>
             <div className="space-y-4">
              <h3 className="text-2xl font-bold">Players ({players.length}/{game.maxPlayers})</h3>
              <div className="grid gap-2">
                {players.map(p => <div key={p.id} className="text-xl p-2 bg-muted rounded-md">{p.name} {p.id === game.creatorId && '(Creator)'} {p.id === localPlayer.id && '(You)'}</div>)}
              </div>
            </div>
            {localPlayer.id === game.creatorId && (
              <div className="space-y-4">
                <Label className="text-xl">Game Mode</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button
                    onClick={() => handleSetGameMode('easy')}
                    size="lg"
                    variant={game.gameMode === 'easy' ? 'default' : 'outline'}
                    className="h-24 text-2xl"
                  >
                    <Baby className="mr-4 h-8 w-8" />
                    Easy
                  </Button>
                  <Button
                    onClick={() => handleSetGameMode('pro')}
                    size="lg"
                    variant={game.gameMode === 'pro' ? 'default' : 'outline'}
                    className="h-24 text-2xl border-destructive text-destructive data-[variant=default]:bg-destructive data-[variant=default]:text-destructive-foreground"
                  >
                    <BrainCircuit className="mr-4 h-8 w-8" />
                    Pro
                  </Button>
                   <div className="relative">
                    <Button
                        onClick={() => handleSetGameMode('special')}
                        size="lg"
                        variant={game.gameMode === 'special' ? 'default' : 'outline'}
                        className="h-24 text-2xl w-full border-amber-500 text-amber-500 data-[variant=default]:bg-amber-500 data-[variant=default]:text-white"
                    >
                        <Sparkles className="mr-4 h-8 w-8" />
                        Special
                    </Button>
                    {game.gameMode === 'special' && (
                        <Button onClick={() => setIsSpecialConfigOpen(true)} size="icon" className="absolute -top-2 -right-2 h-8 w-8 rounded-full">
                            <Settings className="h-5 w-5" />
                        </Button>
                    )}
                   </div>
                </div>
              </div>
            )}
            <div className="flex flex-col md:flex-row gap-4">
              <Button onClick={handleStartGame} size="lg" className="text-2xl flex-grow" disabled={localPlayer.id !== game.creatorId}>
                Start Game
              </Button>
               <Button onClick={handleBackToMenu} size="lg" className="text-2xl flex-grow" variant="outline">
                <ArrowLeft className="mr-2 h-5 w-5"/> Menu
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      {showConfetti && <Confetti recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
      {renderSpecialActionUI()}
      {renderDiscardUI()}

      <div className="w-full md:hidden flex flex-col md:flex-row gap-2">
        <Button onClick={handleNewGameClick} size="lg" className="shadow-lg flex-grow">
          <RefreshCw className="mr-2 h-5 w-5"/> New Game
        </Button>
        <Button onClick={handleBackToMenu} size="lg" className="shadow-lg" variant="outline">
          <ArrowLeft className="mr-2 h-5 w-5"/> Menu
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <Card className="text-center p-4 shadow-lg w-full md:col-span-1">
          <CardHeader className="p-0 mb-2">
            <CardTitle className="text-lg text-muted-foreground font-headline">
              {game.gameMode === 'special' ? `Score to Win: ${game.targetScore}` : `Scoreboard (Round ${game.currentRound}/${game.totalRounds})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 grid gap-2">
              {players.map(p => (
                <div key={p.id} className={cn(
                  "flex items-center gap-2 text-lg font-bold p-2 rounded-md transition-all",
                  p.id === currentPlayer?.id && "bg-primary/20 scale-105"
                )}>
                    <User /> {p.name.split(' ')[0]}{p.id === localPlayer.id && ' (You)'}: 
                    <span className="text-primary">
                        {game.gameMode === 'special' ? `${p.totalScore} / ${game.targetScore}` : p.totalScore}
                    </span>
                </div>
              ))}
          </CardContent>
        </Card>
        
        <div className="w-full md:col-span-1 flex flex-col items-center justify-center gap-4">
            <Card className="text-center p-4 shadow-lg w-full">
              <CardHeader className="p-0 mb-1">
                  <CardTitle className="text-lg text-muted-foreground font-headline">Target</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex items-center justify-center gap-2">
                  <p className="text-6xl font-bold text-primary">{game.targetNumber}</p>
                  <Button variant="ghost" size="icon" onClick={() => setShowHint(true)} className="text-muted-foreground">
                  <Lightbulb className="h-6 w-6" />
                  <span className="sr-only">Show hint</span>
                  </Button>
              </CardContent>
            </Card>
        </div>

        <div className="w-full md:col-span-1 hidden md:flex flex-col items-center justify-center gap-4">
            <div className="flex flex-col md:flex-row gap-2 w-full">
              <Button onClick={handleNewGameClick} size="lg" className="shadow-lg flex-grow">
                <RefreshCw className="mr-2 h-5 w-5"/> New Game
              </Button>
              <Button onClick={handleBackToMenu} size="lg" className="shadow-lg" variant="outline">
                <ArrowLeft className="mr-2 h-5 w-5"/> Menu
              </Button>
            </div>
        </div>
      </div>

      <AlertDialog open={showHint} onOpenChange={setShowHint}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline text-2xl">Target Combination</AlertDialogTitle>
            <AlertDialogDescription>
              Here&apos;s how the target number was created:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-center items-center gap-2 my-4">
              {game.targetCards.map((card) => (
                <GameCard key={card.id} card={card} mode={game.gameMode} />
              ))}
          </div>
           {targetEquation && (
            <p className="text-center text-2xl font-bold">
              {targetEquation} = <span className="text-primary">{game.targetNumber}</span>
            </p>
          )}
          {(game.gameMode === 'pro' || (game.gameMode === 'special' && game.targetCards.length < 3)) && (
             <p className="text-center text-2xl font-bold">
                Concatenated to form <span className="text-primary">{game.targetNumber}</span>
             </p>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowHint(false)}>Got it!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMyTurn && (
        <Card className="shadow-lg sticky top-4 z-10 bg-card/90 backdrop-blur-sm p-3 md:col-start-2">
          <CardHeader className="p-0">
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <User />
              Your Turn! ({game.gameMode} mode)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <div className="flex items-center gap-2 bg-muted p-2 rounded-lg min-h-[48px] text-xl font-bold flex-wrap">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-base font-normal">Click cards to build an equation.</span>}
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className={cn("grid grid-cols-2 gap-2", (game.gameMode !== 'pro' && game.gameMode !== 'special') && "hidden")}>
                <Button onClick={() => handleParenthesisClick('(')} variant="outline" size="sm" className="font-bold text-lg">(</Button>
                <Button onClick={() => handleParenthesisClick(')')} variant="outline" size="sm" className="font-bold text-lg">)</Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={handleSubmitEquation} className="flex-grow" size="lg" disabled={equation.length === 0}>
                  <Send className="mr-2 h-4 w-4"/> Submit
                </Button>
                <Button onClick={handlePass} className="flex-grow" variant="secondary" size="lg">
                  <LogOut className="mr-2 h-4 w-4"/> Pass
                </Button>
                <Button onClick={handleClearEquation} variant="destructive" className="flex-grow" disabled={equation.length === 0} size="lg">
                  <X className="mr-2 h-4 w-4"/> Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isMyTurn && game.gameState === 'playerTurn' && (
        <Card className="text-center p-4 shadow-lg md:col-start-2">
          <CardTitle className="font-headline flex items-center justify-center gap-2 text-xl">
            <Users />
            Waiting for {currentPlayer?.name} to play...
          </CardTitle>
        </Card>
      )}

      {game.gameState === 'gameOver' && (
         <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95 md:col-span-3 max-w-4xl mx-auto">
           <CardTitle className="text-5xl font-headline mb-4 flex items-center justify-center gap-4"><Trophy className="w-12 h-12 text-yellow-400" />Game Over!</CardTitle>
           {totalWinner.length > 1 && <p className="text-4xl font-bold my-6 text-muted-foreground">It&apos;s a tie between {totalWinner.map(p => p.name).join(' and ')}!</p>}
           {totalWinner.length === 1 && <p className="text-4xl font-bold my-6 text-primary">{totalWinner[0].name} is the Grand Winner!</p>}
           
           <div className="text-2xl font-bold">Final Scores</div>
           <div className="flex justify-center items-center gap-8 text-xl my-4 flex-wrap">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-2"><User /> {p.name}: <span className="text-primary">{p.totalScore}</span></div>
              ))}
           </div>
           
           {localPlayer.id === game.creatorId ? (
              <Button onClick={handleRematch} size="lg" className="mt-8" disabled={isRematching}>
                {isRematching ? 'Creating New Game...' : 'Play Again'}
              </Button>
           ) : (
             <p className="text-xl mt-8 text-muted-foreground">Waiting for {players.find(p=>p.id === game.creatorId)?.name} to start a new game.</p>
           )}

         </Card>
       )}

      {game.gameState === 'roundOver' && (
        <Card className="text-center p-8 bg-card/90 backdrop-blur-sm border-2 border-primary shadow-2xl animate-in fade-in-50 zoom-in-95 md:col-span-3 max-w-4xl mx-auto">
          <CardTitle className="text-4xl font-headline mb-4">Round {game.currentRound} Over!</CardTitle>
          {renderRoundWinner()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
            {players.map(player => (
                <div key={player.id} className='space-y-2'>
                  <h3 className="text-2xl font-bold flex items-center justify-center gap-2"><User /> {player.name} Score: <span className="text-primary">{player.roundScore}</span></h3>
                  <div className="flex items-center justify-center gap-2 flex-wrap min-h-[52px]">
                    Equation:
                    {player.equation.length > 0 ? (
                      <>
                      {player.equation.map((term, i) => (
                        <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*' || term === '/') ? 'default' : 'outline'} className="text-xl p-2">{term === '*' ? '×' : term === '/' ? '÷' : term === '**' ? '^2' : term}</Badge>
                      ))}
                      <span className="mx-2">=</span>
                      <span className="font-bold text-accent">{player.finalResult}</span>
                      </>
                    ) : <p>Passed.</p>}
                  </div>
                </div>
            ))}
          </div>
          <Button onClick={handleNextRound} size="lg" className="mt-8" disabled={game.creatorId !== localPlayer.id}>
            { isGameOver ? 'Show Final Results' : 'Next Round' }
          </Button>
        </Card>
      )}

      <div className="pt-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold font-headline mb-4 flex items-center justify-center gap-2">
            <User />
            Your Hand
          </h2>
          <div className="flex flex-col items-center gap-4">
            <div className="flex justify-center -space-x-12">
              {handRow1.map((card, index) => (
                <div
                  key={card.id}
                  className={cn(
                    "transition-all duration-300 ease-out hover:-translate-y-4"
                  )}
                  style={{ zIndex: index }}
                >
                  <GameCard
                    card={card}
                    mode={game.gameMode}
                    onClick={() => handleCardClick(card, activeHand.findIndex(c => c.id === card.id))}
                    className={cn(
                      'transition-all duration-200',
                      {
                        "opacity-30 scale-90 -translate-y-4 cursor-not-allowed": usedCardIndices.has(activeHand.findIndex(c => c.id === card.id)),
                        "cursor-not-allowed": !isMyTurn
                      }
                    )}
                  />
                </div>
              ))}
            </div>
            {handRow2.length > 0 && (
              <div className="flex justify-center -space-x-12">
                {handRow2.map((card, index) => (
                  <div
                    key={card.id}
                    className={cn(
                      "transition-all duration-300 ease-out hover:-translate-y-4"
                    )}
                    style={{ zIndex: index + 7 }}
                  >
                    <GameCard
                      card={card}
                      mode={game.gameMode}
                      onClick={() => handleCardClick(card, activeHand.findIndex(c => c.id === card.id))}
                      className={cn(
                        'transition-all duration-200',
                        {
                          "opacity-30 scale-90 -translate-y-4 cursor-not-allowed": usedCardIndices.has(activeHand.findIndex(c => c.id === card.id)),
                          "cursor-not-allowed": !isMyTurn
                        }
                      )}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
