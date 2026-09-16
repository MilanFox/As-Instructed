import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, machineById, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { w7_02 } from '../w7-02.ts';

const WIDTH = 24;
const FIELD_WIDTH = 22;

function scored(seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w7_02, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const required = evaluateObjectives(w7_02.objectives, ctx);
  const stars = evaluateObjectives(w7_02.bonus ?? [], ctx);
  const tally = new Map<number, number>();
  for (const event of result.trace.events) {
    if (event.kind !== 'harvest' || !event.ok) continue;
    tally.set(event.botId, (tally.get(event.botId) ?? 0) + event.count);
  }
  const requisition = machineById(result.initialWorld, 'depot')?.vars['requisition'] ?? 1;
  const crops = result.initialWorld.tiles.filter((tile) => tile.crop !== undefined).length;
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    cleared: must(
      required.find((report) => report.id === 'field-cleared'),
      'field-cleared',
    ),
    star: must(
      stars.find((report) => report.id === 'even-share'),
      'even-share',
    ),
    requisition,
    crops,
    fairShare: Math.ceil(crops / Math.max(requisition, result.world.bots.length)),
    heaviest: Math.max(0, ...tally.values()),
  };
}

function scoredReference(seed: number) {
  const solution = SOLUTIONS[w7_02.id] as ReferenceSolution;
  return scored(seed, (sim, botId) => solution.run(sim, botId));
}

function readDepot(sim: Sim, botId: number): { fleet: number; crops: Vec[] } {
  const depot = sim.probe(botId, 'depot');
  if (!depot) return { fleet: 1, crops: [] };
  const total = depot.vars['crops'] ?? 0;
  const crops: Vec[] = [];
  for (let i = 0; i < total; i++) {
    const packed = depot.vars[`c${i}`] ?? 0;
    crops.push(vec(packed % WIDTH, Math.floor(packed / WIDTH)));
  }
  return { fleet: depot.vars['requisition'] ?? 1, crops };
}

function raiseFleet(sim: Sim, botId: number, fleet: number): number[] {
  const ids = [botId];
  let parent = botId;
  while (ids.length < fleet) {
    const child = sim.spawn(parent, Dir.East);
    if (child < 0) break;
    ids.push(child);
    parent = child;
  }
  return ids;
}

function walkTo(sim: Sim, id: number, target: Vec): void {
  for (let guard = 0; guard < 400; guard++) {
    const here = sim.pos(id);
    if (here.x === target.x && here.y === target.y) return;
    const wanted: Dir[] = [];
    if (here.y !== target.y) wanted.push(here.y < target.y ? Dir.South : Dir.North);
    if (here.x !== target.x) wanted.push(here.x < target.x ? Dir.East : Dir.West);
    const open = wanted.find((dir) => sim.canMove(id, dir));
    if (open === undefined) sim.wait(id, 1);
    else sim.move(id, open);
  }
}

function columnsOf(crops: readonly Vec[]): Vec[][] {
  const byX = new Map<number, Vec[]>();
  for (const crop of crops) {
    const bucket = byX.get(crop.x);
    if (bucket) bucket.push(crop);
    else byX.set(crop.x, [crop]);
  }
  return [...byX.keys()]
    .sort((a, b) => a - b)
    .map((x) => (byX.get(x) as Vec[]).slice().sort((a, b) => a.y - b.y));
}

const equalBands = (sim: Sim, botId: number): void => {
  const { fleet, crops } = readDepot(sim, botId);
  const ids = raiseFleet(sim, botId, fleet);
  const width = Math.ceil(FIELD_WIDTH / ids.length);
  ids.forEach((id, band) => {
    const mine = crops.filter(
      (crop) => crop.x - 1 >= band * width && crop.x - 1 < (band + 1) * width,
    );
    for (const crop of mine) {
      walkTo(sim, id, crop);
      sim.harvest(id);
    }
  });
};

const singleHanded = (sim: Sim, botId: number): void => {
  const { crops } = readDepot(sim, botId);
  for (const crop of crops) {
    walkTo(sim, botId, crop);
    sim.harvest(botId);
  }
};

const evenButWasteful = (sim: Sim, botId: number): void => {
  const { fleet, crops } = readDepot(sim, botId);
  const ids = raiseFleet(sim, botId, fleet);
  const columns = columnsOf(crops);
  const shares: Vec[][] = ids.map(() => []);
  let remaining = crops.length;
  let owner = 0;
  let held = 0;
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i] as Vec[];
    const botsLeft = ids.length - owner;
    const fair = Math.ceil((held + remaining) / botsLeft);
    const crowded = columns.length - i <= botsLeft - 1;
    if (owner < ids.length - 1 && held > 0 && (crowded || held >= fair)) {
      owner++;
      held = 0;
    }
    (shares[owner] as Vec[]).push(...column);
    held += column.length;
    remaining -= column.length;
  }
  ids.forEach((id, index) => {
    for (const crop of shares[index] as Vec[]) {
      walkTo(sim, id, crop);
      sim.harvest(id);
      for (const dir of [Dir.North, Dir.South]) {
        if (!sim.canMove(id, dir)) continue;
        sim.move(id, dir);
        walkTo(sim, id, crop);
        break;
      }
    }
  });
};

