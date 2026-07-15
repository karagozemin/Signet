import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * A calm wax-fade between routes: the page settles up into place and
 * lifts away on exit — no spin, no slide, just a considered dissolve.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
      transition={{ duration: 0.55, ease: EASE }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
}
