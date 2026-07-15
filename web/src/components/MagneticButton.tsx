import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

/**
 * A restrained button: hover fills from the bottom, no cursor tracking.
 * Renders as a router <Link> when `to` is given, else a <button>.
 * A quiet press (whileTap) gives tactile feedback without drifting.
 */
const MotionLink = motion(Link);

const feel = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
};

export function MagneticButton({
  children, onClick, to, href, variant = 'solid',
}: {
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  href?: string;
  variant?: 'solid' | 'ghost';
}) {
  const cls = `mag-btn mag-btn--${variant}`;
  const inner = <span>{children}</span>;

  if (to) return <MotionLink to={to} className={cls} {...feel}>{inner}</MotionLink>;
  if (href) return (
    <motion.a href={href} target="_blank" rel="noreferrer" className={cls} {...feel}>
      {inner}
    </motion.a>
  );
  return <motion.button onClick={onClick} className={cls} {...feel}>{inner}</motion.button>;
}
