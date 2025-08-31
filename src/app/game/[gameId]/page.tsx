
'use client'

import GameClient from "@/components/game-client";
import { useSearchParams } from "next/navigation";

export default function GamePage({ params }: { params: { gameId: string } }) {
  const searchParams = useSearchParams();
  const playerName = searchParams.get('player');

  if (!playerName) {
    // This can be a redirect to an error page or the home page
    return <div>Player name is required to join a game.</div>;
  }

  return <GameClient gameId={params.gameId} playerName={playerName} />;
}
