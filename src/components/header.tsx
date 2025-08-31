import Link from 'next/link';
import { Button } from './ui/button';
import { Sparkles } from 'lucide-react';

const Header = () => {
  return (
    <header className="py-4 px-6 md:px-10 flex items-center justify-between border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <Link href="/" className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-headline">
          CardCalc
        </h1>
      </Link>
      <nav>
        <Button asChild variant="ghost">
          <Link href="/rules">Game Rules</Link>
        </Button>
      </nav>
    </header>
  );
};

export default Header;
