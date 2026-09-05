import type { Medal } from '../../game/score.ts';

const GLYPH: Record<Medal, string> = { gold: 'I', silver: 'II', bronze: 'III', none: '—' };
const NAME: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

/**
 * `null` is an ungraded work order (DESIGN.md §11 A7), and it is not `none` drawn differently.
 * `none` is a medal not earned yet, so it draws the empty rung — a dash, dimmed. `null` is a level
 * that has no rungs, and a pass on one is worth the same three points a gold is, so it draws a
 * closed stamp: the mark of finished work, not the space where a medal would have gone.
 */
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
