import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { getLevel } from '../../levels/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import { SOLUTIONS } from '../../levels/__tests__/solutions.ts';
import { unlockedApiNames } from '../../runtime/ambient.ts';
import { runSeed } from '../../runtime/run-level.ts';
import { traceShape } from '../../runtime/protocol.ts';
import type { RunFacts } from '../achievements.ts';
import { earnedBy } from '../achievements.ts';

function transpile(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    fileName: 'program.ts',
  }).outputText;
}

function baseFacts(patch: Partial<RunFacts>): RunFacts {
  return {
    passed: true,
    attempt: 3,
    senseBudgetMet: false,
    world: 1,
    ticks: 40,
    parTicks: 40,
    beatOwnBest: false,
    seeds: 1,
    seedsPassed: 1,
    moves: 30,
    sensed: 12,
    printed: false,
    markedUnread: false,
    emptyProgram: false,
    unchanged: false,
    routineCalled: false,
    routineOrders: 0,
    singleCall: false,
    sameProgramOtherSector: false,
    sectorClosed: false,
    sectorsClosed: 0,
    sectorAtPar: false,
    sectorStarred: false,
    siteClosed: false,
    siteStarred: false,
    ...patch,
  };
}

describe('sight-unseen', () => {
  test('a multi-layout order closed without one sensing call earns it', () => {
    expect(earnedBy(baseFacts({ seeds: 4, sensed: 0 }))).toContain('sight-unseen');
  });

  test('a single-layout order does not', () => {
    expect(earnedBy(baseFacts({ seeds: 1, sensed: 0 }))).not.toContain('sight-unseen');
  });

  test('one sensing call is enough to keep it away', () => {
    expect(earnedBy(baseFacts({ seeds: 4, sensed: 1 }))).not.toContain('sight-unseen');
  });

  test('a run that did not close does not', () => {
    expect(earnedBy(baseFacts({ seeds: 4, sensed: 0, passed: false }))).not.toContain(
      'sight-unseen',
    );
  });

  test('the w5-03 cable-everything route earns it', () => {
    const source = [
      'const ids: string[] = [];',
      'for (let i = 1; i < 40; i++) {',
      '  try { link("reactor", `sub-${i}`); ids.push(`sub-${i}`); } catch (e) { break; }',
      '}',
      'for (const a of ["reactor"].concat(ids)) for (const b of ids) if (a !== b) link(a, b);',
      'for (let r = 0; r < ids.length; r++) for (const b of ids) power(b, "on");',
    ].join('\n');

    const level = getLevel('w5-03') as LevelDef;
    const js = transpile(source);
    const sensed = level.seeds.map((seed) => {
      const run = runSeed({
        level,
        seed,
        js,
        source,
        unlockedHardware: unlockedApiNames('w5-03'),
      });
      expect(run.verdict.passed, `seed ${seed}`).toBe(true);
      return traceShape(run.trace).sensed;
    });

    const facts = baseFacts({
      seeds: level.seeds.length,
      seedsPassed: level.seeds.length,
      world: level.world,
      sensed: Math.max(...sensed),
    });
    expect(earnedBy(facts)).toContain('sight-unseen');
  });

  test('no reference solution earns it, on any seed', () => {
    const accused: string[] = [];

    for (const [levelId, solution] of Object.entries(SOLUTIONS)) {
      const level = getLevel(levelId) as LevelDef;
      const js = transpile(solution.source);
      const hardware = unlockedApiNames(levelId);

      const sensed = level.seeds.map((seed) => {
        const run = runSeed({
          level,
          seed,
          js,
          source: solution.source,
          unlockedHardware: hardware,
        });
        expect(run.verdict.passed, `${levelId} seed ${seed}`).toBe(true);
        return traceShape(run.trace).sensed;
      });

      const facts = baseFacts({
        seeds: level.seeds.length,
        seedsPassed: level.seeds.length,
        world: level.world,
        sensed: Math.max(...sensed),
      });
      if (earnedBy(facts).includes('sight-unseen')) accused.push(levelId);
    }

    expect(accused).toEqual([]);
  });
});
