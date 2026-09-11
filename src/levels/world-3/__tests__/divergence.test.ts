import { describe, expect, test } from 'vitest';
import type { DropEvent, ItemKind, MoveEvent, Objective, Sim, Vec } from '../../../engine/index.ts';
import { Terrain, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { goTo } from '../__solutions__/driver.ts';
import { at } from '../objectives.ts';
import { key, stencilledDepots } from '../yard.ts';
import { w3_01 } from '../w3-01.ts';
import { w3_02 } from '../w3-02.ts';
import { w3_04 } from '../w3-04.ts';

const RACK_ROWS = [2, 3, 6, 7];

function diverge(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, bot: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const pool: Objective[] = [...level.objectives, ...(level.bonus ?? [])];
  const objective = must(
    pool.find((each) => each.id === id),
    id,
  );
  const ctx = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return { met: objective.evaluate(ctx), divergence: objective.divergence?.(ctx), result };
}

const padsOf = (level: LevelDef, seed: number): Vec[] => {
  const world = level.build(seed);
  const out: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.tiles[y * world.w + x]?.terrain === Terrain.Pad) out.push(vec(x, y));
    }
  }
  return out;
};

describe('w3-01 — the pad the shift walked past', () => {
  test('pads-loaded names the first pad left bare', () => {
    const first = must(padsOf(w3_01, 1)[0], 'a pad');
    const { met, divergence } = diverge(w3_01, 1, 'pads-loaded', () => undefined);
    expect(met).toBe(false);
    expect(divergence).toEqual({ where: at(first), expected: 'a crate', received: '(nothing)' });
  });

  test('straight-runs says a report was wanted when none was filed', () => {
    const { met, divergence } = diverge(w3_01, 1, 'straight-runs', (sim, botId) => {
      sim.wait(botId, 1);
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the shift report',
      expected: 'a line saying how many pairs share a row',
      received: '(nothing)',
    });
  });

  test('a wrong figure comes back as the run’s own line, never as the answer', () => {
    const { met, divergence } = diverge(w3_01, 1, 'straight-runs', (sim, botId) => {
      sim.print(botId, 'straight 0');
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown).toEqual({
      where: 'the shift report',
      expected: 'a different figure',
      received: 'straight 0',
    });
    expect(shown.expected).not.toMatch(/\d/);
  });

  test('filing every candidate instead of one answer is refused', () => {
    const { met, divergence } = diverge(w3_01, 1, 'straight-runs', (sim, botId) => {
      for (let n = 0; n <= 6; n++) sim.print(botId, `straight ${String(n)}`);
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the shift report',
      expected: 'one line about the shift',
      received: '7 of them',
    });
  });
});

describe('w3-02 — the depot that ended short', () => {
  test('crates-sorted names the depot by tile, and never by class', () => {
    const world = w3_02.build(1);
    const depot = must(stencilledDepots(world)[0], 'a depot');
    const owed = world.items.reduce(
      (sum, stack) => (stack.kind === depot.kind ? sum + stack.count : sum),
      0,
    );
    const { met, divergence } = diverge(w3_02, 1, 'crates-sorted', () => undefined);
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown).toEqual({
      where: `the depot at ${at(depot.at)}`,
      expected: `${owed === 1 ? '1 crate' : `${String(owed)} crates`} of its class`,
      received: '0 crates of its class',
    });
    expect(shown.where).not.toContain(depot.kind);
  });

  test('one-depot-at-a-time names the drop that came back, and when the pad was left', () => {
    const world = w3_02.build(1);
    const counts = new Map<ItemKind, number>();
    for (const stack of world.items) {
      counts.set(stack.kind, (counts.get(stack.kind) ?? 0) + stack.count);
    }
    const repeated = must(
      [...counts.entries()].find(([, n]) => n >= 2),
      'a class with two crates',
    )[0];
    const depots = new Map(stencilledDepots(world).map((depot) => [depot.kind, depot.at]));
    const stackAt = (kind: ItemKind, nth: number): Vec =>
      must(world.items.filter((stack) => stack.kind === kind)[nth], `${kind} #${String(nth)}`).at;
    const leg = (kind: ItemKind, nth: number): { from: Vec; to: Vec; kind: ItemKind } => ({
      from: stackAt(kind, nth),
      to: must(depots.get(kind), `the ${kind} depot`),
      kind,
    });

    const plan = [
      leg(repeated, 0),
      ...[...counts.keys()].filter((kind) => kind !== repeated).map((kind) => leg(kind, 0)),
      leg(repeated, 1),
    ];

    const { met, divergence, result } = diverge(w3_02, 1, 'one-depot-at-a-time', (sim, botId) => {
      for (const step of plan) {
        goTo(sim, botId, step.from);
        sim.pickup(botId, step.kind, 1);
        goTo(sim, botId, step.to);
        sim.drop(botId, step.kind, 1);
      }
    });

    const drops = result.trace.events.filter(
      (event): event is DropEvent => event.kind === 'drop' && event.ok,
    );
    const left = must(drops[0], 'the first drop');
    const back = must(drops[plan.length - 1], 'the drop that came back');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick ${String(back.t)} · ${at(back.at)}`,
      expected: 'a depot not used yet',
      received: `last used at tick ${String(left.t)}, then left`,
    });
  });
});

describe('w3-04 — the crate, the place in the stack and the step', () => {
  const arrivalsOf = (seed: number): { index: number; at: Vec }[] => {
    const world = w3_04.build(seed);
    const out: { index: number; at: Vec }[] = [];
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const mark = world.tiles[y * world.w + x]?.mark;
        const index = mark === undefined ? Number.NaN : Number(mark);
        if (Number.isInteger(index)) out.push({ index, at: vec(x, y) });
      }
    }
    return out.sort((a, b) => a.index - b.index);
  };

  const bayOf = (seed: number): Vec => must(padsOf(w3_04, seed)[0], 'the bay');

  test('bay-cleared names the lowest arrival still standing in the yard', () => {
    const first = must(arrivalsOf(1)[0], 'arrival 1');
    const { met, divergence } = diverge(w3_04, 1, 'bay-cleared', () => undefined);
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `arrival ${String(first.index)}, from ${at(first.at)}`,
      expected: 'on the outbound bay',
      received: 'still in the yard',
    });
  });

  test('bay-in-order names the place in the stack and both arrival numbers', () => {
    const arrivals = arrivalsOf(1);
    const bay = bayOf(1);
    const second = must(arrivals[1], 'arrival 2');
    const first = must(arrivals[0], 'arrival 1');
    const { met, divergence } = diverge(w3_04, 1, 'bay-in-order', (sim, botId) => {
      for (const crate of [second, first]) {
        goTo(sim, botId, crate.at);
        sim.pickup(botId, 'crate', 1);
        goTo(sim, botId, bay);
        sim.drop(botId, 'crate', 1);
      }
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: '1st crate onto the bay',
      expected: 'arrival 1',
      received: 'arrival 2',
    });
  });

  test('a bay the run never reached is told so rather than given a number', () => {
    const { divergence } = diverge(w3_04, 1, 'bay-in-order', () => undefined);
    expect(must(divergence, 'a divergence').received).toBe('(nothing)');
  });

  test('aisle-discipline names the step that spent the allowance', () => {
    const world = w3_04.build(1);
    const vacant = new Set<string>();
    for (const y of RACK_ROWS) {
      for (let x = 1; x < world.w - 1; x++) {
        const tile = world.tiles[y * world.w + x];
        if (!world.items.some((stack) => stack.at.x === x && stack.at.y === y) && tile) {
          vacant.add(key(vec(x, y)));
        }
      }
    }

    const { met, divergence, result } = diverge(w3_04, 1, 'aisle-discipline', (sim, botId) => {
      goTo(sim, botId, vec(1, 2));
      goTo(sim, botId, vec(16, 2));
      goTo(sim, botId, vec(16, 3));
      goTo(sim, botId, vec(1, 3));
    });

    const steps = result.trace.events.filter(
      (event): event is MoveEvent => event.kind === 'move' && event.ok && vacant.has(key(event.to)),
    );
    expect(steps.length).toBeGreaterThan(18);
    const breaking = must(steps[18], 'the nineteenth empty slot');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick ${String(breaking.t)} · ${at(breaking.to)}`,
      expected: '18 empty slots at most',
      received: `the 19th, of ${String(steps.length)} in the run`,
    });
  });
});
