import { describe, expect, test } from 'vitest';
import type { Objective, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind, evaluateObjectives, medalFor } from '../../../engine/index.ts';
import type { Budget } from '../../../game/budgets.ts';
import { budgetFor } from '../../../game/budgets.ts';
import { playbackFor } from '../../../game/playback.ts';
import type { LevelRunResult } from '../../harness.ts';
import { runLevel, runReference } from '../../harness.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { WORLD_2_LEVELS, w2_04, w2_05 } from '../index.ts';
import { solution as w2_02Solution } from '../__solutions__/w2-02.ts';
import { solution as w2_04Solution } from '../__solutions__/w2-04.ts';
import { solution as w2_05Solution } from '../__solutions__/w2-05.ts';
import { serpentineHarvest } from '../../__tests__/naive.ts';

const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w2-02': w2_02Solution,
  'w2-04': w2_04Solution,
  'w2-05': w2_05Solution,
};

const key = (at: Vec): string => `${at.x},${at.y}`;

const contextOf = (run: LevelRunResult): ObjectiveContext => ({
  world: run.world,
  initialWorld: run.initialWorld,
  trace: run.trace,
});

const bonusOf = (level: LevelDef): Objective => {
  const objective = (level.bonus ?? [])[0];
  if (!objective) throw new Error(`${level.id} has no bonus`);
  return objective;
};

const scoreBonus = (
  level: LevelDef,
  run: LevelRunResult,
): { met: boolean; progress: [number, number] | undefined } => {
  const scored = evaluateObjectives([bonusOf(level)], contextOf(run))[0];
  if (!scored) throw new Error(`${level.id} scored no bonus`);
  return { met: scored.met, progress: scored.progress };
};

const starred = (level: LevelDef, run: LevelRunResult): boolean => scoreBonus(level, run).met;

const readout = (level: LevelDef, run: LevelRunResult): Budget | null => {
  const objective = bonusOf(level);
  const scored = scoreBonus(level, run);
  const track = playbackFor(level, run.trace)?.tracks.find((entry) => entry.id === objective.id);
  return budgetFor(
    { id: objective.id, label: objective.label, met: scored.met, progress: scored.progress },
    { trace: run.trace, stats: run.verdict.stats, history: track?.progress },
  );
};

const footprintOf = (run: LevelRunResult): number => {
  const seen = new Set<string>();
  const bot = run.initialWorld.bots[0];
  if (bot) seen.add(key(bot.at));
  for (const event of run.trace.events) {
    if (event.kind === 'move' && event.ok) seen.add(key(event.to));
  }
  return seen.size;
};

const goTo = (sim: Sim, botId: number, to: Vec): void => {
  for (let guard = 0; guard < 40; guard++) {
    const at = sim.pos(botId);
    if (at.x === to.x && at.y === to.y) return;
    if (at.x < to.x) sim.move(botId, Dir.East);
    else if (at.x > to.x) sim.move(botId, Dir.West);
    else if (at.y < to.y) sim.move(botId, Dir.South);
    else sim.move(botId, Dir.North);
  }
};

const stayPut = (): void => undefined;

