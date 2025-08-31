
import GameClientPage from "./client-page";

export default function GamePage({ params }: { params: { gameId: string } }) {
  return <GameClientPage gameId={params.gameId} />;
}
