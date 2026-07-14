import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * A button that leans toward the cursor — a small, premium tell.
 * Pairs with SignetCursor's seal state (data-cursor="seal" is implicit on <button>).
 */
export function MagneticButton({
  children, onClick, variant = 'solid',
}: { children: ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost' }) {
  const ref = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 300, damping: 20 });
  const y = useSpring(my, { stiffness: 300, damping: 20 });

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * 0.35);
    my.set((e.clientY - (r.top + r.height / 2)) * 0.35);
  };
  const reset = () => { mx.set(0); my.set(0); };

  return (
    <motion.button
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onClick={onClick}
      style={{ x, y }}
      whileTap={{ scale: 0.96 }}
      className={`mag-btn mag-btn--${variant}`}
    >
      <span>{children}</span>
    </motion.button>
  );
}