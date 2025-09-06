
'use client';

import { motion } from 'framer-motion';
import { GameCard } from './game-card';

const cards = Array.from({ length: 10 });

export function ShuffleAnimation() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-8 overflow-hidden bg-background">
        <h2 className="text-3xl font-bold font-headline text-primary animate-pulse">Shuffling Deck...</h2>
        <div className="relative h-48 w-48">
        {cards.map((_, i) => (
            <motion.div
            key={i}
            className="absolute"
            style={{ top: '50%', left: '50%', x: '-50%', y: '-50%' }}
            initial={{ scale: 0.5, rotate: 0 }}
            animate={{
                rotate: [0, Math.random() * 720 - 360, 0],
                x: ['-50%', `${Math.random() * 200 - 100}%`, '-50%'],
                y: ['-50%', `${Math.random() * 200 - 100}%`, '-50%'],
                scale: [0.5, 1, 0.5],
            }}
            transition={{
                duration: 2,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatType: 'loop',
                delay: i * 0.1,
            }}
            >
            <GameCard card={{ id: `shuffle-${i}`, suit: 'Spades', rank: 'A' }} isFaceDown />
            </motion.div>
        ))}
        </div>
    </div>
  );
}
