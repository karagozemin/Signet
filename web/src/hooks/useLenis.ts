import { useEffect } from 'react';
import Lenis from '@studio-freight/lenis';

/**
 * Momentum smooth-scroll. Disabled automatically under reduced-motion.
 * Exposes the Lenis instance on window for GSAP ScrollTrigger sync later.
 */
export function useLenis() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    (window as any).__lenis = lenis;

    let raf = 0;
    const loop = (time: number) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); lenis.destroy(); (window as any).__lenis = null; };
  }, []);
}