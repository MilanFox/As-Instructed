import { describe, expect, test } from 'vitest';
import type { ItemKind, Objective, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, medalFor, scoreChars } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { WORLD_3_LEVELS, w3_01, w3_02, w3_03, w3_04, w3_05 } from '../index.ts';
import { goTo, key, nearestIndex, surveyYard } from '../__solutions__/driver.ts';
import { solution as w3_01Solution } from '../__solutions__/w3-01.ts';
import { solution as w3_02Solution } from '../__solutions__/w3-02.ts';
import { solution as w3_03Solution } from '../__solutions__/w3-03.ts';
import { solution as w3_04Solution } from '../__solutions__/w3-04.ts';
import { solution as w3_05Solution } from '../__solutions__/w3-05.ts';

const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w3-01': w3_01Solution,
  'w3-02': w3_02Solution,
  'w3-03': w3_03Solution,
  'w3-04': w3_04Solution,
  'w3-05': w3_05Solution,
};

const HARDWARE: Record<string, string[]> = {
  'w3-01': ['pickup', 'drop'],
  'w3-02': ['carrying'],
  'w3-03': ['use'],
  'w3-04': [],
  'w3-05': [],
};

const bonusMet = (level: LevelDef, ctx: ObjectiveContext): boolean =>
  evaluateObjectives((level.bonus ?? []) as Objective[], ctx).every((entry) => entry.met);

/** Everything the reference survey learns, reused by the naive drivers below. */
interface Survey {
  crates: { at: Vec; kind: ItemKind }[];
  depots: Map<string, Vec>;
  pads: Vec[];
  marks: Map<number, Vec>;
}

function survey(sim: Sim, botId: number): Survey {
  const found: Survey = { crates: [], depots: new Map(), pads: [], marks: new Map() };
  const seen = new Set<string>();
  surveyYard(sim, botId, (tile) => {
    if (!tile.inBounds || seen.has(key(tile.at))) return;
    seen.add(key(tile.at));
    if (tile.terrain === 'pad') found.pads.push(tile.at);
    if (tile.mark) found.depots.set(tile.mark, tile.at);
    const index = tile.mark === null ? Number.NaN : Number(tile.mark);
    for (const stack of tile.items) {
      if (Number.isInteger(index)) found.marks.set(index, tile.at);
      for (let i = 0; i < stack.count; i++) found.crates.push({ at: tile.at, kind: stack.kind });
    }
  });
  return found;
}

describe('World 3 — structure', () => {
  test('the world exports five levels in play order', () => {
    expect(WORLD_3_LEVELS).toEqual([w3_01, w3_02, w3_03, w3_04, w3_05]);
  });

  for (const level of WORLD_3_LEVELS) {
    describe(`${level.id} — ${level.title}`, () => {
      test('identity, seeds and par are well formed', () => {
        expect(level.id).toBe(`w3-0${level.index}`);
        expect(level.world).toBe(3);
        expect(level.index).toBe(WORLD_3_LEVELS.indexOf(level) + 1);
        expect(level.seeds.length).toBeGreaterThanOrEqual(3);
        expect(new Set(level.seeds).size).toBe(level.seeds.length);
        expect(level.par.ticks).toBeGreaterThan(0);
        expect(level.objectives.length).toBeGreaterThan(0);
        expect(level.brief.trim().length).toBeGreaterThan(0);
        expect(level.starter.trim().length).toBeGreaterThan(0);
        expect(level.hardware).toEqual(HARDWARE[level.id]);
      });

      test('hints are nudges, not code', () => {
        expect(level.hints.length).toBeGreaterThanOrEqual(3);
        for (const hint of level.hints) {
          expect(hint.trim().length).toBeGreaterThan(0);
          expect(hint).not.toContain('```');
          expect(hint).not.toContain('`');
          expect(hint).not.toMatch(/[()]/);
        }
      });

      test('build is deterministic for a given seed', () => {
        for (const seed of level.seeds) {
          expect(level.build(seed)).toEqual(level.build(seed));
        }
      });

      test('par.chars covers the reference source', () => {
        const solution = SOLUTIONS[level.id];
        expect(solution).toBeDefined();
        expect(level.par.chars).toBeGreaterThanOrEqual(scoreChars(solution!.source));
      });
    });
  }
});

