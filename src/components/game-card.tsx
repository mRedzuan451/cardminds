import { cn } from "@/lib/utils";
import type { Card as CardType, Suit, GameMode } from "@/lib/types";
import { getCardValues } from "@/lib/game";
import { SuitIcons } from "./icons";


interface GameCardProps extends React.HTMLAttributes<HTMLDivElement> {
  card: CardType;
  isFaceDown?: boolean;
  mode?: GameMode;
}

export function GameCard({ card, isFaceDown = false, className, mode = 'easy', ...props }: GameCardProps) {
  const { suit, rank } = card;
  const CARD_VALUES = getCardValues(mode);
  const value = CARD_VALUES[rank];
  const Icon = SuitIcons[suit];
  const color = (suit === 'Hearts' || suit === 'Diamonds') ? 'text-red-600' : 'text-foreground';

  if (isFaceDown) {
    return (
      <div className={cn("aspect-[2.5/3.5] w-24 md:w-28 rounded-lg bg-primary p-2 shadow-lg", className)} {...props}>
        <div className="h-full w-full rounded-md border-2 border-primary-foreground/50 bg-primary-foreground/20" />
      </div>
    );
  }
  
  return (
    <div
      className={cn(
        "aspect-[2.5/3.5] w-24 md:w-28 rounded-lg bg-card p-2 shadow-lg ring-1 ring-inset ring-black/10 flex flex-col justify-between hover:scale-105 hover:shadow-2xl hover:-translate-y-2 cursor-pointer",
        color,
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-start">
        <div className="text-xl md:text-2xl font-bold">{rank}</div>
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
      <div className="self-center text-3xl md:text-4xl font-bold">
        {value === '/' ? '÷' : value === '*' ? '×' : value}
      </div>
      <div className="flex flex-col items-end rotate-180">
        <div className="text-xl md:text-2xl font-bold">{rank}</div>
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
    </div>
  );
}