function standOnEachCropAsItRipens(sim: Sim, botId: number): void {
  const pending = new Map<string, Vec>();
  const ready = new Map<string, number>();
  const bare = new Map<string, Vec>();
  const mine = new Set<string>();
  const taken = new Set<string>();

  const read = (view: {
    at: Vec;
    inBounds: boolean;
    walkable: boolean;
    crop: ItemKind | null;
    growth: number;
    maxGrowth: number;
  }): void => {
    if (!view.inBounds || !view.walkable) return;
    const at = key(view.at);
    if (view.crop === null) {
      pending.delete(at);
      ready.delete(at);
      bare.set(at, view.at);
      return;
    }
    bare.delete(at);
    if (mine.has(at) || taken.has(at)) return;
    pending.set(at, view.at);
    if (view.growth > 0) ready.set(at, sim.clock(botId) + (view.maxGrowth - view.growth));
  };
  const look = (): void => {
    read(sim.scan(botId));
    for (const dir of [Dir.North, Dir.South, Dir.East, Dir.West]) read(sim.scan(botId, dir));
  };
  const walk = (to: Vec): void => {
    for (let guard = 0; guard < 12; guard++) {
      const at = sim.pos(botId);
      if (at.x === to.x && at.y === to.y) return;
      if (at.x < to.x) sim.move(botId, Dir.East);
      else if (at.x > to.x) sim.move(botId, Dir.West);
      else if (at.y < to.y) sim.move(botId, Dir.South);
      else sim.move(botId, Dir.North);
      look();
    }
  };

  look();
  for (let guard = 0; bare.size === 0 && guard < 6; guard++) {
    if (!sim.canMove(botId, Dir.East)) break;
    sim.move(botId, Dir.East);
    look();
  }
  const opener = [...bare.values()][0];
  if (opener) {
    walk(opener);
    if (sim.plant(botId)) mine.add(key(opener));
    bare.delete(key(opener));
    look();
  }

  for (let guard = 0; pending.size > 0 && guard < 80; guard++) {
    const soonest = [...ready].filter(([at]) => pending.has(at)).sort((a, b) => a[1] - b[1])[0];
    if (!soonest) {
      const here = sim.pos(botId);
      const span = (at: Vec): number => Math.abs(at.x - here.x) + Math.abs(at.y - here.y);
      const nearest = [...pending.values()].sort((a, b) => span(a) - span(b))[0] as Vec;
      if (span(nearest) === 0) sim.wait(botId, 1);
      else walk(nearest);
      look();
      continue;
    }
    const [at] = soonest;
    walk(pending.get(at) as Vec);
    for (let wait = 0; wait < 50; wait++) {
      const here = sim.scan(botId);
      if (here.crop === null || here.growth >= here.maxGrowth) break;
      sim.wait(botId, Math.max(1, here.maxGrowth - here.growth));
    }
    pending.delete(at);
    ready.delete(at);
    if (sim.harvest(botId) !== null) {
      taken.add(at);
      if (sim.plant(botId)) mine.add(at);
    }
    look();
  }

  for (const at of [...bare.values()]) {
    walk(at);
    if (sim.scan(botId).crop === null) sim.plant(botId);
  }
}

function waitLongEnoughOnEverything(sim: Sim, botId: number): void {
  const plot: Vec[] = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
  ];
  const sown = new Set<string>();
  for (const at of plot) {
    goTo(sim, botId, at);
    if (sim.plant(botId)) sown.add(key(at));
  }
  for (const at of [...plot].reverse()) {
    if (sown.has(key(at))) continue;
    goTo(sim, botId, at);
    sim.wait(botId, 45);
    if (sim.harvest(botId) !== null) sim.plant(botId);
  }
}

function surveyTwoLanesThenStrike(sim: Sim, botId: number): void {
  const capacity = sim.capacity(botId);
  const ripe = new Map<string, Vec>();
  let held = 0;

  const note = (view: {
    at: Vec;
    inBounds: boolean;
    crop: ItemKind | null;
    growth: number;
    maxGrowth: number;
  }): void => {
    if (!view.inBounds) return;
    if (view.crop === ItemKind.Crop && view.growth >= view.maxGrowth)
      ripe.set(key(view.at), view.at);
  };
  const readAround = (): void => {
    note(sim.scan(botId));
    note(sim.scan(botId, Dir.North));
    note(sim.scan(botId, Dir.South));
  };
  const takeHere = (): void => {
    const at = sim.pos(botId);
    if (!ripe.has(key(at))) return;
    ripe.delete(key(at));
    if (sim.harvest(botId) !== null) held++;
  };

  for (const lane of [2, 5]) {
    if (held >= capacity) break;
    goTo(sim, botId, { x: sim.pos(botId).x, y: lane });
    readAround();
    takeHere();
    const heading = sim.pos(botId).x === 1 ? Dir.East : Dir.West;
    while (held < capacity && sim.canMove(botId, heading)) {
      sim.move(botId, heading);
      readAround();
      takeHere();
      const column = sim.pos(botId).x;
      for (const row of [lane - 1, lane + 1]) {
        if (held >= capacity) break;
        if (!ripe.has(key({ x: column, y: row }))) continue;
        goTo(sim, botId, { x: column, y: row });
        takeHere();
        goTo(sim, botId, { x: column, y: lane });
      }
    }
  }
}

describe('world 2 shape', () => {
  test('three levels, in order, each with exactly one bonus star', () => {
    expect(WORLD_2_LEVELS.map((level) => level.id)).toEqual(['w2-02', 'w2-04', 'w2-05']);
    for (const level of WORLD_2_LEVELS) {
      expect((level.bonus ?? []).length, level.id).toBe(1);
    }
  });

  for (const level of WORLD_2_LEVELS) {
    test(`${level.id} reference solution still takes gold on every seed`, () => {
      const solution = SOLUTIONS[level.id] as ReferenceSolution;
      for (const seed of level.seeds) {
        const run = runReference(level, seed, solution);
        expect(run.verdict.passed, `${level.id} seed ${String(seed)}`).toBe(true);
        expect(medalFor(true, run.ticks, level.par.ticks), `${level.id} seed ${String(seed)}`).toBe(
          'gold',
        );
      }
    });
  }

  test('no bonus label mentions characters or code length', () => {
    for (const level of WORLD_2_LEVELS) {
      for (const objective of level.bonus ?? []) {
        expect(objective.label.toLowerCase(), level.id).not.toMatch(/char|length|line|short/);
      }
    }
  });
});

