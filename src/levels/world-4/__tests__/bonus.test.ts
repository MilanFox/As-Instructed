import { describe, expect, test } from 'vitest';
import type { Dir, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import {
  ALL_DIRS,
  ItemKind,
  Terrain,
  dirBetween,
  evaluateObjectives,
  opposite,
  step,
} from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w4_01 } from '../w4-01.ts';
import { w4_02 } from '../w4-02.ts';
import { w4_04 } from '../w4-04.ts';

function markedVisited(sim: Sim, botId: number): void {
  const back: Dir[] = [];
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    if (sim.readMark(botId) === null) sim.mark(botId, 'v');
    const onward = ALL_DIRS.find((dir) => {
      const view = sim.look(botId, dir, 1)[0];
      return view?.walkable === true && view.mark === null;
    });
    if (onward !== undefined) {
      sim.move(botId, onward);
      back.push(opposite(onward));
      continue;
    }
    const home = back.pop();
    if (home === undefined) return;
    sim.move(botId, home);
  }
}

function rememberedVisited(sim: Sim, botId: number): void {
  const seen = new Set<string>();
  const back: Dir[] = [];
  const key = (): string => {
    const at = sim.pos(botId);
    return `${String(at.x)},${String(at.y)}`;
  };
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    seen.add(key());
    const onward = ALL_DIRS.find((dir) => {
      const view = sim.look(botId, dir, 1)[0];
      return view?.walkable === true && !seen.has(`${String(view.at.x)},${String(view.at.y)}`);
    });
    if (onward !== undefined) {
      sim.move(botId, onward);
      back.push(opposite(onward));
      continue;
    }
    const home = back.pop();
    if (home === undefined) return;
    sim.move(botId, home);
  }
}

function keyAt(at: Vec): string {
  return `${String(at.x)},${String(at.y)}`;
}

function walkKnown(sim: Sim, botId: number, to: Vec, walkable: Map<string, boolean>): void {
  const from = sim.pos(botId);
  if (keyAt(from) === keyAt(to)) return;
  const previous = new Map<string, { at: Vec; dir: Dir }>();
  const seen = new Set<string>([keyAt(from)]);
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    if (keyAt(at) === keyAt(to)) break;
    for (const dir of ALL_DIRS) {
      const next = step(at, dir);
      if (seen.has(keyAt(next)) || walkable.get(keyAt(next)) !== true) continue;
      seen.add(keyAt(next));
      previous.set(keyAt(next), { at, dir });
      queue.push(next);
    }
  }
  const route: Dir[] = [];
  let cursor = keyAt(to);
  while (cursor !== keyAt(from)) {
    const back = previous.get(cursor);
    if (back === undefined) return;
    route.push(back.dir);
    cursor = keyAt(back.at);
  }
  for (const dir of route.reverse()) sim.move(botId, dir);
}

function floodFilled(sim: Sim, botId: number): void {
  const walkable = new Map<string, boolean>();
  const start = sim.pos(botId);
  walkable.set(keyAt(start), true);
  const queued = new Set<string>([keyAt(start)]);
  const queue: Vec[] = [start];
  while (queue.length > 0) {
    const next = queue.pop() as Vec;
    walkKnown(sim, botId, next, walkable);
    if (sim.scan(botId).terrain === Terrain.Pad) return;
    walkable.set(keyAt(sim.pos(botId)), true);
    for (const dir of ALL_DIRS) {
      const view = sim.scan(botId, dir);
      walkable.set(keyAt(view.at), view.walkable);
      if (view.walkable && !queued.has(keyAt(view.at))) {
        queued.add(keyAt(view.at));
        queue.push(view.at);
      }
    }
  }
}

function movedBlind(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  for (;;) {
    let moved = false;
    for (const dir of ALL_DIRS) {
      if (dir === back || !sim.move(botId, dir)) continue;
      back = opposite(dir);
      moved = true;
      break;
    }
    if (!moved) return;
  }
}

