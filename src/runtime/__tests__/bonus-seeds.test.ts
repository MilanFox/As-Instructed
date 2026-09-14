import { describe, expect, test } from 'vitest';
import type { LevelDef } from '../../levels/index.ts';
import { getLevel } from '../../levels/index.ts';
import { unlockedApiNames } from '../ambient.ts';
import { aggregate } from '../aggregate.ts';
import { runSeed } from '../run-level.ts';
import type { SeedRun } from '../run-level.ts';

const OVERFIT_TEST = 'crates.length === 8 && depots.size === 4';

function sortingProgram(groupWhen: string): string {
  return [
    'const depots = new Map();',
    'const crates = [];',
    'const seen = new Set();',
    'function note(tile) {',
    "  const k = tile.at.x + ',' + tile.at.y;",
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    '  if (tile.mark) depots.set(tile.mark, tile.at);',
    '  for (const stack of tile.items) {',
    '    for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });',
    '  }',
    '}',
    'function read() { note(scan()); note(scan(Dir.North)); note(scan(Dir.South)); }',
    'function goTo(target) {',
    '  while (pos().x !== target.x) move(pos().x < target.x ? Dir.East : Dir.West);',
    '  while (pos().y !== target.y) move(pos().y < target.y ? Dir.South : Dir.North);',
    '}',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    'let along = Dir.East;',
    'for (;;) {',
    '  read();',
    '  while (canMove(along)) { move(along); read(); }',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (canMove(Dir.South)) move(Dir.South);',
    '  along = along === Dir.East ? Dir.West : Dir.East;',
    '}',
    'const order = [];',
    'for (const crate of crates) if (!order.includes(crate.kind)) order.push(crate.kind);',
    'let round = crates;',
    `if (${groupWhen}) {`,
    '  round = [];',
    '  for (const kind of order) {',
    '    for (const crate of crates) if (crate.kind === kind) round.push(crate);',
    '  }',
    '}',
    'for (const crate of round) {',
    '  const depot = depots.get(crate.kind);',
    '  if (!depot) continue;',
    '  goTo(crate.at);',
    '  pickup(crate.kind);',
    '  goTo(depot);',
    '  drop(crate.kind);',
    '}',
  ].join('\n');
}

const BLIND_STEPS = 24;
const SURVEY_STRIDE = 6;

function blindProgram(steps: number): string {
  return Array.from({ length: steps }, () => 'move(Dir.East);').join('\n');
}

function stridedSurveyProgram(stride: number): string {
  return [
    'while (canMove(Dir.East)) {',
    `  for (let step = 0; step < ${String(stride)}; step++) move(Dir.East);`,
    '}',
  ].join('\n');
}

function levelOrThrow(id: string): LevelDef {
  const level = getLevel(id);
  if (!level) throw new Error(`no level ${id}`);
  return level;
}

function runEverySeed(level: LevelDef, js: string): SeedRun[] {
  return level.seeds.map((seed) =>
    runSeed({
      level,
      seed,
      js,
      source: js,
      unlockedHardware: unlockedApiNames(level.id),
    }),
  );
}

function starFor(runs: SeedRun[], id: string): boolean {
  const response = aggregate(runs);
  if (!response.ok) throw new Error('the run did not come back');
  const row = response.verdict.objectives.find((objective) => objective.id === id);
  if (!row) throw new Error(`the verdict never mentioned ${id}`);
  return row.met;
}