describe('World 3 — the reference solutions clear par on every seed', () => {
  for (const level of WORLD_3_LEVELS) {
    const solution = SOLUTIONS[level.id]!;
    for (const seed of level.seeds) {
      test(`${level.id} seed ${seed}`, () => {
        const result = runReference(level, seed, solution);
        expect(result.verdict.failure).toBeUndefined();
        expect(result.verdict.objectives.every((o) => o.met)).toBe(true);
        expect(result.verdict.passed).toBe(true);
        expect(result.ticks).toBeLessThanOrEqual(level.par.ticks);
        expect(medalFor(true, result.ticks, level.par.ticks)).toBe('gold');
      });
    }
  }
});

describe('World 3 — bonus objectives are reachable', () => {
  test('w3-01 pays its bonus on every seed', () => {
    for (const seed of w3_01.seeds) {
      const result = runReference(w3_01, seed, w3_01Solution);
      expect(bonusMet(w3_01, result)).toBe(true);
    }
  });

  test('w3-04 ships without staging on every seed', () => {
    for (const seed of w3_04.seeds) {
      const result = runReference(w3_04, seed, w3_04Solution);
      expect(bonusMet(w3_04, result)).toBe(true);
    }
  });

  // The three tick bonuses are pitched under par on purpose: the reference earns them on the
  // teaching seed and has to be improved on to earn them on the crowded ones.
  test('w3-02, w3-03 and w3-05 pay their tick bonus on seed 1', () => {
    expect(bonusMet(w3_02, runReference(w3_02, 1, w3_02Solution))).toBe(true);
    expect(bonusMet(w3_03, runReference(w3_03, 1, w3_03Solution))).toBe(true);
    expect(bonusMet(w3_05, runReference(w3_05, 1, w3_05Solution))).toBe(true);
  });
});

describe('World 3 — the starter alone passes nothing', () => {
  const starters: Record<string, (sim: Sim, botId: number) => void> = {
    'w3-01': (sim, botId) => {
      while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
    },
    'w3-02': (sim, botId) => {
      while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
      while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
    },
    'w3-03': (sim, botId) => {
      sim.move(botId, Dir.South);
    },
    'w3-04': (sim, botId) => {
      while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
      while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
    },
    'w3-05': (sim, botId) => {
      while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
      while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
    },
  };

  for (const level of WORLD_3_LEVELS) {
    test(`${level.id}`, () => {
      const drive = starters[level.id]!;
      for (const seed of level.seeds) {
        expect(runLevel(level, seed, drive, { source: level.starter }).verdict.passed).toBe(false);
      }
    });
  }
});

describe('w3-01 — one clamp', () => {
  test('collecting everything before delivering anything fails on every seed', () => {
    for (const seed of w3_01.seeds) {
      const result = runLevel(w3_01, seed, (sim, botId) => {
        const found = survey(sim, botId);
        for (const crate of found.crates) {
          goTo(sim, botId, crate.at);
          sim.pickup(sim.botIds()[0] ?? botId, 'crate', 1);
        }
        for (const pad of found.pads) {
          goTo(sim, botId, pad);
          sim.drop(botId, 'crate', 1);
        }
      });
      expect(result.verdict.passed).toBe(false);
      expect(result.trace.events.some((e) => e.kind === 'pickup' && !e.ok)).toBe(true);
    }
  });
});

