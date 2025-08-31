
'use client'

import GameClient from "@/components/game-client";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function GamePage({ params }: { params: { gameId: string } }) {
  const searchParams = useSearchParams();
  const playerName = searchParams.get('player');

  if (!playerName) {
    return (
        <div className="flex h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-12 w-12 animate-spin text-primary" />
                <p className="text-xl text-muted-foreground">Loading Player...</p>
            </div>
        </div>
    );
  }

  return <GameClient gameId={params.gameId} playerName={playerName} />;
}
