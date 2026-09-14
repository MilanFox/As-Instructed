import { describe, expect, test } from 'vitest';
import type { ItemKind, Objective, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import {
  Dir,
  Terrain,
  countItemsAt,
  evaluateObjectives,
  medalFor,
  tileAt,
} from '../../../engine/index.ts';
import type { LevelRunResult } from '../../harness.ts';
import { runLevel, runReference } from '../../harness.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { WORLD_3_LEVELS, w3_01, w3_02, w3_03 } from '../index.ts';
import { distance, goTo, key, nearestIndex, surveyYard } from '../__solutions__/driver.ts';
import { solution as w3_01Solution } from '../__solutions__/w3-01.ts';
import { solution as w3_02Solution } from '../__solutions__/w3-02.ts';
import { solution as w3_03Solution } from '../__solutions__/w3-03.ts';

const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w3-01': w3_01Solution,
  'w3-02': w3_02Solution,
  'w3-03': w3_03Solution,
};

const HARDWARE: Record<string, string[]> = {
  'w3-01': ['pickup', 'drop'],
  'w3-02': ['carrying'],
  'w3-03': [],
};

const bonusMet = (level: LevelDef, ctx: ObjectiveContext): boolean =>
  evaluateObjectives((level.bonus ?? []) as Objective[], ctx).every((entry) => entry.met);

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

const RACK_ROWS = [2, 3, 6, 7];
const AISLE_COLS = [1, 6, 11, 16];
const YARD_EAST = 16;
const YARD_SOUTH = 8;

interface Yard {
  bay: Vec | null;
  arrivals: Map<number, Vec>;
  stocked: Set<string>;
}

function readAround(sim: Sim, botId: number, found: Yard): void {
  const tiles = [
    sim.scan(botId),
    sim.scan(botId, Dir.North),
    sim.scan(botId, Dir.East),
    sim.scan(botId, Dir.South),
    sim.scan(botId, Dir.West),
  ];
  for (const tile of tiles) {
    if (!tile.inBounds) continue;
    if (tile.terrain === 'pad') found.bay = tile.at;
    const index = tile.mark === null ? Number.NaN : Number(tile.mark);
    if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {
      found.arrivals.set(index, tile.at);
      found.stocked.add(key(tile.at));
    }
  }
}

const treadCost = (found: Yard, at: Vec): number =>
  RACK_ROWS.includes(at.y) && !AISLE_COLS.includes(at.x) && !found.stocked.has(key(at)) ? 1 : 0;

function routeThroughAisles(found: Yard, from: Vec, to: Vec): Vec[] {
  const index = (at: Vec): number => at.y * (YARD_EAST + 2) + at.x;
  const cost = new Map<number, number>([[index(from), 0]]);
  const prev = new Map<number, Vec>();
  const open: Vec[] = [from];
  while (open.length > 0) {
    let pick = 0;
    for (let i = 1; i < open.length; i++) {
      const rival = cost.get(index(open[i] as Vec)) ?? 0;
      if (rival < (cost.get(index(open[pick] as Vec)) ?? 0)) pick = i;
    }
    const at = open.splice(pick, 1)[0] as Vec;
    const base = cost.get(index(at)) ?? 0;
    const steps = [
      { x: at.x, y: at.y - 1 },
      { x: at.x + 1, y: at.y },
      { x: at.x, y: at.y + 1 },
      { x: at.x - 1, y: at.y },
    ];
    for (const step of steps) {
      if (step.x < 1 || step.x > YARD_EAST || step.y < 1 || step.y > YARD_SOUTH) continue;
      const candidate = base + treadCost(found, step) * 1000 + 1;
      if (candidate < (cost.get(index(step)) ?? Number.POSITIVE_INFINITY)) {
        cost.set(index(step), candidate);
        prev.set(index(step), at);
        open.push(step);
      }
    }
  }
  const path: Vec[] = [];
  let at: Vec | undefined = to;
  while (at && !(at.x === from.x && at.y === from.y)) {
    path.push(at);
    at = prev.get(index(at));
  }
  return path.reverse();
}

