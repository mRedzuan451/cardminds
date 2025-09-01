
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { createGame } from '@/ai/flows/game-actions';
import { useToast } from '@/hooks/use-toast';
import { Gamepad2 } from 'lucide-react';
import Image from 'next/image';

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
    <div className="relative min-h-[calc(100vh-65px)]">
      <Image
        src="https://firebasestorage.googleapis.com/v0/b/cardcalc.firebasestorage.app/o/assets%2Fbackground_welcome_img.png?alt=media"
        alt="Mystical library background"
        fill
        className="object-cover"
        data-ai-hint="magical library"
      />
      <div className="absolute inset-0 bg-background/50 backdrop-blur-sm" />
      <div className="relative container mx-auto flex min-h-[calc(100vh-65px)] items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl bg-card/80 backdrop-blur-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Gamepad2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-4xl font-headline">Welcome to CardMinds!</CardTitle>
            <CardDescription className="text-lg">Create a new game or join an existing one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="player-name" className="text-lg">Your Name</Label>
              <Input
                id="player-name"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="text-lg bg-background/80"
              />
            </div>
            <div className="space-y-4">
              <Button onClick={handleCreateGame} className="w-full text-lg" size="lg" disabled={isLoading}>
                {isLoading ? 'Creating Game...' : 'Create New Game'}
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <hr className="w-full" />
              <span className="text-muted-foreground">OR</span>
              <hr className="w-full" />
            </div>
            <div className="space-y-4">
              <Label htmlFor="game-id" className="text-lg">Join with Game ID</Label>
              <div className="flex gap-2">
                <Input
                  id="game-id"
                  placeholder="Enter Game ID"
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                  className="text-lg bg-background/80"
                />
                <Button onClick={handleJoinGame} className="text-lg">Join</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