describe('w2-04 bonus — spoilage', () => {
  test('standing on each crop as it ripens earns the star on every seed', () => {
    for (const seed of w2_04.seeds) {
      const run = runLevel(w2_04, seed, standOnEachCropAsItRipens);
      expect(run.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(medalFor(true, run.ticks, w2_04.par.ticks), `seed ${String(seed)}`).toBe('gold');
      expect(starred(w2_04, run), `seed ${String(seed)}`).toBe(true);
    }
  });

  test('the resume-sweep solves it and misses the star, the reported seed included', () => {
    const missed = w2_04.seeds.filter((seed) => {
      const run = runReference(w2_04, seed, w2_04Solution);
      expect(run.verdict.passed, `seed ${String(seed)}`).toBe(true);
      return !starred(w2_04, run);
    });
    expect(missed).toContain(1);
    expect(missed.length).toBeGreaterThanOrEqual(3);
  });

  test('waiting instead of reading solves it and misses the star by a mile', () => {
    for (const seed of w2_04.seeds) {
      const run = runLevel(w2_04, seed, waitLongEnoughOnEverything);
      expect(run.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(starred(w2_04, run), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a run that harvests nothing is charged for every crop it left standing', () => {
    const run = runLevel(w2_04, 1, stayPut);
    expect(run.verdict.passed).toBe(false);
    expect(starred(w2_04, run)).toBe(false);
  });

  test('the ledger reads back in spoilage and never in ticks', () => {
    const over = runReference(w2_04, 1, w2_04Solution);
    expect(scoreBonus(w2_04, over).progress).toEqual([24, 18]);
    expect(readout(w2_04, over)).toBeNull();

    const clean = runLevel(w2_04, 1, standOnEachCropAsItRipens);
    const budget = readout(w2_04, clean);
    expect(budget?.meter).toBeNull();
    expect(budget?.used).toBe(5);
    expect(budget?.limit).toBe(18);
    expect(budget?.unit).toBe('spoilage');
  });
});

describe('w2-05 bonus — footprint', () => {
  test('surveying two lanes and striking earns the star inside the shift on every seed', () => {
    for (const seed of w2_05.seeds) {
      const run = runLevel(w2_05, seed, surveyTwoLanesThenStrike);
      expect(run.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w2_05.budget?.maxTicks ?? 0);
      expect(footprintOf(run), `seed ${String(seed)}`).toBeLessThanOrEqual(32);
      expect(starred(w2_05, run), `seed ${String(seed)}`).toBe(true);
    }
  });

  test('the serpentine sweep runs out of shift, and misses the star where it does not', () => {
    const closed: number[] = [];
    for (const seed of w2_05.seeds) {
      let run;
      try {
        run = runReference(w2_05, seed, serpentineHarvest);
      } catch (error) {
        expect((error as Error).message, `seed ${String(seed)}`).toContain('Shift over');
        continue;
      }
      closed.push(seed);
      expect(run.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(footprintOf(run), `seed ${String(seed)}`).toBeGreaterThan(32);
      expect(starred(w2_05, run), `seed ${String(seed)}`).toBe(false);
    }
    expect(closed).toEqual([1, 4]);
  });

  test('standing still keeps the footprint at one and fails the shift', () => {
    const run = runLevel(w2_05, 1, stayPut);
    expect(footprintOf(run)).toBe(1);
    expect(run.verdict.passed).toBe(false);
  });

  test('the footprint reads back in tiles, unclamped', () => {
    const over = runReference(w2_05, 1, serpentineHarvest);
    expect(scoreBonus(w2_05, over).progress).toEqual([41, 32]);
    expect(readout(w2_05, over)).toBeNull();

    const clean = runLevel(w2_05, 1, surveyTwoLanesThenStrike);
    const budget = readout(w2_05, clean);
    expect(budget?.meter).toBeNull();
    expect(budget?.used).toBe(23);
    expect(budget?.limit).toBe(32);
    expect(budget?.unit).toBe('tiles');
  });
});