function driveTo(sim: Sim, botId: number, found: Yard, to: Vec): void {
  for (const step of routeThroughAisles(found, sim.pos(botId), to)) {
    const at = sim.pos(botId);
    const dir =
      step.y < at.y ? Dir.North : step.x > at.x ? Dir.East : step.y > at.y ? Dir.South : Dir.West;
    sim.move(botId, dir);
    readAround(sim, botId, found);
  }
}

function walkAisle(sim: Sim, botId: number, found: Yard, y: number): void {
  const from = sim.pos(botId);
  driveTo(sim, botId, found, { x: from.x <= YARD_EAST / 2 ? 1 : YARD_EAST, y });
  const along = sim.pos(botId).x === 1 ? Dir.East : Dir.West;
  while (sim.canMove(botId, along)) {
    sim.move(botId, along);
    readAround(sim, botId, found);
  }
}

function shipInOrder(sim: Sim, botId: number, found: Yard): void {
  const bay = found.bay;
  if (!bay) return;
  for (const index of [...found.arrivals.keys()].sort((a, b) => a - b)) {
    const slot = found.arrivals.get(index);
    if (!slot) continue;
    driveTo(sim, botId, found, slot);
    sim.pickup(botId, 'crate', 1);
    driveTo(sim, botId, found, bay);
    sim.drop(botId, 'crate', 1);
  }
}

const aisleRound = (sim: Sim, botId: number): void => {
  const found: Yard = { bay: null, arrivals: new Map(), stocked: new Set() };
  readAround(sim, botId, found);
  const start = sim.pos(botId).y;
  const order = start === 1 ? [1, 4, 5, 8] : start === YARD_SOUTH ? [8, 5, 4, 1] : [4, 5, 8, 1];
  for (const y of order) walkAisle(sim, botId, found, y);
  shipInOrder(sim, botId, found);
};

const middleAislesOnly = (sim: Sim, botId: number): void => {
  const found: Yard = { bay: null, arrivals: new Map(), stocked: new Set() };
  readAround(sim, botId, found);
  for (const y of [4, 5]) walkAisle(sim, botId, found, y);
  shipInOrder(sim, botId, found);
};

const slotsTrodden = (result: LevelRunResult): number =>
  result.trace.events.filter(
    (event) =>
      event.kind === 'move' &&
      event.ok &&
      tileAt(result.initialWorld, event.to)?.terrain === Terrain.Rack &&
      countItemsAt(result.initialWorld, event.to, 'crate') === 0,
  ).length;

const oneClassAtATime = (sim: Sim, botId: number): void => {
  const found = survey(sim, botId);
  const remaining = [...new Set(found.crates.map((crate) => crate.kind))];
  while (remaining.length > 0) {
    const here = sim.pos(botId);
    const next = nearestIndex(
      here,
      remaining.map((kind) => found.depots.get(kind) ?? here),
    );
    const kind = remaining.splice(next < 0 ? 0 : next, 1)[0];
    const depot = kind === undefined ? undefined : found.depots.get(kind);
    if (kind === undefined || !depot) continue;
    const mine = found.crates.filter((crate) => crate.kind === kind).map((crate) => crate.at);
    while (mine.length > 0) {
      const at = mine.splice(nearestIndex(sim.pos(botId), mine), 1)[0];
      if (!at) break;
      goTo(sim, botId, at);
      sim.pickup(botId, kind, 1);
      goTo(sim, botId, depot);
      sim.drop(botId, kind, 1);
    }
  }
};

const nearestCrateFirst = (sim: Sim, botId: number): void => {
  const found = survey(sim, botId);
  const left = found.crates.slice();
  while (left.length > 0) {
    const pick = nearestIndex(
      sim.pos(botId),
      left.map((crate) => crate.at),
    );
    const crate = left.splice(pick, 1)[0];
    if (!crate) break;
    const depot = found.depots.get(crate.kind);
    if (!depot) continue;
    goTo(sim, botId, crate.at);
    sim.pickup(botId, crate.kind, 1);
    goTo(sim, botId, depot);
    sim.drop(botId, crate.kind, 1);
  }
};

