import { describe, expect, it } from 'vitest';
import {
  BONUS_STAR_POINTS,
  Medal,
  countChars,
  levelMaxPoints,
  levelPoints,
  medalFor,
  reviewTier,
} from '../score.ts';

describe('medalFor', () => {
  it('is gold at exactly par and below', () => {
    expect(medalFor(true, 6, 6)).toBe(Medal.Gold);
    expect(medalFor(true, 5, 6)).toBe(Medal.Gold);
    expect(medalFor(true, 0, 6)).toBe(Medal.Gold);
  });

  it('is silver up to and including par * 1.25', () => {
    expect(medalFor(true, 10, 8)).toBe(Medal.Silver);
    expect(medalFor(true, 7, 6)).toBe(Medal.Silver);
    expect(medalFor(true, 9, 8)).toBe(Medal.Silver);
  });

  it('is bronze one tick past the silver bound', () => {
    expect(medalFor(true, 11, 8)).toBe(Medal.Bronze);
    expect(medalFor(true, 8, 6)).toBe(Medal.Bronze);
  });

  it('is none when the run did not pass, however fast', () => {
    expect(medalFor(false, 1, 6)).toBe(Medal.None);
  });
});

describe('points', () => {
  it('weights gold 3, silver 2, bronze 1, star +1', () => {
    expect(levelPoints(Medal.Gold)).toBe(3);
    expect(levelPoints(Medal.Silver)).toBe(2);
    expect(levelPoints(Medal.Bronze)).toBe(1);
    expect(levelPoints(Medal.None)).toBe(0);
    expect(levelPoints(Medal.Gold, 2)).toBe(3 + 2 * BONUS_STAR_POINTS);
    expect(levelMaxPoints(2)).toBe(5);
  });
});

describe('reviewTier', () => {
  it('picks the tier at each boundary', () => {
    expect(reviewTier(0).grade).toBe('DEVELOPING');
    expect(reviewTier(24).grade).toBe('DEVELOPING');
    expect(reviewTier(25).grade).toBe('CONSISTENT WITH EXPECTATION');
    expect(reviewTier(49.9).grade).toBe('CONSISTENT WITH EXPECTATION');
    expect(reviewTier(50).grade).toBe('ABOVE BASELINE');
    expect(reviewTier(74).grade).toBe('ABOVE BASELINE');
    expect(reviewTier(75).grade).toBe('EXCEPTIONAL (NON-BINDING)');
    expect(reviewTier(92).grade).toBe('EXCEPTIONAL (NON-BINDING)');
    expect(reviewTier(93).grade).toBe('RETAINED');
    expect(reviewTier(100).grade).toBe('RETAINED');
  });

  it('survives nonsense input', () => {
    expect(reviewTier(Number.NaN).rank).toBe(1);
    expect(reviewTier(-40).rank).toBe(1);
    expect(reviewTier(4000).rank).toBe(5);
  });
});

describe('countChars', () => {
  it('strips line and block comments', () => {
    expect(countChars('move(); // go east')).toBe('move();'.length);
    expect(countChars('/* header */\nmove();')).toBe('move();'.length);
    expect(countChars('a();/* mid */b();')).toBe('a();b();'.length);
  });

  it('strips leading whitespace and blank lines', () => {
    const source = 'if (x) {\n    move();\n\n}\n';
    expect(countChars(source)).toBe('if (x) {\nmove();\n}'.length);
  });

  it('keeps a // that lives inside a string', () => {
    const source = 'const s = "a // b";';
    expect(countChars(source)).toBe(source.length);
    const single = "const s = 'http://x';";
    expect(countChars(single)).toBe(single.length);
  });

  it('keeps a block comment opener inside a string', () => {
    const source = 'const s = "/* not a comment */";';
    expect(countChars(source)).toBe(source.length);
  });

  it('keeps template literal content, including comment-looking text', () => {
    const source = 'print(`x // y`);';
    expect(countChars(source)).toBe(source.length);
  });

  it('strips comments inside a template substitution but keeps the literal', () => {
    expect(countChars('print(`v=${x /* c */}`);')).toBe('print(`v=${x }`);'.length);
  });

  it('handles nested templates', () => {
    const source = 'print(`a${`b${c}d`}e`);';
    expect(countChars(source)).toBe(source.length);
  });

  it('handles an escaped backtick and escaped quotes', () => {
    const source = 'const s = `a\\`b`;\nconst t = "q\\"r";';
    expect(countChars(source)).toBe(source.length);
  });

  it('does not eat an unterminated comment marker at end of file', () => {
    expect(countChars('move();\n/* dangling')).toBe('move();'.length);
  });

  it('counts an empty program as zero', () => {
    expect(countChars('')).toBe(0);
    expect(countChars('// only a comment\n\n   \n')).toBe(0);
  });
});
