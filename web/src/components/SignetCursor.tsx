import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * SignetCursor — a bespoke cursor that reads as a wax-seal stamp.
 * - idle: a small brass ring with a center dot
 * - over interactive elements ([data-cursor="seal"], a, button): expands into a
 *   wax-red seal with a faint "S" — the click target feels like a place to stamp
 * Falls back to the native cursor when the pointer is coarse (touch).
 */
export function SignetCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.6 });

  const [seal, setSeal] = useState(false);
  const [down, setDown] = useState(false);
  const [hidden, setHidden] = useState(false);
  const coarse = useRef(false);

  useEffect(() => {
    coarse.current = window.matchMedia('(pointer: coarse)').matches;
    if (coarse.current) { setHidden(true); return; }

    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = (e.target as HTMLElement)?.closest?.(
        'a,button,[data-cursor=\"seal\"],input,textarea,[role=\"button\"]'
      );
      setSeal(!!el && el.getAttribute('data-cursor') !== 'text');
    };
    const enter = () => setHidden(false);
    const leave = () => setHidden(true);
    const dn = () => setDown(true);
    const up = () => setDown(false);

    window.addEventListener('pointermove', move);
    document.addEventListener('pointerenter', enter);
    document.addEventListener('pointerleave', leave);
    window.addEventListener('pointerdown', dn);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerenter', enter);
      document.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerdown', dn);
      window.removeEventListener('pointerup', up);
    };
  }, [x, y]);

  if (hidden) return null;

  return (
    <motion.div
      aria-hidden
      style={{
        position: 'fixed', left: 0, top: 0, x: sx, y: sy,
        zIndex: 10000, pointerEvents: 'none',
        translateX: '-50%', translateY: '-50%',
      }}
    >
      <motion.div
        animate={{
          width: seal ? 46 : 14,
          height: seal ? 46 : 14,
          scale: down ? 0.82 : 1,
          backgroundColor: seal ? 'rgba(200,16,46,0.14)' : 'rgba(198,161,91,0)',
          borderColor: seal ? '#C8102E' : '#C6A15B',
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          display: 'grid', placeItems: 'center',
          borderRadius: '50%', border: '1.5px solid',
        }}
      >
        <motion.span
          animate={{ opacity: seal ? 1 : 0, scale: seal ? 1 : 0.4 }}
          transition={{ duration: 0.2 }}
          style={{
            fontFamily: 'var(--font-display)', color: '#C8102E',
            fontSize: 22, lineHeight: 1, marginTop: -2,
          }}
        >
          S
        </motion.span>
        {!seal && (
          <span style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: '#C6A15B' }} />
        )}
      </motion.div>
    </motion.div>
  );
}