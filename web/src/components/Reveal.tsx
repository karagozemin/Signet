import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Reveal — a restrained scroll-in wrapper. Content rises and fades once as it
 * enters the viewport, then stays. No parallax gimmicks, no re-triggering.
 * Respects reduced-motion via the global CSS duration override.
 */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'span' | 'li' | 'p' | 'h1' | 'h2' | 'h3';
}) {
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px -12% 0px' }}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}