describe('w3-02 — the mapping is the puzzle', () => {
  test('a baked-in class-to-depot map dies on another seed', () => {
    const learned = w3_02.build(1);
    const plan: { at: Vec; kind: ItemKind; depot: Vec }[] = [];
    const depots = new Map<string, Vec>();
    for (let y = 0; y < learned.h; y++) {
      for (let x = 0; x < learned.w; x++) {
        const mark = learned.tiles[y * learned.w + x]?.mark;
        if (mark) depots.set(mark, { x, y });
      }
    }
    for (const stack of learned.items) {
      const depot = depots.get(stack.kind);
      if (depot) plan.push({ at: stack.at, kind: stack.kind, depot });
    }

    const drive = (sim: Sim, botId: number): void => {
      for (const step of plan) {
        goTo(sim, botId, step.at);
        sim.pickup(botId, step.kind, 1);
        goTo(sim, botId, step.depot);
        sim.drop(botId, step.kind, 1);
      }
    };

    expect(runLevel(w3_02, 1, drive).verdict.passed).toBe(true);
    const elsewhere = w3_02.seeds
      .filter((seed) => seed !== 1)
      .map((seed) => runLevel(w3_02, seed, drive).verdict.passed);
    expect(elsewhere).not.toContain(true);
  });
});

describe('w3-03 — sensing is free, walking is not', () => {
  test('sweeping the whole yard is correct and costs more than twice par', () => {
    const drive = (sim: Sim, botId: number): void => {
      const counts = new Map<string, number>();
      const terminal: Vec[] = [];
      const note = (): void => {
        const tile = sim.scan(botId);
        if (tile.machineId) terminal.push(tile.at);
        for (const stack of tile.items) {
          counts.set(stack.kind, (counts.get(stack.kind) ?? 0) + stack.count);
        }
      };
      while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
      while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
      let along: Dir = Dir.East;
      for (;;) {
        note();
        while (sim.canMove(botId, along)) {
          sim.move(botId, along);
          note();
        }
        if (!sim.canMove(botId, Dir.South)) break;
        sim.move(botId, Dir.South);
        along = along === Dir.East ? Dir.West : Dir.East;
      }
      const order = ['crate', 'part', 'chip', 'cell', 'ore', 'stone', 'scrap', 'ice'];
      for (const kind of order) {
        const total = counts.get(kind) ?? 0;
        if (total > 0) sim.print(botId, `${kind} ${total}`);
      }
      const at = terminal[0];
      if (at) goTo(sim, botId, at);
      sim.use(botId);
    };

    for (const seed of w3_03.seeds) {
      const result = runLevel(w3_03, seed, drive);
      expect(result.verdict.passed).toBe(true);
      expect(result.ticks).toBeGreaterThan(w3_03.par.ticks * 2);
    }
  });
});

describe('w3-04 — arrival order, not proximity', () => {
  test('greedy nearest-crate-first fills the bay in the wrong order', () => {
    const drive = (sim: Sim, botId: number): void => {
      const found = survey(sim, botId);
      const bay = found.pads[0];
      if (!bay) return;
      const left = found.crates.map((crate) => crate.at);
      while (left.length > 0) {
        const next = nearestIndex(sim.pos(botId), left);
        const at = left.splice(next, 1)[0];
        if (!at) break;
        goTo(sim, botId, at);
        sim.pickup(botId, 'crate', 1);
        goTo(sim, botId, bay);
        sim.drop(botId, 'crate', 1);
      }
    };

    const verdicts = w3_04.seeds.map((seed) => runLevel(w3_04, seed, drive).verdict);
    const delivered = verdicts.map((v) => v.objectives.find((o) => o.id === 'bay-cleared')?.met);
    const ordered = verdicts.map((v) => v.objectives.find((o) => o.id === 'bay-in-order')?.met);
    expect(delivered).not.toContain(false);
    expect(ordered).toContain(false);
  });
});

describe('w3-05 — the rack has to be used', () => {
  test('one crate per trip passes the objective and blows par', () => {
    const drive = (sim: Sim, botId: number): void => {
      const found = survey(sim, botId);
      for (const crate of found.crates) {
        const depot = found.depots.get(crate.kind);
        if (!depot) continue;
        goTo(sim, botId, crate.at);
        sim.pickup(botId, crate.kind, 1);
        goTo(sim, botId, depot);
        sim.drop(botId, crate.kind, 1);
      }
    };

    const results = w3_05.seeds.map((seed) => runLevel(w3_05, seed, drive));
    expect(results.every((r) => r.verdict.passed)).toBe(true);
    expect(results.some((r) => r.ticks > w3_05.par.ticks)).toBe(true);
  });
});