const resurveyEveryTrip = (sim: Sim, botId: number): void => {
  for (;;) {
    const found = survey(sim, botId);
    const onPad = new Set(found.pads.map(key));
    const crate = found.crates.find((candidate) => !onPad.has(key(candidate.at)));
    const loaded = new Set(found.crates.map((candidate) => key(candidate.at)));
    const pad = found.pads.find((at) => !loaded.has(key(at)));
    if (!crate || !pad) return;
    goTo(sim, botId, crate.at);
    sim.pickup(botId, 'crate', 1);
    goTo(sim, botId, pad);
    sim.drop(botId, 'crate', 1);
  }
};

describe('World 3 — structure', () => {
  test('the world exports three levels in play order', () => {
    expect(WORLD_3_LEVELS).toEqual([w3_01, w3_02, w3_03]);
  });

  for (const level of WORLD_3_LEVELS) {
    describe(`${level.id} — ${level.title}`, () => {
      test('identity, seeds and par are well formed', () => {
        expect(level.id).toBe(`w3-0${level.index}`);
        expect(level.world).toBe(3);
        expect(level.index).toBeGreaterThanOrEqual(WORLD_3_LEVELS.indexOf(level) + 1);
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

describe('w3-02 — one depot at a time', () => {
  test('working the yard one class at a time earns the star on every seed', () => {
    for (const seed of w3_02.seeds) {
      const result = runLevel(w3_02, seed, oneClassAtATime);
      expect(result.verdict.passed).toBe(true);
      expect(bonusMet(w3_02, result)).toBe(true);
      expect(result.ticks).toBeLessThanOrEqual(w3_02.par.ticks);
    }
  });

  test('taking the nearest crate every time is correct and misses the star on every seed', () => {
    for (const seed of w3_02.seeds) {
      const result = runLevel(w3_02, seed, nearestCrateFirst);
      expect(result.verdict.passed).toBe(true);
      expect(bonusMet(w3_02, result)).toBe(false);
    }
  });

  test('the reference delivers in the order it found the crates and misses the star', () => {
    for (const seed of w3_02.seeds) {
      expect(bonusMet(w3_02, runReference(w3_02, seed, w3_02Solution))).toBe(false);
    }
  });
});

describe('w3-03 — read the racks from the aisle', () => {
  test('an aisle round ships the yard treading no empty slot on every seed', () => {
    for (const seed of w3_03.seeds) {
      const result = runLevel(w3_03, seed, aisleRound);
      expect(result.verdict.passed).toBe(true);
      expect(slotsTrodden(result)).toBe(0);
      expect(bonusMet(w3_03, result)).toBe(true);
    }
  });

  test('the rack-walking survey ships the yard and treads empty slots on every seed', () => {
    for (const seed of w3_03.seeds) {
      const result = runReference(w3_03, seed, w3_03Solution);
      expect(result.verdict.passed).toBe(true);
      expect(slotsTrodden(result)).toBeGreaterThan(0);
      expect(bonusMet(w3_03, result)).toBe(false);
    }
  });

  test('never reaching the outer aisles treads no slot and cannot ship the yard', () => {
    for (const seed of [1, 2, 3]) {
      const result = runLevel(w3_03, seed, middleAislesOnly);
      expect(slotsTrodden(result)).toBe(0);
      expect(result.verdict.passed).toBe(false);
    }
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
      while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
      while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
    },
  };

  for (const level of WORLD_3_LEVELS) {
    test(`${level.id}`, () => {
      const drive = starters[level.id]!;
      for (const seed of level.seeds) {
        expect(runLevel(level, seed, drive).verdict.passed).toBe(false);
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
          sim.pickup(botId, 'crate', 1);
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

  test('the reference finishes inside par and files the shift report', () => {
    for (const seed of w3_01.seeds) {
      expect(bonusMet(w3_01, runReference(w3_01, seed, w3_01Solution))).toBe(true);
    }
  });

  test('the star names no meter and offers no bar to point at the wrong one', () => {
    const star = (w3_01.bonus ?? [])[0] as Objective;
    expect(star.progress).toBeUndefined();
    for (const word of ['tick', 'op', 'pickup', 'drop', 'scan', 'move']) {
      expect(star.label.toLowerCase()).not.toContain(word);
    }
  });

  test('a round that re-surveys before every trip is correct and misses the star', () => {
    for (const seed of w3_01.seeds) {
      const result = runLevel(w3_01, seed, resurveyEveryTrip);
      expect(result.verdict.passed).toBe(true);
      expect(result.trace.events.some((e) => e.kind === 'pickup' && !e.ok)).toBe(false);
      expect(result.ticks).toBeGreaterThan(w3_01.par.ticks);
      expect(bonusMet(w3_01, result)).toBe(false);
    }
  });

  test('greedy pairing is within two ticks of the best pairing on every declared seed', () => {
    const permutations = (items: Vec[]): Vec[][] => {
      if (items.length <= 1) return [items];
      const out: Vec[][] = [];
      for (let i = 0; i < items.length; i++) {
        const rest = items.slice(0, i).concat(items.slice(i + 1));
        for (const tail of permutations(rest)) out.push([items[i] as Vec, ...tail]);
      }
      return out;
    };
    const roundCost = (start: Vec, order: Vec[], pads: Vec[]): number => {
      let at = start;
      let total = 0;
      for (let i = 0; i < order.length; i++) {
        const crate = order[i] as Vec;
        const pad = pads[i] as Vec;
        total += distance(at, crate) + 1 + distance(crate, pad) + 1;
        at = pad;
      }
      return total;
    };

    for (const seed of w3_01.seeds) {
      const world = w3_01.build(seed);
      const crates = world.items.map((stack) => stack.at);
      const pads: Vec[] = [];
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          if (world.tiles[y * world.w + x]?.terrain === 'pad') pads.push({ x, y });
        }
      }
      const start = (world.bots[0] as { at: Vec }).at;

      let best = Number.POSITIVE_INFINITY;
      for (const order of permutations(crates)) {
        for (const assignment of permutations(pads)) {
          best = Math.min(best, roundCost(start, order, assignment));
        }
      }

      const leftCrates = crates.slice();
      const leftPads = pads.slice();
      let at = start;
      let greedy = 0;
      while (leftCrates.length > 0) {
        const crate = leftCrates.splice(nearestIndex(at, leftCrates), 1)[0] as Vec;
        const pad = leftPads.splice(nearestIndex(crate, leftPads), 1)[0] as Vec;
        greedy += distance(at, crate) + 1 + distance(crate, pad) + 1;
        at = pad;
      }

      expect(greedy - best).toBeLessThanOrEqual(2);
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

describe('w3-03 — arrival order, not proximity', () => {
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

    const verdicts = w3_03.seeds.map((seed) => runLevel(w3_03, seed, drive).verdict);
    const delivered = verdicts.map((v) => v.objectives.find((o) => o.id === 'bay-cleared')?.met);
    const ordered = verdicts.map((v) => v.objectives.find((o) => o.id === 'bay-in-order')?.met);
    expect(delivered).not.toContain(false);
    expect(ordered).toContain(false);
  });

  test('shipping in rack-sweep order is refused on the first crate onto the bay', () => {
    const drive = (sim: Sim, botId: number): void => {
      const found = survey(sim, botId);
      const bay = found.pads[0];
      if (!bay) return;
      const swept = found.crates.map((crate) => crate.at).sort((a, b) => a.y - b.y || a.x - b.x);
      for (const slot of swept) {
        goTo(sim, botId, slot);
        sim.pickup(botId, 'crate', 1);
        goTo(sim, botId, bay);
        sim.drop(botId, 'crate', 1);
      }
    };

    for (const seed of w3_03.seeds) {
      const crates = w3_03.build(seed).items.reduce((sum, stack) => sum + stack.count, 0);
      const verdict = runLevel(w3_03, seed, drive).verdict;
      const order = verdict.objectives.find((entry) => entry.id === 'bay-in-order');
      expect(verdict.objectives.find((entry) => entry.id === 'bay-cleared')?.met).toBe(true);
      if (crates === 1) {
        expect(order?.met, `seed ${String(seed)}`).toBe(true);
        continue;
      }
      expect(order?.met, `seed ${String(seed)}`).toBe(false);
      expect(order?.progress?.[0], `seed ${String(seed)}`).toBe(0);
    }
  });
});
