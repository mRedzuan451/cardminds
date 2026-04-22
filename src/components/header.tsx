import Link from 'next/link';
import { Button } from './ui/button';
import { Sparkles } from 'lucide-react';

const Header = () => {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-background/50 px-6 py-4 backdrop-blur-xl md:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-primary shadow-md backdrop-blur">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-foreground font-headline tracking-wide">
          CardMinds
        </h1>
      </Link>
      <nav>
        <Button asChild variant="outline" className="border-white/10 bg-white/5">
          <Link href="/rules">Game Rules</Link>
        </Button>
      </nav>
      </div>
    </header>
  );
};

export default Header;
