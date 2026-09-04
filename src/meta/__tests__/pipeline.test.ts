import { describe, expect, test } from 'vitest';
import {
  linkProgram,
  measureWrapperOffset,
  resolveModuleLocation,
  topFrameLine,
} from '../../runtime/index.ts';
import { LIBRARY_EMPTY_STARTER } from '../copy.ts';
import { planPublication, publishableDeclarations } from '../publish.ts';

/**
 * The whole loop in one place: solve, publish, import, run, and be told the truth when it breaks.
 *
 * The sources here are deliberately plain JavaScript so the emitter can be left out — `publish.ts`
 * rewrites the player's text and `linkProgram` runs it, and this test is about those two agreeing
 * with each other rather than about Monaco.
 */

const SOLVED = `function walk(n) {
  for (let i = 0; i < n; i++) move();
}

walk(3);
`;

describe('publish, import, run', () => {
  function publish(levelSource: string, name: string): { library: string; level: string } {
    const plan = planPublication({
      levelSource,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations: publishableDeclarations(levelSource),
      selection: [{ name }],
      levelId: 'w4-01',
    });
    return { library: plan.librarySource, level: plan.levelSource };
  }

  test('a published subroutine runs from the next work order and is charged for', () => {
    const { library, level } = publish(SOLVED, 'walk');
    let clock = 0;

    const linked = linkProgram({
      programJs: level,
      libraryJs: library,
      scope: {
        api: {
          move: () => {
            clock += 1;
          },
        },
        values: {},
      },
      meter: { now: () => clock },
    });
    linked.run();

    expect(clock).toBe(3);
    expect(linked.exports).toEqual(['walk']);
    expect(linked.usage.calls['walk']).toEqual({ calls: 1, ticks: 3 });
    expect(linked.usage.ticks).toBe(3);
  });

  test('the level that published it no longer declares it', () => {
    const { level } = publish(SOLVED, 'walk');
    expect(level).toContain("import { walk } from 'lib';");
    expect(level).not.toContain('function walk(n)');
    expect(level).toContain('walk(3);');
  });

  test('an error inside the published subroutine reports the lib.ts line, not the level line', () => {
    const source = 'function boom() {\n  throw new Error("published");\n}\n\nboom();\n';
    const { library, level } = publish(source, 'boom');

    /* `export ` is prepended to the declaration, so `throw` sits one line below where the level
       had it. That is exactly the shift the reported line has to survive. */
    const libraryLine = library.split('\n').findIndex((line) => line.includes('throw new')) + 1;

    const linked = linkProgram({
      programJs: level,
      libraryJs: library,
      scope: { api: {}, values: {} },
      meter: { now: () => 0 },
    });

    try {
      linked.run();
      throw new Error('should have thrown');
    } catch (error) {
      const found = resolveModuleLocation(
        error instanceof Error ? error.stack : undefined,
        measureWrapperOffset(topFrameLine),
        {},
      );
      expect(found?.file).toBe('lib');
      expect(found?.line).toBe(libraryLine);
    }
  });

  test('a second publish leaves the first one alone', () => {
    const first = publish(SOLVED, 'walk');
    const source = 'function turn() {\n  move();\n}\n\nturn();\n';
    const second = planPublication({
      levelSource: source,
      librarySource: first.library,
      declarations: publishableDeclarations(source),
      selection: [{ name: 'turn' }],
      levelId: 'w4-02',
    });

    const linked = linkProgram({
      programJs: `import { walk, turn } from 'lib';\nwalk(1);\nturn();`,
      libraryJs: second.librarySource,
      scope: { api: { move: () => undefined }, values: {} },
    });
    linked.run();
    expect(linked.exports.sort()).toEqual(['turn', 'walk']);
  });
});
