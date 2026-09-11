import type { Medal } from '../../game/score.ts';

const GLYPH: Record<Medal, string> = { gold: 'I', silver: 'II', bronze: 'III', none: '—' };
const NAME: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

const CLOSED = { glyph: '✓', name: 'closed', variant: 'closed' };

export function MedalBadge({
  medal,
  size = 'sm',
}: {
  medal: Medal | null;
  size?: 'sm' | 'lg';
}): React.JSX.Element {
  const variant = medal === null ? CLOSED.variant : medal;
  const name = medal === null ? CLOSED.name : NAME[medal];
  return (
    <span
      className={`medal medal--${variant}${size === 'lg' ? ' medal--lg' : ''}`}
      title={name}
      aria-label={name}
      role="img"
    >
      {medal === null ? CLOSED.glyph : GLYPH[medal]}
    </span>
  );
}
