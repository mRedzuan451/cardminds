
import { cn } from "@/lib/utils";
import type { Card as CardType, Suit, GameMode } from "@/lib/types";
import { getCardValues } from "@/lib/game";
import { SuitIcons, SpecialIcons } from "./icons";


interface GameCardProps extends React.HTMLAttributes<HTMLDivElement> {
  card: CardType;
  isFaceDown?: boolean;
  mode?: GameMode;
}

export function GameCard({ card, isFaceDown = false, className, mode = 'easy', ...props }: GameCardProps) {
  const { suit, rank } = card;
  const CARD_VALUES = getCardValues(mode);
  const value = CARD_VALUES[rank];

  if (isFaceDown) {
    return (
      <div className={cn("aspect-[2.5/3.5] w-24 md:w-28 rounded-2xl bg-primary p-2 shadow-xl ring-1 ring-inset ring-white/10 transition-transform duration-200 hover:-translate-y-1 hover:shadow-2xl", className)} {...props}>
        <div className="h-full w-full rounded-xl border-2 border-primary-foreground/40 bg-[radial-gradient(circle_at_top,hsl(var(--primary-foreground)/0.18),transparent_45%),linear-gradient(135deg,hsl(var(--primary-foreground)/0.14),transparent)]" />
      </div>
    );
  }

  if (suit === 'Special') {
    const Icon = SpecialIcons[rank as keyof typeof SpecialIcons];
    return (
      <div
        className={cn(
          "aspect-[2.5/3.5] w-24 md:w-28 rounded-2xl bg-card p-2 shadow-xl ring-1 ring-inset ring-amber-400/40 flex flex-col justify-between cursor-pointer text-amber-500 transition-all duration-200 hover:-translate-y-2 hover:scale-[1.03] hover:shadow-2xl",
          className
        )}
        {...props}
      >
        <div className="flex flex-col items-start">
          <div className="text-xl md:text-2xl font-bold">{value}</div>
        </div>
        <div className="self-center">
            <Icon className="h-10 w-10 md:h-12 md:w-12" />
        </div>
        <div className="flex flex-col items-end rotate-180">
          <div className="text-xl md:text-2xl font-bold">{value}</div>
        </div>
      </div>
    );
  }
  
  const Icon = SuitIcons[suit];
  const color = (suit === 'Hearts' || suit === 'Diamonds') ? 'text-red-600' : 'text-foreground';
  
  return (
    <div
      className={cn(
        "aspect-[2.5/3.5] w-24 md:w-28 rounded-2xl bg-card p-2 shadow-xl ring-1 ring-inset ring-black/10 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-2 hover:scale-[1.03] hover:shadow-2xl",
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
        {value === '/' ? '÷' : value === '*' ? '×' : value === '**' ? '^2' : value}
      </div>
      <div className="flex flex-col items-end rotate-180">
        <div className="text-xl md:text-2xl font-bold">{rank}</div>
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
    </div>
  );
}
