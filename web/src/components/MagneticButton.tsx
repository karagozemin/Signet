import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * A restrained button: hover fills from the bottom, no cursor tracking.
 * Renders as a router <Link> when `to` is given, else a <button>.
 */
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

  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
