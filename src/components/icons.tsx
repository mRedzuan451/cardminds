import type { SVGProps } from 'react';
import type { Suit } from '@/lib/types';

const iconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "currentColor",
};

export function HeartsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  );
}

export function DiamondsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 2L2 12L12 22L22 12L12 2Z" />
    </svg>
  );
}

export function SpadesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12,2C9.48,2,7.5,4.05,7.5,6.65C7.5,9.25,12,14.5,12,14.5S16.5,9.25,16.5,6.65C16.5,4.05,14.52,2,12,2ZM10,16V15H14V16L12,22Z" />
    </svg>
  );
}

export function ClubsIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg {...iconProps} {...props}>
        <path d="M12,2A4.02,4.02,0,0,0,8,6,4.02,4.02,0,0,0,12,10,4.02,4.02,0,0,0,16,6,4.02,4.02,0,0,0,12,2Z M4,7A4,4,0,1,0,8,11,4,4,0,0,0,4,7Z M20,7A4,4,0,1,0,16,11,4,4,0,0,0,20,7Z M12,13.25L7,22H17Z"/>
      </svg>
    );
  }

export const SuitIcons: Record<Suit, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
    Spades: SpadesIcon,
    Hearts: HeartsIcon,
    Diamonds: DiamondsIcon,
    Clubs: ClubsIcon,
};
