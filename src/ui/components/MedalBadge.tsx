import type { Medal } from '../../game/score.ts';

const GLYPH: Record<Medal, string> = { gold: 'I', silver: 'II', bronze: 'III', none: '—' };
const NAME: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

export function MedalBadge({
  medal,
  size = 'sm',
}: {
  medal: Medal;
  size?: 'sm' | 'lg';
}): React.JSX.Element {
  return (
    <span
      className={`medal medal--${medal}${size === 'lg' ? ' medal--lg' : ''}`}
      title={NAME[medal]}
      aria-label={NAME[medal]}
      role="img"
    >
      {GLYPH[medal]}
    </span>
  );
}
