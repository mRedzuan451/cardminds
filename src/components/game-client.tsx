
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDocument, useCollection } from 'react-firebase-hooks/firestore';
import { doc, collection, onSnapshot, getFirestore, updateDoc } from 'firebase/firestore';
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
import { ShuffleAnimation } from './shuffle-animation';

const db = getFirestore(firebaseApp);


function SpecialCardConfig({ game, onSave, onCancel, toast }: { game: Game, onSave: (allowed: Rank[]) => void, onCancel: () => void, toast: (options: any) => void }) {
    const [selectedCards, setSelectedCards] = useState<Set<Rank>>(new Set(game.allowedSpecialCards ?? SPECIAL_RANKS));
    const CARD_VALUES = getCardValues('special');
    const MAX_SPECIAL_CARDS = 4;

    const handleToggle = (rank: Rank) => {
        const newSelection = new Set(selectedCards);
        if (newSelection.has(rank)) {
            newSelection.delete(rank);
        } else {
            if (newSelection.size < MAX_SPECIAL_CARDS) {
                newSelection.add(rank);
            } else {
                toast({ title: `You can only select up to ${MAX_SPECIAL_CARDS} special cards.`, variant: "destructive" });
            }
        }
        setSelectedCards(newSelection);
    };

    const handleSave = () => {
        onSave(Array.from(selectedCards));
    };

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="game-surface max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="font-headline text-2xl">Configure Special Cards</DialogTitle>
                    <DialogDescription>
                        Select up to {MAX_SPECIAL_CARDS} special cards to include in the deck for this game.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                    {SPECIAL_RANKS.map(rank => (
                        <div key={rank} className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                             <GameCard
                                card={{ id: rank, suit: 'Special', rank }}
                                mode="special"
                                onClick={() => handleToggle(rank)}
                                className={cn(
                                    "transition-all duration-200",
                                    !selectedCards.has(rank) && "opacity-50 grayscale scale-95"
                                )}
                            />
                            <div className="flex items-center space-x-2 rounded-full border border-white/10 bg-background/40 px-3 py-1">
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
                    <Button onClick={handleSave} className="shadow-lg">Save Configuration</Button>
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
            } else if (cardRank === 'GA') {
                description = `${playerName} used the ${cardName} card to discard 1 and draw 2!`;
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

  const isSpecialModeMyTurn = useMemo(() => {
    return game?.gameMode === 'special' && currentPlayer?.id === localPlayer?.id && game?.gameState === 'playerTurn';
  }, [currentPlayer, localPlayer, game]);

  const canSubmitAnytime = game?.gameMode === 'easy' || game?.gameMode === 'pro';

  const canInteractWithHand = canSubmitAnytime || isSpecialModeMyTurn;

  const isDiscarding = useMemo(() => {
    return game?.gameState === 'discarding' && game.discardingPlayerId === localPlayer?.id;
  }, [game, localPlayer]);

  const allPlayersSubmitted = useMemo(() => {
    if (!game || !players || (game.gameMode !== 'easy' && game.gameMode !== 'pro')) return false;
    return players.every(player => player.passed);
  }, [game, players]);

  // Reset equation when turn changes
  useEffect(() => {
    if (!canSubmitAnytime && !isSpecialModeMyTurn) {
        handleClearEquation();
    }
  }, [canSubmitAnytime, isSpecialModeMyTurn]);

  // Reset discard selection when discard state changes
  useEffect(() => {
    if (!isDiscarding) {
        setSelectedToDiscard(new Set());
    }
  }, [isDiscarding]);


  const activeHand = useMemo(() => {
    return localPlayer?.hand ?? [];
  }, [localPlayer]);

  const selectedDiscardCards = useMemo(() => {
    return activeHand.filter(card => selectedToDiscard.has(`${card.rank}-${card.suit}`));
  }, [activeHand, selectedToDiscard]);

  const selectedDiscardCount = selectedDiscardCards.length;

  const handRow1 = useMemo(() => activeHand.slice(0, 7), [activeHand]);
  const handRow2 = useMemo(() => activeHand.slice(7), [activeHand]);
  
  const handleParenthesisClick = (paren: '(' | ')') => {
    setEquation([...equation, paren]);
  };

  const handleCardClick = (card: CardType, index: number) => {
    if (!canInteractWithHand) return;
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
    if (!localPlayer || !canInteractWithHand) return;
    try {
      await gameActions.playerAction({ gameId, playerId: localPlayer.id, action: 'pass' });
      handleClearEquation();
      toast({ title: "Passed", description: "Your turn cycle is marked as passed.", variant: "default" });
    } catch(e: any) {
       toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };
  
  const handleSubmitEquation = async () => {
    if (!localPlayer || !game || !canInteractWithHand) return;

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
        if (game.gameMode === 'special' || game.gameMode === 'pro') {
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

    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { gameState: 'shuffling' });
    
    setTimeout(async () => {
        try {
          await gameActions.startGame({ gameId });
        } catch (e: any) {
          console.error('[handleStartGame] Failed to start game:', e);
          toast({
            title: 'Failed to start game',
            description: e?.message ?? 'An unexpected error occurred while starting the game.',
            variant: 'destructive',
          });
          await updateDoc(gameRef, { gameState: 'lobby' });
        }
    }, 3000);
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
    try {
      await gameActions.setAllowedSpecialCards({ gameId, allowedCards });
      await gameActions.setGameMode({ gameId, mode: 'special' });
      setIsSpecialConfigOpen(false);
      toast({ title: "Special Mode Configured!", description: "The special cards for this game have been set." });
    } catch (error: any) {
      console.error('[handleSaveSpecialConfig] Failed to save special card configuration:', error);
      toast({
        title: 'Failed to save special configuration',
        description: error?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    }
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
    try {
        await gameActions.resolveSpecialCard({
            gameId,
            playerId: localPlayer.id,
            card: { suit: 'Special', rank: game.specialAction.cardRank, id: '' }, // id can be dummy
            target
        });
        await gameActions.endSpecialAction({ gameId });
    } catch (e: any) {
        console.error(`Error resolving special card:`, e);
        toast({ title: "Error Playing Card", description: e.message, variant: "destructive" });
        await gameActions.endSpecialAction({ gameId }); // End action even on error
    }
  };

  const handleDiscardCardClick = (card: CardType) => {
    const cardKey = `${card.rank}-${card.suit}`;
    const matchingCards = activeHand.filter(handCard => `${handCard.rank}-${handCard.suit}` === cardKey);
    const newSelection = new Set(selectedToDiscard);
    const currentSelectedCardCount = activeHand.filter(handCard => newSelection.has(`${handCard.rank}-${handCard.suit}`)).length;

    if (newSelection.has(cardKey)) {
        newSelection.delete(cardKey);
    } else {
        if (currentSelectedCardCount + matchingCards.length > 3) {
            toast({ title: "You can only select 3 cards to discard.", variant: "destructive" });
            return;
        }
        newSelection.add(cardKey);
    }
    setSelectedToDiscard(newSelection);
  };
  
  const handleConfirmDiscard = async () => {
    if (!isDiscarding || !localPlayer) return;
    const cardsToDiscard = selectedDiscardCards;
    if (cardsToDiscard.length !== 3) return;
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
            <AlertDialogContent className="game-surface max-w-3xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-headline text-2xl">Play {CARD_VALUES[cardRank as Rank]} Card</AlertDialogTitle>
                </AlertDialogHeader>
                 {cardRank === 'GA' && (
                    <div className="space-y-3">
                        <p className="text-muted-foreground">Select a card from your hand to discard:</p>
                        <div className="flex flex-wrap gap-3 mt-2 max-h-60 overflow-y-auto justify-center">
                            {activeHand.map((card) => (
                                <GameCard key={card.id} card={card} mode={game.gameMode} onClick={() => handleSpecialAction(card)} />
                            ))}
                        </div>
                    </div>
                )}
                {cardRank === 'CL' && (
                    <div className="space-y-3">
                        <p className="text-muted-foreground">Select a non-special card from your hand to clone:</p>
                        <div className="flex flex-wrap gap-3 mt-2 max-h-60 overflow-y-auto justify-center">
                            {activeHand.filter(c => c.suit !== 'Special').map((card) => (
                                <GameCard key={card.id} card={card} mode={game.gameMode} onClick={() => handleSpecialAction(card)} />
                            ))}
                        </div>
                    </div>
                )}
                {cardRank === 'SB' && (
                     <div className="space-y-3">
                        <p className="text-muted-foreground">Select a player to sabotage:</p>
                        <div className="flex flex-col gap-2 mt-2">
                             {players?.filter(p => p.id !== localPlayer?.id).map(p => (
                                 <Button key={p.id} onClick={() => handleSpecialAction(p.id)} variant="outline" className="justify-between border-white/10 bg-white/5">
                                    {p.name}
                                    <span className="text-xs text-muted-foreground">Target</span>
                                 </Button>
                             ))}
                        </div>
                     </div>
                )}
                 {cardRank === 'DE' && (
                    <div className="space-y-3">
                        <p className="text-muted-foreground">Select a target card to re-roll:</p>
                        <div className="flex flex-wrap gap-3 mt-2 justify-center">
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
            <AlertDialogContent className="game-surface max-w-3xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-headline text-2xl">Too Many Cards!</AlertDialogTitle>
                    <AlertDialogDescription>
                        Your hand has more than 10 cards. Please select exactly 3 cards to discard.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                    <p className="mb-2 font-bold">
                        Selected: {selectedDiscardCount} / 3
                    </p>
                    {Array.from(selectedToDiscard).map((cardKey) => {
                        const duplicateCount = activeHand.filter(card => `${card.rank}-${card.suit}` === cardKey).length;
                        if (duplicateCount <= 1) return null;
                        return (
                            <p key={cardKey} className="text-sm text-muted-foreground text-center">
                                Selecting this card will discard <span className="text-primary font-semibold">{duplicateCount}</span> matching cards.
                            </p>
                        );
                    })}
                    <div className="flex flex-wrap gap-3 justify-center max-h-64 overflow-y-auto">
                        {activeHand.map((card) => (
                            <div key={card.id} className="relative">
                                <GameCard
                                    card={card}
                                    mode={game?.gameMode}
                                    onClick={() => handleDiscardCardClick(card)}
                                    className={cn(selectedToDiscard.has(`${card.rank}-${card.suit}`) && "ring-4 ring-offset-2 ring-primary scale-105")}
                                />
                                {selectedToDiscard.has(`${card.rank}-${card.suit}`) && (
                                    <div className="absolute -top-2 -right-2 rounded-full border border-white/20 bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground shadow-lg">
                                        {activeHand.filter(handCard => `${handCard.rank}-${handCard.suit}` === `${card.rank}-${card.suit}`).length}x
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <AlertDialogFooter>
                    <Button
                        disabled={selectedDiscardCount !== 3}
                        onClick={handleConfirmDiscard}
                        className="shadow-lg"
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
    const winnerMessage = winners[0].id === localPlayer?.id ? 'You win this round!' : `${winners[0].name} wins this round!`;
    return <p className="text-4xl md:text-5xl font-bold my-6 text-primary">{winnerMessage}</p>;
  };

  const renderRoundScoreBreakdown = () => {
    if (!game || game.gameState !== 'roundOver' || !players) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-left">
        {players.map(player => (
          <div key={player.id} className={cn(
            "rounded-2xl border px-5 py-4 shadow-lg transition-all",
            game.roundWinnerIds?.includes(player.id)
              ? "border-amber-400/60 bg-amber-500/10 ring-1 ring-amber-400/40"
              : "border-white/10 bg-white/5"
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-lg">
                <User className="h-4 w-4" />
                <span>{player.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {game.roundWinnerIds?.includes(player.id) && (
                  <Badge className="bg-amber-500/90 text-white border-0 gap-1">
                    <Trophy className="h-3.5 w-3.5" />
                    Round Winner
                  </Badge>
                )}
                <Badge variant="secondary" className="bg-primary/20 text-primary">
                  {player.roundScore} pts
                </Badge>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              <span className="uppercase tracking-wide">Equation</span>
              {player.equation.length > 0 ? (
                <>
                  {player.equation.map((term, i) => (
                    <Badge key={i} variant={typeof term === 'number' ? 'secondary' : (term === '+' || term === '-' || term === '*' || term === '/') ? 'default' : 'outline'} className="text-base p-2">
                      {term === '*' ? '×' : term === '/' ? '÷' : term === '**' ? '^2' : term}
                    </Badge>
                  ))}
                  <span className="mx-2">=</span>
                  <span className="font-bold text-accent">{player.finalResult}</span>
                </>
              ) : (
                <span>Passed.</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTotalWinnerBanner = () => {
    if (!game || game.gameState !== 'gameOver' || !players) return null;
    if (totalWinner.length === 0) return null;

    if (totalWinner.length > 1) {
      return (
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-r from-purple-500/20 via-fuchsia-500/15 to-indigo-500/20 px-6 py-7 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_45%)]" />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/10 px-4 py-2 backdrop-blur-sm">
              <Trophy className="h-5 w-5 text-amber-300" />
              <span className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Total Winner</span>
            </div>
            <p className="text-4xl md:text-5xl font-headline text-primary">It&apos;s a tie for the championship!</p>
            <p className="text-lg md:text-xl text-muted-foreground">
              {totalWinner.map(player => player.name).join(' • ')}
            </p>
          </div>
        </div>
      );
    }

    const winner = totalWinner[0];

    return (
      <div className="relative overflow-hidden rounded-[36px] border border-primary/30 bg-gradient-to-r from-primary/25 via-fuchsia-500/15 to-amber-500/25 px-6 py-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.22),_transparent_45%)]" />
        <div className="relative flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/10 px-5 py-2.5 backdrop-blur-sm">
            <Trophy className="h-6 w-6 text-amber-300" />
            <span className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Total Winner</span>
          </div>
          <p className="text-5xl md:text-6xl font-headline text-primary drop-shadow-sm">{winner.name}</p>
          <p className="max-w-2xl text-lg md:text-xl text-muted-foreground">
            Champion of the match with <span className="text-primary font-bold">{winner.totalScore}</span> total points.
          </p>
        </div>
      </div>
    );
  };
  
  const isGameOver = useMemo(() => {
      if (!game || !players) return false;
      if (game.gameState === 'gameOver') return true;
      if (game.gameMode === 'special' && game.targetScore > 0) {
          return players.some(p => p.totalScore >= game.targetScore);
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

  if (game.gameState === 'shuffling') {
    return <ShuffleAnimation />;
  }
  
  if (game.gameState === 'lobby') {
    return (
      <div className="container mx-auto p-4 md:p-8 flex items-center justify-center min-h-[calc(100vh-150px)]">
        {isSpecialConfigOpen && localPlayer.id === game.creatorId && (
            <SpecialCardConfig
                game={game}
                onSave={handleSaveSpecialConfig}
                onCancel={() => setIsSpecialConfigOpen(false)}
                toast={toast}
            />
        )}
        <Card className="game-surface text-center p-8 animate-in fade-in-50 zoom-in-95 w-full max-w-2xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-4xl font-headline">Game Lobby</CardTitle>
            <CardDescription className="text-lg">Waiting for players to join...</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            <div className="space-y-4">
              <Button onClick={copyGameId} variant="outline" className="w-full text-lg border-white/10 bg-white/5 shadow-sm">
                <Copy className="mr-2 h-5 w-5" /> Game ID: {gameId}
              </Button>
            </div>
             <div className="space-y-4">
              <h3 className="text-2xl font-bold">Players ({players.length}/{game.maxPlayers})</h3>
              <div className="grid gap-2">
                {players.map(p => <div key={p.id} className="game-panel flex items-center justify-between px-4 py-3 text-lg">{p.name} <span className="flex items-center gap-2 text-sm text-muted-foreground">{p.id === game.creatorId && 'Creator'} {p.id === localPlayer.id && 'You'} {game.gameMode !== 'special' && <Badge variant={p.submitted ? 'default' : 'secondary'} className={cn('text-xs uppercase tracking-wide', p.submitted ? 'bg-emerald-500 text-white' : 'bg-white/10 text-muted-foreground')}>{p.submitted ? 'Submitted' : 'Waiting'}</Badge>}</span></div>)}
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
                    className="h-24 text-2xl shadow-lg"
                  >
                    <Baby className="mr-4 h-8 w-8" />
                    Easy
                  </Button>
                  <Button
                    onClick={() => handleSetGameMode('pro')}
                    size="lg"
                    variant={game.gameMode === 'pro' ? 'default' : 'outline'}
                    className="h-24 text-2xl border-destructive text-destructive shadow-lg data-[variant=default]:bg-destructive data-[variant=default]:text-destructive-foreground"
                  >
                    <BrainCircuit className="mr-4 h-8 w-8" />
                    Pro
                  </Button>
                   <div className="relative">
                    <Button
                        onClick={() => handleSetGameMode('special')}
                        size="lg"
                        variant={game.gameMode === 'special' ? 'default' : 'outline'}
                        className="h-24 text-2xl w-full border-amber-500 text-amber-500 shadow-lg data-[variant=default]:bg-amber-500 data-[variant=default]:text-white"
                    >
                        <Sparkles className="mr-4 h-8 w-8" />
                        Special
                    </Button>
                    {game.gameMode === 'special' && (
                        <Button onClick={() => setIsSpecialConfigOpen(true)} size="icon" className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-lg">
                            <Settings className="h-5 w-5" />
                        </Button>
                    )}
                   </div>
                </div>
              </div>
            )}
            <div className="flex flex-col md:flex-row gap-4">
              <Button onClick={handleStartGame} size="lg" className="text-2xl flex-grow shadow-lg" disabled={localPlayer.id !== game.creatorId}>
                Start Game
              </Button>
               <Button onClick={handleBackToMenu} size="lg" className="text-2xl flex-grow shadow-lg" variant="outline">
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
        <Card className="game-surface text-center p-5 w-full md:col-span-1">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-lg text-muted-foreground font-headline">
              {game.gameMode === 'special' ? `Score to Win: ${game.targetScore}` : `Scoreboard · Round ${game.currentRound}/${game.totalRounds}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 grid gap-2">
              {players.map(p => (
                <div key={p.id} className={cn(
                  "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-bold transition-all",
                  p.id === currentPlayer?.id && "bg-primary/20 ring-1 ring-primary/40 scale-[1.02]"
                )}>
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {p.name.split(' ')[0]}{p.id === localPlayer.id && ' (You)'}
                      {game.gameMode !== 'special' && (
                        <Badge
                          variant={p.passed ? (p.submitted ? 'default' : 'secondary') : 'outline'}
                          className={cn(
                            'ml-2 border-0 text-xs uppercase tracking-wide text-white',
                            p.passed
                              ? (p.submitted ? 'bg-emerald-500/80' : 'bg-amber-500/80')
                              : 'bg-white/10 text-muted-foreground'
                          )}
                        >
                          {p.passed ? (p.submitted ? 'Submitted' : 'Passed') : 'Waiting'}
                        </Badge>
                      )}
                    </span>
                    <span className="text-primary text-lg">
                        {game.gameMode === 'special' ? `${p.totalScore} / ${game.targetScore}` : p.totalScore}
                    </span>
                </div>
              ))}
          </CardContent>
        </Card>
        
        <div className={cn("w-full md:col-span-1 flex flex-col items-center justify-center gap-4", game.gameState === 'gameOver' && renderTotalWinnerBanner() && "hidden")}>
            <Card className="game-surface text-center p-5 w-full">
              <CardHeader className="p-0 mb-1">
                  <CardTitle className="text-lg text-muted-foreground font-headline">Target</CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex items-center justify-center gap-3">
                  <p className="text-6xl font-bold text-primary drop-shadow-sm">{game.targetNumber}</p>
                  <Button variant="ghost" size="icon" onClick={() => setShowHint(true)} className="text-muted-foreground hover:bg-white/10">
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
        <AlertDialogContent className="game-surface max-w-3xl">
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

      {canInteractWithHand && !allPlayersSubmitted && (
        <Card className="game-surface sticky top-4 z-10 p-5 md:col-start-2">
          <CardHeader className="p-0">
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <User />
              {canSubmitAnytime ? `Play Now! (${game.gameMode} mode)` : `Your Turn! (${game.gameMode} mode)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-background/50 p-3 min-h-[60px] text-xl font-bold flex-wrap shadow-inner">
              {equation.length > 0 ? equationString : <span className="text-muted-foreground text-base font-normal">Click cards to build an equation.</span>}
            </div>
            <div className="flex flex-col gap-3 mt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className={cn(
                "grid grid-cols-2 gap-2 self-start",
                (game.gameMode !== 'pro' && game.gameMode !== 'special') && "hidden",
                allPlayersSubmitted && game.gameMode !== 'special' && "hidden"
              )}> 
                <Button onClick={() => handleParenthesisClick('(')} variant="outline" size="sm" className="font-bold text-lg">(</Button>
                <Button onClick={() => handleParenthesisClick(')')} variant="outline" size="sm" className="font-bold text-lg">)</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 w-full lg:w-auto">
                <Button onClick={handleSubmitEquation} className="flex-grow shadow-lg" size="lg" disabled={equation.length === 0}>
                  <Send className="mr-2 h-4 w-4"/> Submit
                </Button>
                <Button onClick={handlePass} className="flex-grow shadow-lg" variant="secondary" size="lg">
                  <LogOut className="mr-2 h-4 w-4"/> Pass
                </Button>
                <Button onClick={handleClearEquation} variant="destructive" className="flex-grow shadow-lg" disabled={equation.length === 0} size="lg">
                  <X className="mr-2 h-4 w-4"/> Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!canSubmitAnytime && !isSpecialModeMyTurn && game.gameState === 'playerTurn' && (
        <Card className="game-surface text-center p-4 md:col-start-2">
          <CardTitle className="font-headline flex items-center justify-center gap-2 text-xl">
            <Users />
            Waiting for {currentPlayer?.name} to play...
          </CardTitle>
        </Card>
      )}

      {allPlayersSubmitted && game.gameMode !== 'special' && game.gameState === 'playerTurn' && (
        <Card className="game-surface border border-emerald-500/30 bg-emerald-500/10 text-center p-4 md:col-span-3 max-w-3xl mx-auto">
          <CardTitle className="font-headline flex items-center justify-center gap-2 text-xl text-emerald-200">
            <Trophy className="h-5 w-5" />
            All players have submitted
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">The round will conclude automatically.</p>
        </Card>
      )}

      {(game.gameState === 'roundOver' || game.gameState === 'gameOver') && (
         <Card className="game-surface text-center p-8 border-2 border-primary/40 animate-in fade-in-50 zoom-in-95 md:col-span-3 max-w-4xl mx-auto">
          {game.gameState === 'gameOver' && (
            <div className="mb-6">
              {renderTotalWinnerBanner()}
            </div>
          )}
          {game.gameState === 'roundOver' && renderRoundScoreBreakdown()}
          {game.gameState === 'gameOver' && (
            <div className="mt-6 flex justify-center">
              <Button onClick={handleRematch} size="lg" className="shadow-lg" disabled={game.creatorId !== localPlayer.id || isRematching}>
                <RefreshCw className={cn("mr-2 h-5 w-5", isRematching && "animate-spin")} />
                Play Again
              </Button>
            </div>
          )}
          <div className="mt-8 flex flex-col md:flex-row gap-3 justify-center">
            {!isGameOver && (
              <Button onClick={handleNextRound} size="lg" className="shadow-lg" disabled={game.creatorId !== localPlayer.id}>
                Continue to Next Round
              </Button>
            )}
            {isGameOver && game.gameState === 'roundOver' && (
              <Button onClick={handleNextRound} size="lg" className="shadow-lg" disabled={game.creatorId !== localPlayer.id}>
                View Winner
              </Button>
            )}
            {isGameOver && (
              <>
                <Button onClick={handleBackToMenu} size="lg" className="shadow-lg" variant="outline">
                  <ArrowLeft className="mr-2 h-5 w-5" /> Menu
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      <div className={cn("pt-8", allPlayersSubmitted && game.gameMode !== 'special' && "hidden")}>
        <div className="text-center">
          <h2 className="text-2xl font-bold font-headline mb-4 flex items-center justify-center gap-2">
            <User />
            Your Hand
          </h2>
          <div className="game-surface flex flex-col items-center gap-4 px-4 py-6 md:px-6">
            <div className="game-card-stack md:-space-x-12">
              {handRow1.map((card, index) => {
                const handIndex = index;
                const isLatestCard = activeHand.length > 0 && handIndex === activeHand.length - 1;
                const hideLatestCard = game.gameMode === 'special' && !isSpecialModeMyTurn && isLatestCard;
                return (
                <div
                  key={card.id}
                  className={cn(
                    "transition-all duration-300 ease-out hover:-translate-y-4"
                  )}
                  style={{ zIndex: handIndex }}
                >
                  <GameCard
                    card={card}
                    mode={game.gameMode}
                    isFaceDown={hideLatestCard}
                    onClick={() => handleCardClick(card, handIndex)}
                    className={cn(
                      'transition-all duration-200',
                      {
                        "opacity-30 scale-90 -translate-y-4 cursor-not-allowed": usedCardIndices.has(handIndex),
                        "cursor-not-allowed": !canInteractWithHand
                      }
                    )}
                  />
                </div>
              );})}
            </div>
            {handRow2.length > 0 && (
              <div className="game-card-stack md:-space-x-12">
                {handRow2.map((card, index) => {
                  const handIndex = index + 7;
                  const isLatestCard = activeHand.length > 0 && handIndex === activeHand.length - 1;
                  const hideLatestCard = game.gameMode === 'special' && !isSpecialModeMyTurn && isLatestCard;
                  return (
                  <div
                    key={card.id}
                    className={cn(
                      "transition-all duration-300 ease-out hover:-translate-y-4"
                    )}
                    style={{ zIndex: handIndex }}
                  >
                    <GameCard
                      card={card}
                      mode={game.gameMode}
                      isFaceDown={hideLatestCard}
                      onClick={() => handleCardClick(card, handIndex)}
                      className={cn(
                        'transition-all duration-200',
                        {
                          "opacity-30 scale-90 -translate-y-4 cursor-not-allowed": usedCardIndices.has(handIndex),
                          "cursor-not-allowed": !canInteractWithHand
                        }
                      )}
                    />
                  </div>
                );})}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
