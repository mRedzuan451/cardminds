
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { createGame } from '@/ai/flows/game-actions';
import { useToast } from '@/hooks/use-toast';
import { Gamepad2, Sparkles, ShieldCheck, Users } from 'lucide-react';

export default function HomePage() {
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleCreateGame = async () => {
    if (!playerName) {
      toast({ title: 'Please enter your name', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const newGameId = await createGame({ creatorName: playerName });
      if (newGameId) {
        router.push(`/game/${newGameId}?player=${encodeURIComponent(playerName)}`);
      }
    } catch (error) {
      console.error('Failed to create game:', error);
      toast({ title: 'Failed to create game', description: 'Please try again.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleJoinGame = () => {
    if (!playerName) {
      toast({ title: 'Please enter your name', variant: 'destructive' });
      return;
    }
    if (!gameId) {
      toast({ title: 'Please enter a Game ID', variant: 'destructive' });
      return;
    }
    router.push(`/game/${gameId}?player=${encodeURIComponent(playerName)}`);
  };

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-65px)] items-center justify-center p-4">
      <Card className="game-surface w-full max-w-xl overflow-hidden">
        <CardHeader className="relative overflow-hidden text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/15" />
          <div className="relative mx-auto mb-4 flex h-18 w-18 items-center justify-center rounded-full border border-white/10 bg-white/10 text-primary shadow-lg backdrop-blur">
            <Gamepad2 className="h-9 w-9" />
          </div>
          <CardTitle className="relative text-4xl font-headline md:text-5xl">Welcome to CardMinds!</CardTitle>
          <CardDescription className="relative mx-auto max-w-md text-base md:text-lg">
            Build equations, outthink your rivals, and race to the target in a sleek card battleground.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="game-panel flex items-center gap-3 p-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Fast-paced rounds</span>
            </div>
            <div className="game-panel flex items-center gap-3 p-4">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Play with friends</span>
            </div>
            <div className="game-panel flex items-center gap-3 p-4">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Clear game modes</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="player-name" className="text-base md:text-lg">Your Name</Label>
            <Input
              id="player-name"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="h-12 text-base md:text-lg"
            />
          </div>
          <div className="space-y-4">
            <Button onClick={handleCreateGame} className="w-full text-base md:text-lg" size="lg" disabled={isLoading}>
              {isLoading ? 'Creating Game...' : 'Create New Game'}
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <hr className="w-full" />
            <span className="text-muted-foreground">OR</span>
            <hr className="w-full" />
          </div>
          <div className="space-y-4">
            <Label htmlFor="game-id" className="text-base md:text-lg">Join with Game ID</Label>
            <div className="flex gap-2">
              <Input
                id="game-id"
                placeholder="Enter Game ID"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="h-12 text-base md:text-lg"
              />
              <Button onClick={handleJoinGame} className="px-6 text-base md:text-lg">Join</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