describe('w7-02 reference', () => {
  test('it clears the field and lands exactly on the fair share, on every seed', () => {
    const seen: Record<number, [number, number, number]> = {};
    for (const seed of w7_02.seeds) {
      const run = scoredReference(seed);
      seen[seed] = [run.crops, run.fairShare, run.heaviest];
      expect(run.cleared.met, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(true);
      expect(run.heaviest, `seed ${String(seed)}`).toBeLessThanOrEqual(run.fairShare);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w7_02.par.ticks);
    }

    expect(seen).toEqual({
      1: [32, 8, 8],
      2: [10, 5, 5],
      3: [44, 8, 8],
      4: [80, 10, 10],
    });
  });
});

describe('w7-02 even-share can fail on every seed', () => {
  test('no seed fields a requisition of one, so the cap always bites', () => {
    for (const seed of w7_02.seeds) {
      const run = scoredReference(seed);
      expect(run.requisition, `seed ${String(seed)}`).toBeGreaterThan(1);
      expect(run.fairShare, `seed ${String(seed)}`).toBeLessThan(run.crops);
    }
  });

  test('one bot doing the whole field clears it and misses the star everywhere', () => {
    const missedBy: Record<number, number> = {};
    for (const seed of w7_02.seeds) {
      const run = scored(seed, singleHanded);
      missedBy[seed] = run.heaviest - run.fairShare;
      expect(run.cleared.met, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
    }

    expect(missedBy).toEqual({ 1: 24, 2: 5, 3: 36, 4: 70 });
  });

  test('the single-handed run is told which bot went over, and by how much', () => {
    const run = scored(2, singleHanded);

    expect(run.star.divergence).toEqual({
      where: 'bot #0',
      expected: '5 crops or fewer',
      received: '10 crops',
    });
  });
});

describe('w7-02 even-share grades work, not area', () => {
  test('equal-area bands clear the field but miss the star wherever area and work differ', () => {
    const outcome: Record<number, boolean> = {};
    for (const seed of w7_02.seeds) {
      const run = scored(seed, equalBands);
      outcome[seed] = run.star.met;
      expect(run.cleared.met, `seed ${String(seed)}`).toBe(true);
    }

    expect(outcome).toEqual({ 1: false, 2: false, 3: true, 4: false });
  });

  test('seed 3 is the seed where an equal-area cut is also an equal-work cut', () => {
    const run = scored(3, equalBands);

    expect(run.heaviest).toBe(run.fairShare);
    expect(w7_02.board?.redrawn.join(' ')).toContain('equal-area cut is also an equal-work cut');
    expect(w7_02.hints.join(' ')).toContain('equal area and equal work are the same split');
  });
});

describe('w7-02 even-share is not a speed star', () => {
  test('a correctly split run that wastes moves still takes it on every seed', () => {
    for (const seed of w7_02.seeds) {
      const run = scored(seed, evenButWasteful);
      expect(run.cleared.met, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeGreaterThan(scoredReference(seed).ticks);
    }
  });
});

describe('w7-02 says what it rolls and what it grades', () => {
  test('board.redrawn names the fleet range the generator can actually produce', () => {
    const fleets = w7_02.seeds.map((seed) => scoredReference(seed).requisition);

    expect(Math.min(...fleets)).toBe(2);
    expect(Math.max(...fleets)).toBe(8);
    expect(w7_02.board?.redrawn.join(' ')).toContain('two to eight bots');
  });

  test('the brief stays vibe and the star has a reason in it', () => {
    const flat = w7_02.brief.replace(/\s+/g, ' ');
    const words = w7_02.brief.trim().split(/\s+/).filter(Boolean).length;

    expect(words).toBeLessThanOrEqual(47);
    expect(flat).toContain('Every unit earns its requisition. We do not itemise.');
    expect(flat).not.toMatch(/Math\.ceil|fair share/i);
  });

  test('the definition of a fair share lives in facts', () => {
    const fact = (w7_02.facts ?? []).find((each) => each.label === 'Fair share');

    expect(fact?.value).toMatch(/Math\.ceil/);
    expect(fact?.value).toMatch(/requisition/);
  });
});
