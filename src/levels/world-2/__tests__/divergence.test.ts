import { describe, expect, test } from 'vitest';
import type { Objective, Sim, Vec, World } from '../../../engine/index.ts';
import { DIVERGENCE_VALUE_CHARS, Dir, ItemKind, maturity, tileAt } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { WORLD_2_LEVELS } from '../index.ts';
import { w2_01 } from '../w2-01.ts';
import { w2_02 } from '../w2-02.ts';
import { w2_03 } from '../w2-03.ts';
import { at, ripeAtStart, soilTiles } from '../shared.ts';

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

function goTo(sim: Sim, botId: number, to: Vec): void {
  while (sim.pos(botId).x < to.x) sim.move(botId, Dir.East);
  while (sim.pos(botId).x > to.x) sim.move(botId, Dir.West);
  while (sim.pos(botId).y < to.y) sim.move(botId, Dir.South);
  while (sim.pos(botId).y > to.y) sim.move(botId, Dir.North);
}

function sweep(sim: Sim, botId: number, act: (sim: Sim, botId: number) => void): void {
  while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
  while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
  let dir: Dir = Dir.East;
  for (;;) {
    act(sim, botId);
    if (sim.canMove(botId, dir)) {
      sim.move(botId, dir);
      continue;
    }
    if (!sim.canMove(botId, Dir.South)) return;
    sim.move(botId, Dir.South);
    dir = dir === Dir.East ? Dir.West : Dir.East;
  }
}

function ripeOf(world: World, kind: ItemKind): Vec[] {
  return soilTiles(world).filter((tile) => {
    const here = tileAt(world, tile);
    if (!here || here.crop !== kind || here.maxGrowth === undefined) return false;
    return maturity(here, 0) >= here.maxGrowth;
  });
}