describe('w3-02: the bonus star is graded on every seed', () => {
  const level = levelOrThrow('w3-02');
  const bonusId = 'one-depot-at-a-time';

  test('the level still has more than one seed and a bonus to grade', () => {
    expect(level.seeds.length).toBeGreaterThan(1);
    expect((level.bonus ?? []).map((objective) => objective.id)).toContain(bonusId);
  });

  test('a round that groups by class on every layout keeps the star', () => {
    const runs = runEverySeed(level, sortingProgram('true'));
    expect(runs.every((run) => run.result.passed)).toBe(true);
    expect(runs.map((run) => run.result.bonus?.[0]?.met)).toEqual(runs.map(() => true));
    expect(starFor(runs, bonusId)).toBe(true);
  });

  test('a round that groups on no layout never had the star', () => {
    const runs = runEverySeed(level, sortingProgram('false'));
    expect(runs.every((run) => run.result.passed)).toBe(true);
    expect(runs.some((run) => run.result.bonus?.[0]?.met)).toBe(false);
    expect(starFor(runs, bonusId)).toBe(false);
  });

  test('a round that only groups on seed one is refused it', () => {
    const runs = runEverySeed(level, sortingProgram(OVERFIT_TEST));

    expect(runs.every((run) => run.result.passed)).toBe(true);

    const [first, ...rest] = runs;
    if (!first) throw new Error('no seeds ran');
    expect(first.result.bonus?.[0]?.met).toBe(true);
    expect(rest.some((run) => run.result.bonus?.[0]?.met)).toBe(false);

    expect(starFor(runs, bonusId)).toBe(false);
  });

  test('the reported ticks and the reported star come from the same standard', () => {
    const runs = runEverySeed(level, sortingProgram(OVERFIT_TEST));
    const response = aggregate(runs);
    if (!response.ok) throw new Error('the run did not come back');

    const worst = Math.max(...runs.map((run) => run.result.ticks));
    expect(response.verdict.stats.ticks).toBe(worst);

    const offender = runs.find((run) => run.result.ticks === worst);
    expect(offender?.result.bonus?.[0]?.met).toBe(false);
    expect(starFor(runs, bonusId)).toBe(false);
  });

  test("the bonus row shown is the seed that missed it, with that seed's own progress", () => {
    const runs = runEverySeed(level, sortingProgram(OVERFIT_TEST));
    const response = aggregate(runs);
    if (!response.ok) throw new Error('the run did not come back');

    const row = response.verdict.objectives.find((objective) => objective.id === bonusId);
    const missed = runs.map((run) => run.result.bonus?.[0]).find((report) => report && !report.met);
    expect(row).toEqual(missed);
  });

  test('an unmet bonus never costs the run its pass', () => {
    const runs = runEverySeed(level, sortingProgram('false'));
    const response = aggregate(runs);
    if (!response.ok) throw new Error('the run did not come back');
    expect(response.verdict.passed).toBe(true);
    expect(response.verdict.failure).toBeUndefined();
  });
});

describe('w1-02: the bonus star is graded on every seed', () => {
  const level = levelOrThrow('w1-02');
  const bonusId = 'within-7-canMove';

  test('the level still has more than one seed and a bonus to grade', () => {
    expect(level.seeds.length).toBeGreaterThan(1);
    expect((level.bonus ?? []).map((objective) => objective.id)).toContain(bonusId);
  });

  test('a drive that never senses still parks on the pad on every seed', () => {
    const js = blindProgram(BLIND_STEPS);
    expect(js).not.toContain('canMove');

    const runs = runEverySeed(level, js);
    expect(runs.every((run) => run.result.passed)).toBe(true);

    const response = aggregate(runs);
    if (!response.ok) throw new Error('the run did not come back');
    expect(response.verdict.passed).toBe(true);
    expect(response.verdict.stats.senses?.['canMove'] ?? 0).toBe(0);
  });

  test('a drive that never senses fits one corridor and is refused the star for the rest', () => {
    const runs = runEverySeed(level, blindProgram(BLIND_STEPS));
    expect(runs.map((run) => [run.result.seed, run.result.bonus?.[0]?.met])).toEqual([
      [1, false],
      [4, true],
      [7, false],
    ]);
    expect(starFor(runs, bonusId)).toBe(false);
  });

  test('a strided survey stays inside both budgets and keeps the star', () => {
    const runs = runEverySeed(level, stridedSurveyProgram(SURVEY_STRIDE));
    expect(runs.every((run) => run.result.passed)).toBe(true);
    expect(runs.map((run) => run.result.bonus?.[0]?.met)).toEqual(runs.map(() => true));
    expect(starFor(runs, bonusId)).toBe(true);
  });
});

describe('the per-seed bonus report', () => {
  test('a level with no bonus carries no bonus field', () => {
    const level = levelOrThrow('w1-01');
    expect(level.bonus ?? []).toEqual([]);
    const run = runSeed({
      level,
      seed: level.seeds[0] as number,
      js: 'print("idle");',
      source: 'print("idle");',
      unlockedHardware: unlockedApiNames(level.id),
    });
    expect(run.result.bonus).toBeUndefined();
  });

  test('required objectives and bonus objectives stay in separate lists per seed', () => {
    const level = levelOrThrow('w3-02');
    const run = runSeed({
      level,
      seed: level.seeds[0] as number,
      js: 'print("idle");',
      source: 'print("idle");',
      unlockedHardware: unlockedApiNames(level.id),
    });
    expect(run.result.objectives.map((objective) => objective.id)).toEqual(
      level.objectives.map((objective) => objective.id),
    );
    expect(run.result.bonus?.map((objective) => objective.id)).toEqual(
      (level.bonus ?? []).map((objective) => objective.id),
    );
    expect(run.result.passed).toBe(false);
  });
});