function scannedAhead(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    const next = ALL_DIRS.find((dir) => dir !== back && sim.scan(botId, dir).walkable);
    if (next === undefined) return;
    sim.move(botId, next);
    back = opposite(next);
  }
}

function feltAhead(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    const next = ALL_DIRS.find(
      (dir) => dir !== back && sim.look(botId, dir, 1)[0]?.walkable === true,
    );
    if (next === undefined) return;
    sim.move(botId, next);
    back = opposite(next);
  }
}

function scored(level: LevelDef, seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(level, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives([...level.objectives, ...(level.bonus ?? [])], ctx);
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    const stars = evaluateObjectives(level.bonus ?? [], {
      world: result.world,
      initialWorld: result.initialWorld,
      trace: result.trace,
      ops: result.ops,
    });
    expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
    expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(level.par.ticks);
    expect(
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
      `seed ${String(seed)}`,
    ).toBe(true);
  }
}

const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, '.');
};

describe('w4-01 reading and step allowances', () => {
  test('the reference solution earns the star on every seed', () => {
    referenceEarns(w4_01, 'tight-reading-bound');
  });

  test('feeling one tile ahead reaches the pad and overruns the reading allowance', () => {
    for (const seed of w4_01.seeds) {
      const lazy = scored(w4_01, seed, feltAhead);
      const solution = SOLUTIONS[w4_01.id] as ReferenceSolution;
      const good = runReference(w4_01, seed, solution);

      expect(lazy.ticks, `seed ${String(seed)}`).toBe(good.ticks);
      expect(lazy.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(lazy.met('tight-reading-bound'), `seed ${String(seed)}`).toBe(false);
      if (seed !== 46) expect(lazy.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('stepping tile by tile on scan alone fails the reading allowance', () => {
    for (const seed of w4_01.seeds) {
      const lazy = scored(w4_01, seed, scannedAhead);

      expect(lazy.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(lazy.met('reading-allowance'), `seed ${String(seed)}`).toBe(false);
      expect(lazy.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('finding the tunnel by bumping into it fails the step allowance', () => {
    for (const seed of w4_01.seeds) {
      const blind = scored(w4_01, seed, movedBlind);

      expect(blind.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(blind.met('reading-allowance'), `seed ${String(seed)}`).toBe(true);
      expect(blind.met('no-wasted-steps'), `seed ${String(seed)}`).toBe(false);
      expect(blind.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('flood-filling the tunnel a tile at a time fails the reading allowance', () => {
    for (const seed of w4_01.seeds) {
      const mapped = scored(w4_01, seed, floodFilled);
      const solution = SOLUTIONS[w4_01.id] as ReferenceSolution;
      const good = runReference(w4_01, seed, solution);

      expect(mapped.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(mapped.ticks, `seed ${String(seed)}`).toBe(good.ticks);
      expect(mapped.met('no-wasted-steps'), `seed ${String(seed)}`).toBe(true);
      expect(mapped.met('reading-allowance'), `seed ${String(seed)}`).toBe(false);
      expect(mapped.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_01.seeds) {
      const run = scored(w4_01, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('tight-reading-bound'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w4-02 breadcrumb-trail', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_02, 'breadcrumb-trail');
  });

  test('a run that places no marks at all reaches the vein and is refused', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, rememberedVisited);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w4_02.par.ticks);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('marking every tile "somebody was here" is correct and is refused', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, markedVisited);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the bare visited flag is quoted back to the run that wrote it', () => {
    const result = runLevel(w4_02, 1, markedVisited);
    const star = must(
      evaluateObjectives(w4_02.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      })[0],
      'the star',
    );
    const shown = must(star.divergence, 'a divergence');
    expect(shown.where).toMatch(/^\(\d+, \d+\)$/);
    expect(shown.expected).toBe('the tile the bot arrived from');
    expect(shown.received).toBe('v');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

interface Habit {
  chaseDeep: boolean;
  readAhead: boolean;
}

const QUOTA = 5;
const CUT = 2;
const OVER = 12;

const around = (at: Vec): Vec[] => ALL_DIRS.map((dir) => step(at, dir));
const rock = (at: Vec): boolean => at.x % 2 === 0 && at.y % 2 === 0;
const parseAt = (id: string): Vec => {
  const [x = '0', y = '0'] = id.split(',');
  return { x: Number(x), y: Number(y) };
};

function prospecting(habit: Habit) {
  return (sim: Sim, botId: number): void => {
    const home = sim.pos(botId);
    const deepest = (sim.fuel(botId) - CUT - OVER) / 2;
    const ground = new Map<string, Terrain>();
    const open = new Map<string, boolean>();
    const stood = new Set<string>([keyAt(home)]);
    const cut = new Set<string>();
    let mined = 0;
    let deepCut = !habit.chaseDeep;

    const observe = (): void => {
      const at = sim.pos(botId);
      open.set(keyAt(at), true);
      stood.add(keyAt(at));
      for (const dir of ALL_DIRS) {
        for (const view of sim.look(botId, dir)) {
          if (!view.inBounds) break;
          ground.set(keyAt(view.at), view.terrain);
          open.set(keyAt(view.at), view.walkable);
        }
      }
    };

    const isOpen = (at: Vec): boolean => open.get(keyAt(at)) === true;
    const isDry = (at: Vec): boolean =>
      habit.readAhead && around(at).some((side) => ground.get(keyAt(side)) === Terrain.Rubble);
    const worthSeeing = (at: Vec): boolean =>
      habit.readAhead
        ? around(at).some((side) => !open.has(keyAt(side)) && !rock(side))
        : !stood.has(keyAt(at));

    const flood = (from: Vec): { cost: Map<string, number>; via: Map<string, Vec> } => {
      const cost = new Map<string, number>([[keyAt(from), 0]]);
      const via = new Map<string, Vec>();
      const queue: Vec[] = [from];
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as Vec;
        const base = cost.get(keyAt(at)) ?? 0;
        for (const next of around(at)) {
          if (!isOpen(next) || isDry(next) || cost.has(keyAt(next))) continue;
          cost.set(keyAt(next), base + 1);
          via.set(keyAt(next), at);
          queue.push(next);
        }
      }
      return { cost, via };
    };

    const trail = (via: Map<string, Vec>, from: Vec, to: Vec): Vec[] => {
      const route: Vec[] = [];
      let at = to;
      while (keyAt(at) !== keyAt(from)) {
        route.push(at);
        const back = via.get(keyAt(at));
        if (back === undefined) return [];
        at = back;
      }
      return route.reverse();
    };

    const drive = (route: readonly Vec[]): void => {
      for (const next of route) {
        const dir = dirBetween(sim.pos(botId), next);
        if (dir === null || !sim.move(botId, dir)) return;
        observe();
      }
    };

    observe();
    for (let round = 0; round < 4000; round++) {
      const here = flood(sim.pos(botId));
      const homeward = flood(home).cost;
      const fuel = sim.fuel(botId);
      const done = mined >= QUOTA && deepCut;

      let face: { stand: Vec; at: Vec; out: number; deep: boolean } | null = null;
      for (const [id, terrain] of ground) {
        if (done || terrain !== Terrain.Ore || cut.has(id)) continue;
        const at = parseAt(id);
        const stand = around(at).find((side) => isOpen(side));
        if (stand === undefined) continue;
        const out = here.cost.get(keyAt(stand));
        const legs = homeward.get(keyAt(stand));
        if (out === undefined || legs === undefined) continue;
        const deep = habit.chaseDeep && legs >= deepest;
        if (mined >= QUOTA && !deep) continue;
        if (out + CUT + legs > fuel) continue;
        if (face === null || out < face.out) face = { stand, at, out, deep };
      }

      let goal: Vec | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const [id, out] of here.cost) {
        if (done) continue;
        const legs = homeward.get(id);
        if (legs === undefined || legs > deepest) continue;
        const tile = parseAt(id);
        if (!worthSeeing(tile)) continue;
        if (out + legs + CUT > fuel) continue;
        const rank = habit.chaseDeep ? out - legs : out;
        if (rank < best) {
          best = rank;
          goal = tile;
        }
      }

      if (face !== null && (habit.readAhead || goal === null)) {
        drive(trail(here.via, sim.pos(botId), face.stand));
        const dir = dirBetween(sim.pos(botId), face.at);
        if (dir !== null && sim.mine(botId, dir) === ItemKind.Ore) {
          mined += 1;
          if (face.deep) deepCut = true;
        }
        cut.add(keyAt(face.at));
        observe();
        continue;
      }
      if (goal !== null) {
        drive(trail(here.via, sim.pos(botId), goal));
        continue;
      }
      if (keyAt(sim.pos(botId)) !== keyAt(home)) {
        drive(trail(here.via, sim.pos(botId), home));
        continue;
      }
      if (done || !sim.refuel(botId) || sim.fuel(botId) <= fuel) break;
    }
  };
}

function starOf(seed: number, id: string, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w4_04, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: result.trace,
    ops: result.ops,
  };
  return must(
    evaluateObjectives(w4_04.bonus ?? [], ctx).find((star) => star.id === id),
    id,
  );
}

describe('w4-04 deep-face', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_04, 'deep-face');
  });

  test('taking the whole quota off the near faces is correct and is refused', () => {
    for (const seed of w4_04.seeds) {
      const run = scored(w4_04, seed, prospecting({ chaseDeep: false, readAhead: true }));

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w4_04.par.ticks);
      expect(run.met('no-dry-holes'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('deep-face'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the face the run stopped short at is quoted against the one it wanted', () => {
    for (const seed of w4_04.seeds) {
      const star = starOf(seed, 'deep-face', prospecting({ chaseDeep: false, readAhead: true }));
      const shown = must(star.divergence, 'a divergence');

      expect(shown.where, `seed ${String(seed)}`).toBe('the deepest face');
      expect(shown.expected, `seed ${String(seed)}`).toMatch(/^\d+ tiles from the lift$/);
      expect(shown.received, `seed ${String(seed)}`).toMatch(/^\d+ tiles from the lift$/);
      expect(shown.received, `seed ${String(seed)}`).not.toBe(shown.expected);
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_04.seeds) {
      const run = scored(w4_04, seed, idle);
      const star = starOf(seed, 'deep-face', idle);

      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('deep-face'), `seed ${String(seed)}`).toBe(false);
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('no face was cut');
    }
  });
});

describe('w4-04 no-dry-holes', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_04, 'no-dry-holes');
  });

  test('walking each side passage instead of reading it fills the quota and is refused', () => {
    for (const seed of w4_04.seeds) {
      const run = scored(w4_04, seed, prospecting({ chaseDeep: false, readAhead: false }));

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-dry-holes'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the empty passage is quoted back with the tile the bot stood on', () => {
    for (const seed of w4_04.seeds) {
      const star = starOf(seed, 'no-dry-holes', prospecting({ chaseDeep: false, readAhead: false }));
      const shown = must(star.divergence, 'a divergence');

      expect(shown.where, `seed ${String(seed)}`).toMatch(/^\(\d+, \d+\)$/);
      expect(shown.expected, `seed ${String(seed)}`).toBe('a face at the blind end');
      expect(shown.received, `seed ${String(seed)}`).toBe('spoil');
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_04.seeds) {
      const run = scored(w4_04, seed, idle);
      const star = starOf(seed, 'no-dry-holes', idle);

      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('no-dry-holes'), `seed ${String(seed)}`).toBe(false);
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('0 ore');
    }
  });
});
