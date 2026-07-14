import { type ReactNode } from 'react';

/**
 * A restrained button: hover fills from the bottom, no cursor tracking.
 */
export function MagneticButton({
  children, onClick, variant = 'solid',
}: { children: ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost' }) {
  return (
    <button onClick={onClick} className={`mag-btn mag-btn--${variant}`}>
      <span>{children}</span>
    </button>
  );
}
