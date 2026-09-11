import { describe, expect, test } from 'vitest';
import { Medal, levelPoints, medalForLevel } from '../../../game/score.ts';
import { getLevel } from '../../../levels/index.ts';
import { personalBestLine } from '../../copy.ts';
import { MedalBadge } from '../../components/MedalBadge.tsx';
import { celebrationFor, reportedMedal, resultWord } from '../../desk/paper/report.ts';

const UNGRADED = getLevel('w1-01');
const GRADED = getLevel('w1-05');
const TICKS = 78;

function badge(medal: Medal | null): { className: string; label: string; glyph: unknown } {
  const element = MedalBadge({ medal, size: 'lg' }) as unknown as {
    props: { className: string; 'aria-label': string; children: unknown };
  };
  return {
    className: element.props.className,
    label: element.props['aria-label'],
    glyph: element.props.children,
  };
}

describe('the same 78 ticks, graded and ungraded', () => {
  test('the ungraded level admits no medal; the graded one grades the same 78', () => {
    expect(UNGRADED && medalForLevel(UNGRADED, true, TICKS)).toBe(null);
    expect(GRADED && medalForLevel(GRADED, true, TICKS)).toBe(Medal.Bronze);
    expect(GRADED && medalForLevel(GRADED, true, GRADED.par.ticks)).toBe(Medal.Gold);
  });

  test('a failed run on an ungraded level is still not a medal', () => {
    expect(UNGRADED && medalForLevel(UNGRADED, false, TICKS)).toBe(null);
  });

  test('but the report does not stamp a failed run closed', () => {
    expect(reportedMedal(UNGRADED, false, TICKS)).toBe(Medal.None);
    expect(reportedMedal(GRADED, false, TICKS)).toBe(Medal.None);
    expect(reportedMedal(undefined, false, TICKS)).toBe(Medal.None);
  });

  test('a pass reports what the level awards, and nothing else does', () => {
    expect(reportedMedal(UNGRADED, true, TICKS)).toBe(null);
    expect(GRADED && reportedMedal(GRADED, true, GRADED.par.ticks)).toBe(Medal.Gold);
  });

  test('both are paid three points', () => {
    expect(levelPoints(null)).toBe(levelPoints(Medal.Gold));
    expect(levelPoints(null)).toBe(3);
  });

  test('stars are added to an ungraded close exactly as to a gold', () => {
    expect(levelPoints(null, 2)).toBe(5);
  });
});

describe('the certificate calls the result by its name', () => {
  test('an ungraded close is closed, not a medal that is missing', () => {
    expect(resultWord(null)).toBe('closed');
    expect(resultWord(null)).not.toContain('medal');
  });

  test('a graded level still names its medal, and an unearned one is still absent', () => {
    expect(resultWord(Medal.Gold)).toBe('gold');
    expect(resultWord(Medal.None)).toBe('no medal');
  });
});

describe('the ceremony still fires', () => {
  test('an ungraded close takes the pass arc, the same one a medal-less pass takes', () => {
    expect(celebrationFor(null)).toBe('pass');
    expect(celebrationFor(Medal.None)).toBe('pass');
  });

  test('a medal still takes its own arc', () => {
    expect(celebrationFor(Medal.Gold)).toBe('gold');
    expect(celebrationFor(Medal.Silver)).toBe('silver');
    expect(celebrationFor(Medal.Bronze)).toBe('bronze');
  });

  test('the record line is untouched — it compares the player against themselves', () => {
    expect(personalBestLine(84, TICKS)).toBe(
      'Your own record, lowered by 6. The old figure has been retained.',
    );
  });
});

describe('the badge has a null arm rather than a special case at the call site', () => {
  test('an ungraded close draws a closed stamp, not the empty rung', () => {
    expect(badge(null).className).toContain('medal--closed');
    expect(badge(null).label).toBe('closed');
    expect(badge(null).glyph).not.toBe('—');
  });

  test('a medal not earned yet still draws the empty rung', () => {
    expect(badge(Medal.None).className).toContain('medal--none');
    expect(badge(Medal.None).label).toBe('no medal');
    expect(badge(Medal.None).glyph).toBe('—');
  });

  test('a gold is unchanged', () => {
    expect(badge(Medal.Gold).className).toContain('medal--gold');
    expect(badge(Medal.Gold).label).toBe('gold');
    expect(badge(Medal.Gold).glyph).toBe('I');
  });
});