describe('w2-01 names the tile, and says whether the arm ever came down on it', () => {
  test('harvested-ripe names a ready crop the run never swung at', () => {
    const first = must(ripeAtStart(w2_01.build(1))[0], 'a ripe crop');
    const { met, divergence } = diverge(w2_01, 1, 'harvested-ripe', () => undefined);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: at(first),
      expected: 'harvested',
      received: 'never harvested',
    });
  });

  test('all-planted reports the plant swing that came before the harvest', () => {
    const first = must(ripeAtStart(w2_01.build(1))[0], 'a ripe crop');
    const { met, divergence } = diverge(w2_01, 1, 'all-planted', (sim, botId) => {
      sweep(sim, botId, (each, bot) => {
        each.plant(bot);
        each.harvest(bot);
      });
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: at(first),
      expected: 'planted',
      received: '1 try, nothing sown',
    });
  });

  test('no-wasted-fieldwork names the first wasted swing and how many followed it', () => {
    const { met, divergence } = diverge(w2_01, 1, 'no-wasted-fieldwork', (sim, botId) => {
      sim.harvest(botId);
      sim.plant(botId);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick 0 · ${at({ x: 1, y: 1 })}`,
      expected: 'a harvest or plant that works',
      received: 'harvest took nothing, 2 wasted in all',
    });
  });
});

describe('w2-02 separates a swing that found nothing from a tile nobody visited', () => {
  test('harvested-crops counts the swings that came back empty', () => {
    const { met, divergence } = diverge(w2_02, 1, 'harvested-crops', (sim, botId) => {
      sim.harvest(botId);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: at({ x: 1, y: 1 }),
      expected: 'harvested',
      received: '1 try, nothing taken',
    });
  });

  test('all-planted counts the plant swings a spent hopper turned away', () => {
    const { met, divergence } = diverge(w2_02, 1, 'all-planted', (sim, botId) => {
      sim.wait(botId, 45);
      for (let pass = 0; pass < 3; pass++) {
        sweep(sim, botId, (each, bot) => {
          each.plant(bot);
          each.harvest(bot);
          each.plant(bot);
        });
      }
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe(at({ x: 1, y: 1 }));
    expect(shown.expected).toBe('planted');
    expect(shown.received).toMatch(/^\d+ tries, nothing sown$/);
  });

  test('crop-spoilage on a crop nobody picked asks for the crop before it asks for the ledger', () => {
    const { met, divergence } = diverge(w2_02, 1, 'crop-spoilage', () => undefined);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: at({ x: 1, y: 1 }),
      expected: 'harvested at some point',
      received: 'left standing',
    });
  });

  test('a run that picked everything late is told the total and the tile that stood longest', () => {
    const { met, divergence } = diverge(w2_02, 1, 'crop-spoilage', (sim, botId) => {
      sim.wait(botId, 45);
      for (let pass = 0; pass < 3; pass++) {
        sweep(sim, botId, (each, bot) => {
          each.plant(bot);
          each.harvest(bot);
          each.plant(bot);
        });
      }
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^\(\d+, \d+\), the tile that stood longest$/);
    expect(shown.expected).toBe('18 spoilage in all');
    expect(shown.received).toMatch(/^\d+, and \d+ of it here$/);
    const [total, here] = shown.received.match(/\d+/g)?.map(Number) as [number, number];
    expect(total).toBeGreaterThan(18);
    expect(here).toBeGreaterThan(0);
    expect(here).toBeLessThanOrEqual(total);
  });
});

describe('w2-03 reports what the hopper came back with and where the wheels went', () => {
  test('hopper-full-crop names the ice that took the slots', () => {
    const world = w2_03.build(1);
    const ice = ripeOf(world, ItemKind.Ice).slice(0, 3);
    const crop = ripeOf(world, ItemKind.Crop).slice(0, 3);
    const { met, divergence } = diverge(w2_03, 1, 'hopper-full-crop', (sim, botId) => {
      for (const tile of [...ice, ...crop]) {
        goTo(sim, botId, tile);
        sim.harvest(botId);
      }
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the hopper at the end of the run',
      expected: '8 crop',
      received: '3 crop, 3 ice, 2 spare',
    });
  });

  test('an empty hopper is told how many slots it never filled', () => {
    const { divergence } = diverge(w2_03, 1, 'hopper-full-crop', () => undefined);

    expect(divergence).toEqual({
      where: 'the hopper at the end of the run',
      expected: '8 crop',
      received: '0 crop, 8 spare',
    });
  });

  test('tile-footprint names the tick and tile the allowance ran out on', () => {
    const { met, divergence } = diverge(w2_03, 1, 'tile-footprint', (sim, botId) => {
      let dir: Dir = Dir.East;
      for (let row = 0; row < 3; row++) {
        for (let step = 0; step < 11; step++) sim.move(botId, dir);
        sim.move(botId, Dir.South);
        dir = dir === Dir.East ? Dir.West : Dir.East;
      }
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick 31 · ${at({ x: 9, y: 3 })}`,
      expected: '32 tiles',
      received: 'tile 33 of 37',
    });
  });
});

describe('no objective in World 2 answers a miss with silence', () => {
  for (const level of WORLD_2_LEVELS) {
    for (const seed of level.seeds) {
      test(`${level.id} names a point on seed ${String(seed)}`, () => {
        const result = runLevel(level, seed, () => undefined);
        const ctx = {
          world: result.world,
          trace: result.trace,
          initialWorld: result.initialWorld,
          ops: result.ops,
        };
        const pool: Objective[] = [...level.objectives, ...(level.bonus ?? [])];
        for (const objective of pool) {
          if (objective.evaluate(ctx) || objective.binary === true) continue;
          const shown = must(objective.divergence?.(ctx), `${level.id}/${objective.id}`);
          for (const value of [shown.where, shown.expected, shown.received]) {
            expect(value, `${level.id}/${objective.id}`).not.toBe('');
            expect(value.length, `${level.id}/${objective.id}: ${value}`) //
              .toBeLessThanOrEqual(DIVERGENCE_VALUE_CHARS);
          }
        }
      });
    }
  }
});
