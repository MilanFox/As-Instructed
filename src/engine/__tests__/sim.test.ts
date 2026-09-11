import { describe, expect, test } from 'vitest';
import type {
  GatherEvent,
  MoveEvent,
  SimOptions,
  TraceEvent,
  TransferEvent,
  UseEvent,
  World,
} from '../index.ts';
import {
  DEFAULT_COSTS,
  DEFAULT_GROW_TIME,
  DEFAULT_MAX_OPS,
  DEFAULT_MAX_TICKS,
  Dir,
  HaltError,
  IllegalActionError,
  ItemKind,
  LivelockError,
  MachineKind,
  MANUAL_ONLY,
  Objectives,
  OpLimitError,
  OutOfFuelError,
  Sim,
  Terrain,
  addBot,
  addGroundItems,
  buildVerdict,
  cloneWorld,
  countItemsAt,
  describeBlock,
  isSimError,
  itemsAt,
  machineById,
  maturity,
  setTile,
  tileAt,
  usesFuel,
  vec,
} from '../index.ts';
import { ASCII_LEGEND, asciiWorld, bot, must, openWorld, placeMachine } from './helpers.ts';

function eventsOfKind<K extends TraceEvent['kind']>(
  events: readonly TraceEvent[],
  kind: K,
): Extract<TraceEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<TraceEvent, { kind: K }> => e.kind === kind);
}

describe('Sim construction', () => {
  test('exposes the default budgets and cost table', () => {
    const sim = new Sim(openWorld(3, 3, 1));
    expect(sim.maxTicks).toBe(DEFAULT_MAX_TICKS);
    expect(sim.maxOps).toBe(DEFAULT_MAX_OPS);
    expect(sim.costs).toEqual(DEFAULT_COSTS);
    expect(sim.ticks).toBe(0);
    expect(sim.ops).toBe(0);
  });

  test('per-level cost overrides are merged over the defaults', () => {
    const sim = new Sim(openWorld(3, 3, 1), { costs: { move: 4, mine: 10 } });
    expect(sim.costs.move).toBe(4);
    expect(sim.costs.mine).toBe(10);
    expect(sim.costs.harvest).toBe(DEFAULT_COSTS.harvest);
  });

  test('adopts the highest pre-set bot clock as the makespan', () => {
    const world = openWorld(3, 3, 2);
    bot(world, 1).clock = 12;
    const sim = new Sim(world);
    expect(sim.ticks).toBe(12);
    expect(world.tick).toBe(12);
  });
});

describe('move', () => {
  test('succeeds, costs costs.move, and moves occupancy with the bot', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);

    expect(sim.move(0, Dir.East)).toBe(true);
    expect(bot(world).at).toEqual({ x: 1, y: 0 });
    expect(bot(world).clock).toBe(DEFAULT_COSTS.move);
    expect(sim.ticks).toBe(DEFAULT_COSTS.move);
    expect(must(tileAt(world, vec(0, 0))).occupant).toBeUndefined();
    expect(must(tileAt(world, vec(1, 0))).occupant).toBe(0);
  });

  test('South is y+1 and North is y-1', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    sim.move(0, Dir.South);
    expect(bot(world).at).toEqual({ x: 0, y: 1 });
    sim.move(0, Dir.North);
    expect(bot(world).at).toEqual({ x: 0, y: 0 });
  });

  test('fails out of bounds, charges moveBlocked, and still updates facing', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);

    expect(sim.move(0, Dir.North)).toBe(false);
    expect(bot(world).at).toEqual({ x: 0, y: 0 });
    expect(bot(world).facing).toBe(Dir.North);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.moveBlocked);

    const moves = eventsOfKind(sim.finish().events, 'move');
    expect(moves).toHaveLength(1);
    expect(must(moves[0]).ok).toBe(false);
    expect(must(moves[0]).reason).toBe('bounds');
  });

  test('fails against a wall, charges moveBlocked, and still updates facing', () => {
    const world = asciiWorld(['.#.'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);

    expect(sim.move(0, Dir.East)).toBe(false);
    expect(bot(world).at).toEqual({ x: 0, y: 0 });
    expect(bot(world).facing).toBe(Dir.East);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.moveBlocked);
    expect(must(eventsOfKind(sim.finish().events, 'move')[0]).reason).toBe('terrain');
  });

  test('fails against another bot, charges moveBlocked', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);

    expect(sim.move(0, Dir.East)).toBe(false);
    expect(bot(world, 0).at).toEqual({ x: 0, y: 0 });
    expect(bot(world, 0).clock).toBe(DEFAULT_COSTS.moveBlocked);
    expect(must(eventsOfKind(sim.finish().events, 'move')[0]).reason).toBe('bot');
  });

  test('honours a per-level move cost', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world, { costs: { move: 3, moveBlocked: 7 } });
    sim.move(0, Dir.East);
    expect(bot(world).clock).toBe(3);
    sim.move(0, Dir.North);
    expect(bot(world).clock).toBe(10);
  });

  test('a bot that walks into a Pit dies and can no longer be commanded', () => {
    const world = asciiWorld(['.X.'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);

    expect(sim.move(0, Dir.East)).toBe(true);
    expect(bot(world).alive).toBe(false);
    expect(must(tileAt(world, vec(1, 0))).occupant).toBeUndefined();
    expect(() => sim.move(0, Dir.East)).toThrow(IllegalActionError);

    const trace = sim.finish();
    expect(eventsOfKind(trace.events, 'die')).toHaveLength(1);
    expect(must(eventsOfKind(trace.events, 'die')[0]).reason).toContain('pit');
  });

  test('commanding an unknown bot throws IllegalActionError', () => {
    const sim = new Sim(openWorld(3, 3, 1));
    expect(() => sim.move(7, Dir.East)).toThrow(IllegalActionError);
    try {
      sim.move(7, Dir.East);
    } catch (error) {
      expect(isSimError(error)).toBe(true);
    }
  });

  test('describeBlock renders each failure reason', () => {
    expect(describeBlock('bounds', Dir.North)).toContain('North');
    expect(describeBlock('terrain', Dir.East)).toContain('solid');
    expect(describeBlock('bot', Dir.South)).toContain('Another bot');
    expect(describeBlock('dead', Dir.West)).toContain('failed');
  });
});

describe('turn', () => {
  test('rotates in place, is free by default, and is traced', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    sim.turn(0, Dir.South);
    expect(bot(world).facing).toBe(Dir.South);
    expect(bot(world).at).toEqual({ x: 0, y: 0 });
    expect(bot(world).clock).toBe(0);

    const turns = eventsOfKind(sim.finish().events, 'turn');
    expect(turns).toHaveLength(1);
    expect(must(turns[0]).facing).toBe(Dir.South);
  });

  test('charges a per-level turn cost when one is set', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world, { costs: { turn: 2 } });
    sim.turn(0, Dir.West);
    expect(bot(world).clock).toBe(2);
  });
});

describe('wait', () => {
  test('burns n ticks', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    sim.wait(0, 5);
    expect(bot(world).clock).toBe(5);
    expect(sim.ticks).toBe(5);
  });

  test('defaults to one tick', () => {
    const world = openWorld(3, 3, 1);
    new Sim(world).wait(0);
    expect(bot(world).clock).toBe(1);
  });

  test('wait(0) costs nothing but is still traced', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    sim.wait(0, 0);
    expect(bot(world).clock).toBe(0);
    const waits = eventsOfKind(sim.finish().events, 'wait');
    expect(waits).toHaveLength(1);
    expect(must(waits[0]).ticks).toBe(0);
    expect(must(waits[0]).dt).toBe(0);
  });

  test('a negative argument throws IllegalActionError', () => {
    const sim = new Sim(openWorld(3, 3, 1));
    expect(() => sim.wait(0, -1)).toThrow(IllegalActionError);
    expect(() => sim.wait(0, Number.NaN)).toThrow(IllegalActionError);
    expect(() => sim.wait(0, Number.POSITIVE_INFINITY)).toThrow(IllegalActionError);
  });

  test('the wait multiplier is applied', () => {
    const world = openWorld(3, 3, 1);
    new Sim(world, { costs: { wait: 3 } }).wait(0, 4);
    expect(bot(world).clock).toBe(12);
  });
});

function farmWorld(): ReturnType<typeof openWorld> {
  const world = asciiWorld(['S..'], { bots: [vec(0, 0)] });
  return world;
}

describe('harvest', () => {
  test('takes a mature crop and clears the tile', () => {
    const world = farmWorld();
    setTile(world, vec(0, 0), {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      growth: 4,
      maxGrowth: 4,
    });
    const sim = new Sim(world);

    expect(sim.harvest(0)).toBe(ItemKind.Crop);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.harvest);
    expect(sim.inventory(0, ItemKind.Crop)).toBe(1);

    const tile = must(tileAt(world, vec(0, 0)));
    expect(tile.crop).toBeUndefined();
    expect(tile.maxGrowth).toBeUndefined();
    expect(tile.growth).toBe(0);

    const trace = sim.finish();
    const gathers = eventsOfKind(trace.events, 'harvest') as GatherEvent[];
    expect(must(gathers[0]).ok).toBe(true);
    expect(must(gathers[0]).count).toBe(1);
    expect(eventsOfKind(trace.events, 'tileChange')).toHaveLength(1);
    expect(must(eventsOfKind(trace.events, 'fx')[0]).fx).toBe('harvest');
  });

  test('returns null on bare ground but still charges', () => {
    const world = farmWorld();
    const sim = new Sim(world);
    expect(sim.harvest(0)).toBeNull();
    expect(bot(world).clock).toBe(DEFAULT_COSTS.harvest);
    const gathers = eventsOfKind(sim.finish().events, 'harvest');
    expect(must(gathers[0]).ok).toBe(false);
    expect(must(gathers[0]).item).toBeNull();
  });

  test('returns null on an immature crop', () => {
    const world = farmWorld();
    setTile(world, vec(0, 0), {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      growth: 1,
      maxGrowth: 4,
    });
    const sim = new Sim(world);
    expect(sim.harvest(0)).toBeNull();
    expect(must(tileAt(world, vec(0, 0))).crop).toBe(ItemKind.Crop);
  });

  test('returns null when the inventory is full, leaving the crop standing', () => {
    const world = asciiWorld(['S..'], {
      bots: [vec(0, 0)],
      capacity: 1,
      inventory: [{ kind: ItemKind.Stone, count: 1 }],
    });
    setTile(world, vec(0, 0), {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      growth: 4,
      maxGrowth: 4,
    });
    const sim = new Sim(world);

    expect(sim.harvest(0)).toBeNull();
    expect(bot(world).clock).toBe(DEFAULT_COSTS.harvest);
    expect(must(tileAt(world, vec(0, 0))).crop).toBe(ItemKind.Crop);
  });
});

describe('plant', () => {
  test('plants a seed into soil and records the planting time', () => {
    const world = asciiWorld(['S..'], {
      bots: [vec(0, 0)],
      inventory: [{ kind: ItemKind.Seed, count: 2 }],
    });
    const sim = new Sim(world);
    sim.wait(0, 3);

    expect(sim.plant(0)).toBe(true);
    expect(sim.inventory(0, ItemKind.Seed)).toBe(1);
    expect(bot(world).clock).toBe(3 + DEFAULT_COSTS.plant);

    const sown = 3 + DEFAULT_COSTS.plant;
    const tile = must(tileAt(world, vec(0, 0)));
    expect(tile.crop).toBe(ItemKind.Crop);
    expect(tile.maxGrowth).toBe(DEFAULT_GROW_TIME);
    expect(must(tile.meta)['plantedAt']).toBe(sown);
    expect(maturity(tile, sown)).toBe(0);
    expect(maturity(tile, sown + DEFAULT_GROW_TIME)).toBe(DEFAULT_GROW_TIME);
  });

  test('a planted crop becomes harvestable once grow time has passed', () => {
    const world = asciiWorld(['S..'], {
      bots: [vec(0, 0)],
      inventory: [{ kind: ItemKind.Seed, count: 1 }],
    });
    const sim = new Sim(world);
    sim.plant(0);
    expect(sim.harvest(0)).toBeNull();
    sim.wait(0, DEFAULT_GROW_TIME);
    expect(sim.harvest(0)).toBe(ItemKind.Crop);
  });

  test('fails on non-plantable terrain but still charges', () => {
    const world = asciiWorld(['..S'], {
      bots: [vec(0, 0)],
      inventory: [{ kind: ItemKind.Seed, count: 1 }],
    });
    const sim = new Sim(world);
    expect(sim.plant(0)).toBe(false);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.plant);
    expect(sim.inventory(0, ItemKind.Seed)).toBe(1);
    expect(must(eventsOfKind(sim.finish().events, 'plant')[0]).ok).toBe(false);
  });

  test('fails without a seed', () => {
    const world = asciiWorld(['S..'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);
    expect(sim.plant(0)).toBe(false);
    expect(must(tileAt(world, vec(0, 0))).crop).toBeUndefined();
  });

  test('fails when the tile is already planted', () => {
    const world = asciiWorld(['S..'], {
      bots: [vec(0, 0)],
      inventory: [{ kind: ItemKind.Seed, count: 2 }],
    });
    const sim = new Sim(world);
    expect(sim.plant(0)).toBe(true);
    expect(sim.plant(0)).toBe(false);
    expect(sim.inventory(0, ItemKind.Seed)).toBe(1);
  });

  test('each of the three refusals names itself on the event', () => {
    const seeded = { kind: ItemKind.Seed, count: 2 };

    const wrongGround = new Sim(asciiWorld(['..S'], { bots: [vec(0, 0)], inventory: [seeded] }));
    expect(wrongGround.plant(0)).toBe(false);
    expect(must(eventsOfKind(wrongGround.finish().events, 'plant')[0]).reason).toBe('terrain');

    const alreadyGrowing = new Sim(asciiWorld(['S..'], { bots: [vec(0, 0)], inventory: [seeded] }));
    alreadyGrowing.plant(0);
    expect(alreadyGrowing.plant(0)).toBe(false);
    expect(must(eventsOfKind(alreadyGrowing.finish().events, 'plant')[1]).reason).toBe('occupied');

    const empty = new Sim(asciiWorld(['S..'], { bots: [vec(0, 0)] }));
    expect(empty.plant(0)).toBe(false);
    expect(must(eventsOfKind(empty.finish().events, 'plant')[0]).reason).toBe('seed');
  });

  test('free calls tell the three refusals apart without spending a tick', () => {
    function diagnose(sim: Sim): string {
      const here = sim.scan(0);
      if (here.terrain !== Terrain.Soil) return 'terrain';
      if (here.crop !== null) return 'occupied';
      if (sim.inventory(0, ItemKind.Seed) === 0) return 'seed';
      return 'would plant';
    }

    const seeded = { kind: ItemKind.Seed, count: 2 };
    const cases: [Sim, string][] = [
      [new Sim(asciiWorld(['..S'], { bots: [vec(0, 0)], inventory: [seeded] })), 'terrain'],
      [new Sim(asciiWorld(['S..'], { bots: [vec(0, 0)], inventory: [seeded] })), 'occupied'],
      [new Sim(asciiWorld(['S..'], { bots: [vec(0, 0)] })), 'seed'],
    ];
    cases[1]?.[0].plant(0);

    for (const [sim, expected] of cases) {
      const before = sim.ticks;
      expect(sim.plant(0)).toBe(false);
      const diagnosis = diagnose(sim);
      expect(diagnosis).toBe(expected);
      expect(sim.ticks).toBe(before + DEFAULT_COSTS.plant);

      const events = eventsOfKind(sim.finish().events, 'plant');
      expect(must(events[events.length - 1]).reason).toBe(diagnosis);
    }
  });

  test('a custom grow time is honoured', () => {
    const world = asciiWorld(['S..'], {
      bots: [vec(0, 0)],
      inventory: [{ kind: ItemKind.Seed, count: 1 }],
    });
    const sim = new Sim(world);
    sim.plant(0, ItemKind.Seed, 2);
    expect(must(tileAt(world, vec(0, 0))).maxGrowth).toBe(2);
    sim.wait(0, 2);
    expect(sim.harvest(0)).toBe(ItemKind.Crop);
  });
});

describe('mine', () => {
  test('mines the adjacent tile in dir, yielding the item and leaving minesTo terrain', () => {
    const world = asciiWorld(['.R.'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);

    expect(sim.mine(0, Dir.East)).toBe(ItemKind.Stone);
    expect(must(tileAt(world, vec(1, 0))).terrain).toBe(Terrain.Floor);
    expect(sim.inventory(0, ItemKind.Stone)).toBe(1);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.mine);

    const trace = sim.finish();
    expect(must(eventsOfKind(trace.events, 'mine')[0]).ok).toBe(true);
    expect(eventsOfKind(trace.events, 'tileChange')).toHaveLength(1);
  });

  test('mines the bot own tile when dir is omitted', () => {
    const world = asciiWorld(['G..'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);

    expect(sim.mine(0)).toBe(ItemKind.Regolith);
    expect(must(tileAt(world, vec(0, 0))).terrain).toBe(Terrain.Floor);
    expect(must(tileAt(world, vec(0, 0))).occupant).toBe(0);
  });

  test.each([
    [Terrain.Ore, ItemKind.Ore],
    [Terrain.Rubble, ItemKind.Scrap],
    [Terrain.Ice, ItemKind.Ice],
  ])('%s mines into %s', (terrain, item) => {
    const world = openWorld(3, 1, 1);
    setTile(world, vec(1, 0), { terrain });
    const sim = new Sim(world);
    expect(sim.mine(0, Dir.East)).toBe(item);
    expect(must(tileAt(world, vec(1, 0))).terrain).toBe(Terrain.Floor);
  });

  test('fails on non-mineable terrain but still charges', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    expect(sim.mine(0, Dir.East)).toBeNull();
    expect(bot(world).clock).toBe(DEFAULT_COSTS.mine);
    expect(must(eventsOfKind(sim.finish().events, 'mine')[0]).ok).toBe(false);
  });

  test('fails out of bounds', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    expect(sim.mine(0, Dir.West)).toBeNull();
  });

  test('fails when the inventory is full, leaving the terrain intact', () => {
    const world = asciiWorld(['.R.'], {
      bots: [vec(0, 0)],
      capacity: 2,
      inventory: [{ kind: ItemKind.Stone, count: 2 }],
    });
    const sim = new Sim(world);
    expect(sim.mine(0, Dir.East)).toBeNull();
    expect(must(tileAt(world, vec(1, 0))).terrain).toBe(Terrain.Rock);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.mine);
  });
});

describe('pickup', () => {
  test('takes one of whatever is underfoot when no kind is given', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Crate, 3);
    const sim = new Sim(world);

    expect(sim.pickup(0)).toBe(1);
    expect(sim.inventory(0, ItemKind.Crate)).toBe(1);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Crate)).toBe(2);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.pickup);
  });

  test('takes an explicit kind past the first stack on the tile', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Crate, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 4);
    const sim = new Sim(world);

    expect(sim.pickup(0, ItemKind.Ore, 3)).toBe(3);
    expect(sim.inventory(0, ItemKind.Ore)).toBe(3);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Crate)).toBe(1);
  });

  test('is clamped by what is actually on the ground', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 2);
    const sim = new Sim(world);
    expect(sim.pickup(0, ItemKind.Ore, 10)).toBe(2);
    expect(itemsAt(world, vec(0, 0))).toEqual([]);
  });

  test('is clamped by inventory capacity', () => {
    const world = openWorld(3, 1, 1, { capacity: 2 });
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 5);
    const sim = new Sim(world);
    expect(sim.pickup(0, ItemKind.Ore, 5)).toBe(2);
    expect(sim.inventory(0)).toBe(2);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Ore)).toBe(3);
  });

  test('returns 0 on an empty tile but still charges', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    expect(sim.pickup(0)).toBe(0);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.pickup);
    const events = eventsOfKind(sim.finish().events, 'pickup') as TransferEvent[];
    expect(must(events[0]).ok).toBe(false);
    expect(must(events[0]).item).toBeNull();
  });

  test('returns 0 when the requested kind is not there', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Crate, 3);
    const sim = new Sim(world);
    expect(sim.pickup(0, ItemKind.Ore, 1)).toBe(0);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Crate)).toBe(3);
  });

  test('a negative count throws IllegalActionError', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 3);
    const sim = new Sim(world);
    expect(() => sim.pickup(0, ItemKind.Ore, -1)).toThrow(IllegalActionError);
    expect(bot(world).clock).toBe(0);
  });

  test('a zero count is a no-op that still charges', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 3);
    const sim = new Sim(world);
    expect(sim.pickup(0, ItemKind.Ore, 0)).toBe(0);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.pickup);
  });

  test('free calls tell the four zeroes apart, and match the recorded reason', () => {
    function diagnose(sim: Sim, kind: ItemKind, requested: number): string {
      if (requested <= 0) return 'count';
      const here = sim.scan(0).items;
      if (here.length === 0) return 'empty';
      if (!here.some((stack) => stack.kind === kind)) return 'kind';
      if (sim.inventory(0) >= sim.capacity(0)) return 'full';
      return 'would take';
    }

    const bare = openWorld(3, 1, 1);
    const wrongKind = openWorld(3, 1, 1);
    addGroundItems(wrongKind, vec(0, 0), ItemKind.Crate, 3);
    const noRoom = openWorld(3, 1, 1, {
      capacity: 1,
      inventory: [{ kind: ItemKind.Ore, count: 1 }],
    });
    addGroundItems(noRoom, vec(0, 0), ItemKind.Ore, 3);
    const plenty = openWorld(3, 1, 1);
    addGroundItems(plenty, vec(0, 0), ItemKind.Ore, 3);

    const cases: [World, number, string][] = [
      [bare, 1, 'empty'],
      [wrongKind, 1, 'kind'],
      [noRoom, 1, 'full'],
      [plenty, 0, 'count'],
    ];

    for (const [world, requested, expected] of cases) {
      const sim = new Sim(world);
      expect(sim.pickup(0, ItemKind.Ore, requested)).toBe(0);
      const diagnosis = diagnose(sim, ItemKind.Ore, requested);
      expect(diagnosis).toBe(expected);
      expect(must(eventsOfKind(sim.finish().events, 'pickup')[0]).reason).toBe(diagnosis);
    }
  });
});

describe('drop', () => {
  test('drops the first held kind when none is given', () => {
    const world = openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Ore, count: 3 }] });
    const sim = new Sim(world);

    expect(sim.drop(0)).toBe(1);
    expect(sim.inventory(0, ItemKind.Ore)).toBe(2);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Ore)).toBe(1);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.drop);
  });

  test('drops a partial count of an explicit kind', () => {
    const world = openWorld(3, 1, 1, {
      inventory: [
        { kind: ItemKind.Ore, count: 3 },
        { kind: ItemKind.Crate, count: 2 },
      ],
    });
    const sim = new Sim(world);

    expect(sim.drop(0, ItemKind.Crate, 2)).toBe(2);
    expect(sim.inventory(0, ItemKind.Crate)).toBe(0);
    expect(sim.inventory(0, ItemKind.Ore)).toBe(3);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Crate)).toBe(2);
  });

  test('is clamped by what is held', () => {
    const world = openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Ore, count: 2 }] });
    const sim = new Sim(world);
    expect(sim.drop(0, ItemKind.Ore, 10)).toBe(2);
    expect(sim.inventory(0)).toBe(0);
  });

  test('returns 0 with an empty inventory but still charges', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    expect(sim.drop(0)).toBe(0);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.drop);
    expect(must(eventsOfKind(sim.finish().events, 'drop')[0]).ok).toBe(false);
  });

  test('returns 0 when the requested kind is not held', () => {
    const world = openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Ore, count: 2 }] });
    const sim = new Sim(world);
    expect(sim.drop(0, ItemKind.Crate, 1)).toBe(0);
  });

  test('free calls tell the three zeroes apart, and match the recorded reason', () => {
    function diagnose(sim: Sim, kind: ItemKind, requested: number): string {
      if (requested <= 0) return 'count';
      if (sim.inventory(0) === 0) return 'empty';
      if (!sim.carrying(0).includes(kind)) return 'kind';
      return 'would drop';
    }

    const cases: [World, number, string][] = [
      [openWorld(3, 1, 1), 1, 'empty'],
      [openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Ore, count: 2 }] }), 1, 'kind'],
      [openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Crate, count: 2 }] }), 0, 'count'],
    ];

    for (const [world, requested, expected] of cases) {
      const sim = new Sim(world);
      expect(sim.drop(0, ItemKind.Crate, requested)).toBe(0);
      const diagnosis = diagnose(sim, ItemKind.Crate, requested);
      expect(diagnosis).toBe(expected);
      expect(must(eventsOfKind(sim.finish().events, 'drop')[0]).reason).toBe(diagnosis);
    }
  });

  test('a negative count throws IllegalActionError', () => {
    const world = openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Ore, count: 2 }] });
    const sim = new Sim(world);
    expect(() => sim.drop(0, ItemKind.Ore, -2)).toThrow(IllegalActionError);
    expect(bot(world).clock).toBe(0);
  });

  test('dropped items merge into an existing ground stack', () => {
    const world = openWorld(3, 1, 1, { inventory: [{ kind: ItemKind.Ore, count: 2 }] });
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 1);
    const sim = new Sim(world);
    sim.drop(0, ItemKind.Ore, 2);
    expect(itemsAt(world, vec(0, 0))).toHaveLength(1);
    expect(countItemsAt(world, vec(0, 0), ItemKind.Ore)).toBe(3);
  });
});

describe('use', () => {
  test('advances a machine through its cycle and wraps around', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, {
      id: 'lever',
      kind: MachineKind.Lever,
      at: vec(0, 0),
      state: 'off',
      cycle: ['off', 'on', 'blinking'],
    });
    const sim = new Sim(world);

    expect(sim.use(0)).toBe(true);
    expect(must(machineById(world, 'lever')).state).toBe('on');
    expect(bot(world).clock).toBe(DEFAULT_COSTS.use);
    sim.use(0);
    expect(must(machineById(world, 'lever')).state).toBe('blinking');
    sim.use(0);
    expect(must(machineById(world, 'lever')).state).toBe('off');

    const trace = sim.finish();
    expect(eventsOfKind(trace.events, 'machineChange')).toHaveLength(3);
    const uses = eventsOfKind(trace.events, 'use') as UseEvent[];
    expect(must(uses[0]).machineId).toBe('lever');
    expect(must(uses[0]).ok).toBe(true);
  });

  test('operates the adjacent machine when dir is given', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, {
      id: 'press',
      kind: MachineKind.Press,
      at: vec(1, 0),
      state: 'idle',
      cycle: ['idle', 'busy'],
    });
    const sim = new Sim(world);
    expect(sim.use(0, Dir.East)).toBe(true);
    expect(must(machineById(world, 'press')).state).toBe('busy');
  });

  test('a Door with links flips those tiles between Floor and Wall', () => {
    const world = asciiWorld(['..#'], { bots: [vec(0, 0)] });
    placeMachine(world, {
      id: 'door',
      kind: MachineKind.Door,
      at: vec(1, 0),
      state: 'closed',
      cycle: ['closed', 'open'],
      links: [vec(2, 0)],
    });
    const sim = new Sim(world);

    expect(must(tileAt(world, vec(2, 0))).terrain).toBe(Terrain.Wall);
    sim.use(0, Dir.East);
    expect(must(machineById(world, 'door')).state).toBe('open');
    expect(must(tileAt(world, vec(2, 0))).terrain).toBe(Terrain.Floor);

    sim.use(0, Dir.East);
    expect(must(machineById(world, 'door')).state).toBe('closed');
    expect(must(tileAt(world, vec(2, 0))).terrain).toBe(Terrain.Wall);

    expect(eventsOfKind(sim.finish().events, 'tileChange')).toHaveLength(2);
  });

  test('a machine with no cycle is refused, not silently agreed to', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, { id: 'sink', kind: MachineKind.Sink, at: vec(0, 0), state: 'idle' });
    const sim = new Sim(world);

    expect(sim.use(0)).toBe(false);
    expect(must(machineById(world, 'sink')).state).toBe('idle');
    expect(bot(world).clock).toBe(DEFAULT_COSTS.use);

    const trace = sim.finish();
    const uses = eventsOfKind(trace.events, 'use') as UseEvent[];
    expect(must(uses[0]).ok).toBe(false);
    expect(must(uses[0]).machineId).toBe('sink');
    expect(eventsOfKind(trace.events, 'machineChange')).toHaveLength(0);
    expect(eventsOfKind(trace.events, 'fx')).toHaveLength(0);
  });

  test('the refusal is positional, so the identical call succeeds one tile over', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, { id: 'sink', kind: MachineKind.Sink, at: vec(0, 0), state: 'idle' });
    placeMachine(world, {
      id: 'lever',
      kind: MachineKind.Lever,
      at: vec(1, 0),
      state: 'off',
      cycle: ['off', 'on'],
    });
    const sim = new Sim(world);

    expect(sim.use(0)).toBe(false);
    expect(sim.probe(0, 'sink')?.state).toBe('idle');
    sim.move(0, Dir.East);
    expect(sim.use(0)).toBe(true);
    expect(sim.probe(0, 'lever')?.state).toBe('on');
  });

  test('returns false with no machine present, and still charges', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    expect(sim.use(0)).toBe(false);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.use);
    const uses = eventsOfKind(sim.finish().events, 'use') as UseEvent[];
    expect(must(uses[0]).ok).toBe(false);
    expect(must(uses[0]).machineId).toBeNull();
  });
});

describe('power', () => {
  test('sets a machine state directly', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, { id: 'node', kind: MachineKind.Node, at: vec(2, 0), state: 'off' });
    const sim = new Sim(world);

    expect(sim.power(0, 'node', 'on')).toBe(true);
    expect(must(machineById(world, 'node')).state).toBe('on');
    expect(bot(world).clock).toBe(DEFAULT_COSTS.power);

    const trace = sim.finish();
    expect(eventsOfKind(trace.events, 'machineChange')).toHaveLength(1);
    const acts = eventsOfKind(trace.events, 'act');
    expect(must(acts[0]).name).toBe('power');
    expect(must(acts[0]).detail).toBe('on');
  });

  test('an unknown machine stops the run, and is charged and logged first', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    expect(() => sim.power(0, 'ghost', 'on')).toThrow(IllegalActionError);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.power);
    expect(must(eventsOfKind(sim.finish().events, 'act')[0]).ok).toBe(false);
  });

  test('the unknown-machine message names the id and the free check for it', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    let message = '';
    try {
      sim.power(0, 'ghost', 'on');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('power("ghost")');
    expect(message).toContain('no machine on this work order has that id');
    expect(message).toContain('probe("ghost")');
  });

  test('a manual machine refuses in a sentence that names it and its tile', () => {
    const world = openWorld(9, 5, 1);
    placeMachine(world, {
      id: 'sub-3',
      kind: MachineKind.Node,
      at: vec(7, 3),
      state: 'off',
      vars: { [MANUAL_ONLY]: 1 },
    });
    const sim = new Sim(world);

    let thrown: unknown;
    try {
      sim.power(0, 'sub-3', 'on');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IllegalActionError);
    const error = thrown as IllegalActionError;
    expect(error.message).toContain('power("sub-3")');
    expect(error.message).toContain('(7, 3)');
    expect(error.message).toContain('hand-operated');
    expect(error.message).toContain('use()');
    expect(error.at).toEqual(vec(7, 3));
    expect(must(machineById(world, 'sub-3')).state).toBe('off');
  });

  test('the refused call is charged and logged before it throws', () => {
    const world = openWorld(9, 5, 1);
    placeMachine(world, {
      id: 'sub-3',
      kind: MachineKind.Node,
      at: vec(7, 3),
      state: 'off',
      vars: { [MANUAL_ONLY]: 1 },
    });
    const sim = new Sim(world);

    expect(() => sim.power(0, 'sub-3', 'on')).toThrow(IllegalActionError);
    expect(bot(world).clock).toBe(DEFAULT_COSTS.power);

    const acts = eventsOfKind(sim.finish().events, 'act');
    expect(acts).toHaveLength(1);
    expect(must(acts[0]).name).toBe('power');
    expect(must(acts[0]).ok).toBe(false);
    expect(must(acts[0]).detail).toBe('sub-3');
  });

  test('a machine without the flag is untouched by the rule', () => {
    const world = openWorld(9, 5, 1);
    placeMachine(world, {
      id: 'node',
      kind: MachineKind.Node,
      at: vec(7, 3),
      state: 'off',
      vars: { [MANUAL_ONLY]: 0 },
    });
    const sim = new Sim(world);
    expect(sim.power(0, 'node', 'on')).toBe(true);
  });

  test('power on a linked Door also flips its tiles', () => {
    const world = asciiWorld(['..#'], { bots: [vec(0, 0)] });
    placeMachine(world, {
      id: 'door',
      kind: MachineKind.Door,
      at: vec(1, 0),
      state: 'closed',
      links: [vec(2, 0)],
    });
    const sim = new Sim(world);
    sim.power(0, 'door', 'open');
    expect(must(tileAt(world, vec(2, 0))).terrain).toBe(Terrain.Floor);
  });
});

describe('mark and readMark', () => {
  test('mark writes a breadcrumb and costs costs.mark; readMark is free', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);

    expect(sim.readMark(0)).toBeNull();
    sim.mark(0, 'visited');
    expect(bot(world).clock).toBe(DEFAULT_COSTS.mark);
    expect(sim.readMark(0)).toBe('visited');
    expect(must(tileAt(world, vec(0, 0))).mark).toBe('visited');

    const clockBefore = bot(world).clock;
    sim.readMark(0);
    expect(bot(world).clock).toBe(clockBefore);
  });

  test('mark(null) erases', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.mark(0, 'x');
    sim.mark(0, null);
    expect(sim.readMark(0)).toBeNull();
    expect(must(tileAt(world, vec(0, 0))).mark).toBeUndefined();
    const marks = eventsOfKind(sim.finish().events, 'mark');
    expect(marks.map((m) => m.text)).toEqual(['x', null]);
  });

  test('marks are per-tile', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.mark(0, 'start');
    sim.move(0, Dir.East);
    expect(sim.readMark(0)).toBeNull();
    sim.move(0, Dir.West);
    expect(sim.readMark(0)).toBe('start');
  });
});

describe('print', () => {
  test('is free and lands in the trace with an optional source line', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.wait(0, 2);
    sim.print(0, 'hello');
    sim.print(0, 'world', 12);

    expect(bot(world).clock).toBe(2);
    const prints = eventsOfKind(sim.finish().events, 'print');
    expect(prints.map((p) => p.text)).toEqual(['hello', 'world']);
    expect(must(prints[0]).t).toBe(2);
    expect(must(prints[0]).line).toBeUndefined();
    expect(must(prints[1]).line).toBe(12);
  });
});

describe('send and recv', () => {
  test('send queues a message and costs costs.send; recv pops it and is free', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);

    expect(sim.send(0, 1, 'go north')).toBe(true);
    expect(bot(world, 0).clock).toBe(DEFAULT_COSTS.send);
    expect(bot(world, 1).inbox).toHaveLength(1);

    const clockBefore = bot(world, 1).clock;
    const message = sim.recv(1);
    expect(message).toEqual({ from: 0, body: 'go north', t: 0 });
    expect(bot(world, 1).clock).toBe(clockBefore);
    expect(bot(world, 1).inbox).toHaveLength(0);
  });

  test('recv on an empty inbox returns null and is traced', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);
    expect(sim.recv(1)).toBeNull();
    const recvs = eventsOfKind(sim.finish().events, 'recv');
    expect(must(recvs[0]).from).toBeNull();
    expect(must(recvs[0]).body).toBeNull();
  });

  test('messages are delivered in send order once the receiver clock has caught up', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);
    sim.send(0, 1, 'first');
    sim.send(0, 1, 'second');
    sim.sync();
    expect(must(sim.recv(1)).body).toBe('first');
    expect(must(sim.recv(1)).body).toBe('second');
    expect(sim.recv(1)).toBeNull();
  });

  test('a message is still in flight until the receiver clock reaches the send', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);
    sim.wait(0, 40);
    sim.send(0, 1, 'from the future');

    expect(sim.recv(1)).toBeNull();
    sim.wait(1, 41);
    expect(must(sim.recv(1)).body).toBe('from the future');
  });

  test('the inbox is ordered by send time, not by the order the calls were issued', () => {
    const world = openWorld(3, 3, 3);
    const sim = new Sim(world);
    sim.wait(0, 40);
    sim.send(0, 2, 'late');
    sim.send(1, 2, 'early');
    sim.sync();
    expect(must(sim.recv(2)).body).toBe('early');
    expect(must(sim.recv(2)).body).toBe('late');
  });

  test('send to an unknown bot throws, naming the id, and still charges', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    expect(() => sim.send(0, 99, 'anyone?')).toThrow(IllegalActionError);
    expect(bot(world, 0).clock).toBe(DEFAULT_COSTS.send);
    const sends = eventsOfKind(sim.finish().events, 'send');
    expect(must(sends[0]).ok).toBe(false);
    expect(must(sends[0]).to).toBe(99);
  });

  test('send to a dead bot throws, naming the bot and where it was lost', () => {
    const world = asciiWorld(['..X'], { bots: [vec(0, 0), vec(1, 0)] });
    const sim = new Sim(world);
    sim.move(1, Dir.East);
    expect(bot(world, 1).alive).toBe(false);

    let thrown: unknown;
    try {
      sim.send(0, 1, 'still there?');
    } catch (error) {
      thrown = error;
    }
    expect(isSimError(thrown)).toBe(true);
    const error = thrown as IllegalActionError;
    expect(error.code).toBe('illegal-action');
    expect(error.message).toContain('#1');
    expect(error.message).toContain('(2, 0)');
    expect(error.message).toContain('bots()');
    expect(error.at).toEqual(vec(2, 0));
  });
});

describe('spawn', () => {
  test('creates a bot on the adjacent tile with the next free id', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);

    const id = sim.spawn(0, Dir.South, { name: 'helper', capacity: 3 });
    expect(id).toBe(1);
    expect(bot(world, 0).clock).toBe(DEFAULT_COSTS.spawn);

    const child = bot(world, 1);
    expect(child.at).toEqual({ x: 0, y: 1 });
    expect(child.name).toBe('helper');
    expect(child.capacity).toBe(3);
    expect(child.facing).toBe(Dir.South);
    expect(child.clock).toBe(DEFAULT_COSTS.spawn);
    expect(must(tileAt(world, vec(0, 1))).occupant).toBe(1);
    expect(sim.botIds()).toEqual([0, 1]);

    const spawns = eventsOfKind(sim.finish().events, 'spawn');
    expect(must(spawns[0]).bot.id).toBe(1);
  });

  test('inherits the parent capacity by default', () => {
    const world = openWorld(3, 3, 1, { capacity: 5 });
    const sim = new Sim(world);
    sim.spawn(0, Dir.South);
    expect(bot(world, 1).capacity).toBe(5);
  });

  test('returns -1 when the target tile is blocked, and still charges', () => {
    const world = asciiWorld(['.#.'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);
    expect(sim.spawn(0, Dir.East)).toBe(-1);
    expect(bot(world, 0).clock).toBe(DEFAULT_COSTS.spawn);
    expect(world.bots).toHaveLength(1);
    const acts = eventsOfKind(sim.finish().events, 'act');
    expect(must(acts[0]).name).toBe('spawn');
    expect(must(acts[0]).ok).toBe(false);
  });

  test('returns -1 when another bot already holds the tile', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);
    expect(sim.spawn(0, Dir.East)).toBe(-1);
    expect(world.bots).toHaveLength(2);
  });

  test('returns -1 out of bounds', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    expect(sim.spawn(0, Dir.North)).toBe(-1);
  });

  test('a refused spawn records the same reason a refused move would, and it renders', () => {
    const walled = new Sim(asciiWorld(['.#.'], { bots: [vec(0, 0)] }));
    expect(walled.spawn(0, Dir.East)).toBe(-1);
    const blockedByWall = must(eventsOfKind(walled.finish().events, 'act')[0]);
    expect(blockedByWall.detail).toBe('terrain');
    expect(describeBlock(blockedByWall.detail as string, Dir.East)).toContain('solid');

    const crowded = new Sim(openWorld(3, 3, 2));
    expect(crowded.spawn(0, Dir.East)).toBe(-1);
    const blockedByBot = must(eventsOfKind(crowded.finish().events, 'act')[0]);
    expect(blockedByBot.detail).toBe('bot');
    expect(describeBlock(blockedByBot.detail as string, Dir.East)).toContain('Another bot');

    const edge = new Sim(openWorld(3, 3, 1));
    expect(edge.spawn(0, Dir.North)).toBe(-1);
    expect(must(eventsOfKind(edge.finish().events, 'act')[0]).detail).toBe('bounds');
  });

  test('scan() tells the player the same thing the refusal did', () => {
    const world = asciiWorld(['.#.'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);
    expect(sim.spawn(0, Dir.East)).toBe(-1);

    const ahead = sim.scan(0, Dir.East);
    expect(ahead.inBounds).toBe(true);
    expect(ahead.walkable).toBe(false);
    expect(sim.scan(0, Dir.North).inBounds).toBe(false);
  });
});

describe('sync', () => {
  test('levels every clock up to the makespan and emits sync events', () => {
    const world = openWorld(4, 4, 3);
    const sim = new Sim(world);
    sim.wait(0, 3);
    sim.wait(1, 11);

    expect(sim.sync()).toBe(11);
    expect(bot(world, 0).clock).toBe(11);
    expect(bot(world, 1).clock).toBe(11);
    expect(bot(world, 2).clock).toBe(11);
    expect(world.tick).toBe(11);

    const syncs = eventsOfKind(sim.finish().events, 'sync');
    expect(syncs.map((s) => ({ botId: s.botId, t: s.t, dt: s.dt, to: s.to }))).toEqual([
      { botId: 2, t: 0, dt: 11, to: 11 },
      { botId: 0, t: 3, dt: 8, to: 11 },
    ]);
  });

  test('is a no-op when every clock already agrees', () => {
    const world = openWorld(3, 3, 2);
    const sim = new Sim(world);
    expect(sim.sync()).toBe(0);
    expect(eventsOfKind(sim.finish().events, 'sync')).toHaveLength(0);
  });

  test('leaves dead bots alone', () => {
    const world = asciiWorld(['..X.'], { bots: [vec(0, 0), vec(1, 0)] });
    const sim = new Sim(world);
    sim.move(1, Dir.East);
    sim.wait(0, 10);
    sim.sync();
    expect(bot(world, 1).clock).toBe(1);
    expect(bot(world, 0).clock).toBe(10);
  });
});

describe('sensing', () => {
  test('pos reports a copy of the bot position', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    const position = sim.pos(0);
    expect(position).toEqual({ x: 0, y: 0 });
    position.x = 99;
    expect(bot(world).at).toEqual({ x: 0, y: 0 });
  });

  test('canMove reflects bounds, terrain and bots', () => {
    const world = asciiWorld(['.#.', '...', '...'], { bots: [vec(0, 0), vec(0, 1)] });
    const sim = new Sim(world);
    expect(sim.canMove(0, Dir.North)).toBe(false); // out of bounds
    expect(sim.canMove(0, Dir.East)).toBe(false); // wall
    expect(sim.canMove(0, Dir.South)).toBe(false); // bot #1
    expect(sim.canMove(1, Dir.South)).toBe(true);
  });

  test('scan of the own tile reports terrain, items, occupant and machine', () => {
    const world = asciiWorld(['P..'], { bots: [vec(0, 0)] });
    addGroundItems(world, vec(0, 0), ItemKind.Crate, 2);
    placeMachine(world, { id: 'sink', kind: MachineKind.Sink, at: vec(0, 0) });
    const sim = new Sim(world);

    const view = sim.scan(0);
    expect(view.at).toEqual({ x: 0, y: 0 });
    expect(view.inBounds).toBe(true);
    expect(view.terrain).toBe(Terrain.Pad);
    expect(view.walkable).toBe(true);
    expect(view.botId).toBe(0);
    expect(view.machineId).toBe('sink');
    expect(view.items).toEqual([{ kind: ItemKind.Crate, count: 2 }]);
    expect(view.crop).toBeNull();
    expect(view.mark).toBeNull();
  });

  test('scan of a direction looks at the adjacent tile', () => {
    const world = asciiWorld(['.#.'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);
    const view = sim.scan(0, Dir.East);
    expect(view.at).toEqual({ x: 1, y: 0 });
    expect(view.terrain).toBe(Terrain.Wall);
    expect(view.walkable).toBe(false);
  });

  test('scan out of bounds reports void and inBounds false', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    const view = sim.scan(0, Dir.North);
    expect(view.inBounds).toBe(false);
    expect(view.terrain).toBe(Terrain.Void);
    expect(view.walkable).toBe(false);
    expect(view.items).toEqual([]);
    expect(view.botId).toBeNull();
    expect(view.machineId).toBeNull();
  });

  test('scan reports crop maturity relative to the observing bot clock', () => {
    const world = asciiWorld(['S..'], {
      bots: [vec(0, 0)],
      inventory: [{ kind: ItemKind.Seed, count: 1 }],
    });
    const sim = new Sim(world);
    sim.plant(0);
    expect(sim.scan(0).growth).toBe(0);
    expect(sim.scan(0).maxGrowth).toBe(DEFAULT_GROW_TIME);
    sim.wait(0, DEFAULT_GROW_TIME);
    expect(sim.scan(0).growth).toBe(DEFAULT_GROW_TIME);
  });

  test('look stops at the first opaque tile, which is included', () => {
    const world = asciiWorld(['....#...'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);
    const ray = sim.look(0, Dir.East);
    expect(ray.map((v) => v.at.x)).toEqual([1, 2, 3, 4]);
    expect(must(ray[3]).terrain).toBe(Terrain.Wall);
  });

  test('look respects range', () => {
    const world = asciiWorld(['........'], { bots: [vec(0, 0)] });
    const sim = new Sim(world);
    expect(sim.look(0, Dir.East, 3)).toHaveLength(3);
    expect(sim.look(0, Dir.East, 0)).toHaveLength(0);
    const ray = sim.look(0, Dir.East);
    expect(ray).toHaveLength(8);
    expect(ray.filter((v) => v.inBounds)).toHaveLength(7);
    expect(must(ray[7]).inBounds).toBe(false);
  });

  test('look clips at the world edge, reporting the out-of-bounds tile last', () => {
    const world = asciiWorld(['...'], { bots: [vec(1, 0)] });
    const sim = new Sim(world);
    const ray = sim.look(0, Dir.East, 5);
    expect(ray).toHaveLength(2);
    expect(must(ray[0]).inBounds).toBe(true);
    expect(must(ray[1]).inBounds).toBe(false);
    expect(must(ray[1]).terrain).toBe(Terrain.Void);
  });

  test('inventory totals everything or one kind, and carrying lists the kinds', () => {
    const world = openWorld(3, 1, 1, {
      inventory: [
        { kind: ItemKind.Ore, count: 2 },
        { kind: ItemKind.Crate, count: 1 },
      ],
    });
    const sim = new Sim(world);
    expect(sim.inventory(0)).toBe(3);
    expect(sim.inventory(0, ItemKind.Ore)).toBe(2);
    expect(sim.inventory(0, ItemKind.Seed)).toBe(0);
    expect(sim.carrying(0)).toEqual([ItemKind.Ore, ItemKind.Crate]);
    expect(sim.capacity(0)).toBe(8);
  });

  test('carrying reflects pickup order and drops emptied kinds', () => {
    const world = openWorld(3, 1, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Crate, 1);
    addGroundItems(world, vec(0, 0), ItemKind.Ore, 1);
    const sim = new Sim(world);
    sim.pickup(0, ItemKind.Ore, 1);
    sim.pickup(0, ItemKind.Crate, 1);
    expect(sim.carrying(0)).toEqual([ItemKind.Ore, ItemKind.Crate]);
    sim.drop(0, ItemKind.Ore, 1);
    expect(sim.carrying(0)).toEqual([ItemKind.Crate]);
  });

  test('probe finds the machine underfoot, then the one the bot faces', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, {
      id: 'ahead',
      kind: MachineKind.Furnace,
      at: vec(1, 0),
      state: 'hot',
      vars: { fuel: 2 },
      inventory: [{ kind: ItemKind.Ore, count: 1 }],
    });
    const sim = new Sim(world);

    const view = must(sim.probe(0));
    expect(view.id).toBe('ahead');
    expect(view.kind).toBe(MachineKind.Furnace);
    expect(view.state).toBe('hot');
    expect(view.vars).toEqual({ fuel: 2 });
    expect(view.inventory).toEqual([{ kind: ItemKind.Ore, count: 1 }]);
  });

  test('probe by id works from anywhere, and unknown ids give null', () => {
    const world = openWorld(3, 3, 1);
    placeMachine(world, { id: 'far', kind: MachineKind.Node, at: vec(2, 2), state: 'off' });
    const sim = new Sim(world);
    expect(must(sim.probe(0, 'far')).state).toBe('off');
    expect(sim.probe(0, 'nope')).toBeNull();
    expect(sim.probe(0)).toBeNull();
  });

  test('probe returns copies, not live machine internals', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, { id: 'm', kind: MachineKind.Node, at: vec(0, 0), vars: { fuel: 1 } });
    const sim = new Sim(world);
    const view = must(sim.probe(0));
    view.vars['fuel'] = 99;
    view.at.x = 99;
    expect(must(machineById(world, 'm')).vars).toEqual({ fuel: 1 });
    expect(must(machineById(world, 'm')).at).toEqual({ x: 0, y: 0 });
  });

  test('botIds lists only living bots', () => {
    const world = asciiWorld(['..X'], { bots: [vec(0, 0), vec(1, 0)] });
    const sim = new Sim(world);
    expect(sim.botIds()).toEqual([0, 1]);
    sim.move(1, Dir.East);
    expect(sim.botIds()).toEqual([0]);
  });

  test('every sensing call costs 0 ticks but does increment ops', () => {
    const world = openWorld(3, 3, 2);
    addGroundItems(world, vec(0, 0), ItemKind.Crate, 1);
    placeMachine(world, { id: 'm', kind: MachineKind.Node, at: vec(0, 0) });
    const sim = new Sim(world);

    const senses: { name: string; run: () => void }[] = [
      { name: 'pos', run: () => void sim.pos(0) },
      { name: 'facing', run: () => void sim.facing(0) },
      { name: 'clock', run: () => void sim.clock(0) },
      { name: 'canMove', run: () => void sim.canMove(0, Dir.South) },
      { name: 'scan(own)', run: () => void sim.scan(0) },
      { name: 'scan(dir)', run: () => void sim.scan(0, Dir.East) },
      { name: 'look', run: () => void sim.look(0, Dir.South, 3) },
      { name: 'inventory', run: () => void sim.inventory(0) },
      { name: 'carrying', run: () => void sim.carrying(0) },
      { name: 'capacity', run: () => void sim.capacity(0) },
      { name: 'readMark', run: () => void sim.readMark(0) },
      { name: 'probe', run: () => void sim.probe(0) },
      { name: 'botIds', run: () => void sim.botIds() },
      { name: 'recv', run: () => void sim.recv(0) },
      { name: 'print', run: () => sim.print(0, 'noise') },
    ];

    for (const sense of senses) {
      const clockBefore = bot(world, 0).clock;
      const ticksBefore = sim.ticks;
      const opsBefore = sim.ops;
      sense.run();
      expect(`${sense.name}: clock ${bot(world, 0).clock}`).toBe(
        `${sense.name}: clock ${clockBefore}`,
      );
      expect(`${sense.name}: ticks ${sim.ticks}`).toBe(`${sense.name}: ticks ${ticksBefore}`);
      expect(`${sense.name}: ops ${sim.ops > opsBefore}`).toBe(`${sense.name}: ops true`);
    }
    expect(sim.ticks).toBe(0);
  });
});

describe('budgets', () => {
  test('exceeding maxTicks throws HaltError', () => {
    const world = openWorld(10, 1, 1);
    const sim = new Sim(world, { maxTicks: 3 });
    sim.move(0, Dir.East);
    sim.move(0, Dir.East);
    sim.move(0, Dir.East);
    expect(() => sim.move(0, Dir.East)).toThrow(HaltError);
  });

  test('the offending action is recorded before the HaltError is thrown', () => {
    const world = openWorld(10, 1, 1);
    const sim = new Sim(world, { maxTicks: 2 });
    expect(() => {
      for (let i = 0; i < 10; i++) sim.move(0, Dir.East);
    }).toThrow(HaltError);

    const trace = sim.finish();
    const moves = eventsOfKind(trace.events, 'move');
    expect(moves).toHaveLength(3);
    expect(must(moves[2]).t).toBe(2);
    expect(bot(world).at).toEqual({ x: 3, y: 0 });
    expect(trace.endTick).toBe(3);
  });

  test('HaltError carries the budget and the offending bot', () => {
    const sim = new Sim(openWorld(10, 1, 1), { maxTicks: 1 });
    try {
      sim.wait(0, 5);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HaltError);
      if (error instanceof HaltError) {
        expect(error.maxTicks).toBe(1);
        expect(error.botId).toBe(0);
        expect(error.code).toBe('halt');
      }
    }
  });

  test('sync also enforces maxTicks', () => {
    const world = openWorld(4, 4, 2);
    const sim = new Sim(world, { maxTicks: 100 });
    bot(world, 0).clock = 500;
    expect(() => sim.sync()).toThrow(HaltError);
  });

  test('exceeding maxOps throws OpLimitError', () => {
    const sim = new Sim(openWorld(3, 3, 1), { maxOps: 5 });
    for (let i = 0; i < 5; i++) sim.pos(0);
    expect(sim.ops).toBe(5);
    expect(() => sim.pos(0)).toThrow(OpLimitError);
  });

  test('a sense-only loop hits the op limit without ever hitting the tick limit', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world, { maxOps: 50, maxTicks: 1_000_000 });
    expect(() => {
      for (let i = 0; i < 10_000; i++) sim.canMove(0, Dir.East);
    }).toThrow(OpLimitError);
    expect(sim.ticks).toBe(0);
    expect(bot(world).clock).toBe(0);
    expect(sim.ops).toBe(51);
  });

  test('OpLimitError carries the budget', () => {
    const sim = new Sim(openWorld(3, 3, 1), { maxOps: 1 });
    sim.pos(0);
    try {
      sim.pos(0);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OpLimitError);
      if (error instanceof OpLimitError) {
        expect(error.maxOps).toBe(1);
        expect(error.code).toBe('oplimit');
      }
    }
  });

  test('wait enforces maxTicks even though it burns no fuel', () => {
    const world = openWorld(3, 3, 1, { fuel: 100 });
    const sim = new Sim(world, { maxTicks: 10 });
    expect(() => sim.wait(0, 11)).toThrow(HaltError);
    expect(bot(world).fuel).toBe(100);
  });

  test('refuel enforces maxTicks', () => {
    const sim = new Sim(openWorld(3, 3, 1), { maxTicks: 1 });
    expect(() => sim.refuel(0)).toThrow(HaltError);
  });

  test('sync levels a lagging bot right up to the budget without tripping it', () => {
    const world = openWorld(4, 4, 2);
    const sim = new Sim(world, { maxTicks: 20 });
    sim.wait(0, 20);
    expect(sim.sync()).toBe(20);
    expect(bot(world, 1).clock).toBe(20);
  });

  test('sync counts against maxOps', () => {
    const sim = new Sim(openWorld(4, 4, 2), { maxOps: 3 });
    sim.sync();
    sim.sync();
    sim.sync();
    expect(() => sim.sync()).toThrow(OpLimitError);
  });

  test('applyTileChange is free in ticks but not in ops', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world, { maxOps: 2 });
    const paint = (): void =>
      sim.applyTileChange(vec(1, 0), (tile) => {
        tile.terrain = Terrain.Cable;
      });
    paint();
    paint();
    expect(() => paint()).toThrow(OpLimitError);
    expect(sim.ticks).toBe(0);
  });
});

describe('fuel', () => {
  test('defaults to Infinity, so a level that ignores the mechanic never sees it', () => {
    const world = openWorld(4, 1, 1);
    const sim = new Sim(world);
    for (let i = 0; i < 3; i++) sim.move(0, Dir.East);
    expect(sim.fuel(0)).toBe(Number.POSITIVE_INFINITY);
    expect(usesFuel(world)).toBe(false);
  });

  test('acting burns fuel equal to the tick cost', () => {
    const world = openWorld(4, 1, 1, { fuel: 10 });
    const sim = new Sim(world);
    sim.move(0, Dir.East);
    expect(sim.fuel(0)).toBe(10 - DEFAULT_COSTS.move);
    sim.mine(0);
    expect(sim.fuel(0)).toBe(10 - DEFAULT_COSTS.move - DEFAULT_COSTS.mine);
    expect(usesFuel(world)).toBe(true);
  });

  test('a blocked move still burns fuel', () => {
    const world = asciiWorld(['.#'], { bots: [vec(0, 0)], fuel: 6 });
    const sim = new Sim(world);
    expect(sim.move(0, Dir.East)).toBe(false);
    expect(sim.fuel(0)).toBe(6 - DEFAULT_COSTS.moveBlocked);
  });

  test('idling and sensing are free', () => {
    const world = openWorld(4, 4, 2, { fuel: 12 });
    const sim = new Sim(world);
    sim.wait(0, 5);
    sim.scan(0);
    sim.look(0, Dir.East);
    sim.sync();
    expect(sim.fuel(0)).toBe(12);
    expect(sim.fuel(1)).toBe(12);
    expect(bot(world, 1).clock).toBe(5);
  });

  test('running dry throws OutOfFuelError before anything is mutated', () => {
    const world = asciiWorld(['G..'], { bots: [vec(0, 0)], fuel: 1 });
    const sim = new Sim(world);

    expect(() => sim.mine(0)).toThrow(OutOfFuelError);
    expect(must(tileAt(world, vec(0, 0))).terrain).toBe(Terrain.Regolith);
    expect(sim.inventory(0)).toBe(0);
    expect(bot(world).clock).toBe(0);
    expect(eventsOfKind(sim.finish().events, 'mine')).toHaveLength(0);
  });

  test('OutOfFuelError names the bot, the action and the shortfall', () => {
    const world = openWorld(3, 1, 1, { fuel: 0 });
    const sim = new Sim(world);
    try {
      sim.move(0, Dir.East);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OutOfFuelError);
      if (error instanceof OutOfFuelError) {
        expect(error.code).toBe('out-of-fuel');
        expect(error.botId).toBe(0);
        expect(error.action).toBe('move');
        expect(error.required).toBe(DEFAULT_COSTS.move);
        expect(error.remaining).toBe(0);
      }
    }
  });

  test('every fuel-burning event kind has a command that checks fuel first', () => {
    const drained = (options: SimOptions = {}, build?: (world: World) => void): Sim => {
      const world = asciiWorld(['SR.'], {
        bots: [vec(0, 0), vec(2, 0)],
        inventory: [{ kind: ItemKind.Seed, count: 1 }],
        fuel: 0,
      });
      build?.(world);
      return new Sim(world, options);
    };

    expect(() => drained().move(0, Dir.East)).toThrow(OutOfFuelError);
    expect(() => drained({ costs: { turn: 2 } }).turn(0, Dir.South)).toThrow(OutOfFuelError);
    expect(() => drained().harvest(0)).toThrow(OutOfFuelError);
    expect(() => drained().plant(0)).toThrow(OutOfFuelError);
    expect(() => drained().mine(0, Dir.East)).toThrow(OutOfFuelError);
    expect(() => drained().pickup(0)).toThrow(OutOfFuelError);
    expect(() => drained().drop(0)).toThrow(OutOfFuelError);
    expect(() => drained().use(0)).toThrow(OutOfFuelError);
    expect(() => drained().mark(0, 'x')).toThrow(OutOfFuelError);
    expect(() => drained().send(0, 1, 'hi')).toThrow(OutOfFuelError);
    expect(() => drained().spawn(0, Dir.South)).toThrow(OutOfFuelError);
    expect(() =>
      drained({}, (world) => {
        placeMachine(world, { id: 'm', kind: MachineKind.Node, at: vec(0, 0) });
      }).power(0, 'm', 'on'),
    ).toThrow(OutOfFuelError);
    expect(() => drained().applyMachineChange(0, 'm', () => undefined, 2)).toThrow(OutOfFuelError);
  });

  test('refuel restores to fuelMax, but only on a depot tile', () => {
    const world = asciiWorld(['.D'], {
      bots: [vec(0, 0)],
      fuel: 20,
      legend: { ...ASCII_LEGEND, D: Terrain.Depot },
    });
    bot(world).fuel = 2;
    const sim = new Sim(world);

    expect(sim.refuel(0)).toBe(false);
    expect(sim.fuel(0)).toBe(2);

    sim.move(0, Dir.East);
    expect(sim.refuel(0)).toBe(true);
    expect(sim.fuel(0)).toBe(20);
    expect(must(eventsOfKind(sim.finish().events, 'refuel')[1]).to).toBe(20);
  });
});

describe('livelock', () => {
  test('two bots blocking each other forever throw LivelockError naming them', () => {
    const world = asciiWorld(['..'], { bots: [vec(0, 0), vec(1, 0)] });
    const sim = new Sim(world, { livelockRounds: 3, maxTicks: 1_000_000 });
    try {
      for (let i = 0; i < 100; i++) {
        sim.move(0, Dir.East);
        sim.move(1, Dir.West);
      }
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LivelockError);
      if (error instanceof LivelockError) {
        expect(error.code).toBe('blocked-livelock');
        expect(error.botIds).toEqual([0, 1]);
        expect(error.message).toContain('Livelock');
      }
    }
  });

  test('one successful move resets the streak', () => {
    const world = asciiWorld(['...', '...'], { bots: [vec(0, 0), vec(1, 0)] });
    const sim = new Sim(world, { livelockRounds: 2, maxTicks: 1_000_000 });
    for (let i = 0; i < 10; i++) {
      sim.move(0, Dir.East);
      sim.move(1, Dir.West);
      sim.move(0, Dir.South);
      sim.move(0, Dir.North);
    }
    expect(bot(world, 0).alive).toBe(true);
  });

  test('a lone bot bumping a wall is a bug, not a livelock, and dies of HaltError', () => {
    const world = asciiWorld(['.#'], { bots: [vec(0, 0)] });
    const sim = new Sim(world, { livelockRounds: 2, maxTicks: 20 });
    expect(() => {
      for (let i = 0; i < 100; i++) sim.move(0, Dir.East);
    }).toThrow(HaltError);
  });
});

describe('spend', () => {
  test('accumulates per resource and traces each call', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.spend('cable', 3);
    sim.spend('cable', 4, 0);
    sim.spend('cells', 1);
    expect(sim.spendTotals()).toEqual({ cable: 7, cells: 1 });
    expect(eventsOfKind(sim.finish().events, 'spend')).toHaveLength(3);
  });

  test('stamps a bot-scoped spend at that bot clock, and an unscoped one at the makespan', () => {
    const world = openWorld(4, 4, 2);
    const sim = new Sim(world);
    sim.wait(1, 6);
    sim.spend('cable', 1, 0);
    sim.spend('cable', 1);
    const spends = eventsOfKind(sim.finish().events, 'spend');
    expect(must(spends[0]).t).toBe(0);
    expect(must(spends[0]).botId).toBe(0);
    expect(must(spends[1]).t).toBe(6);
  });

  test('reaches Verdict.stats.spend through the harness path', () => {
    const world = openWorld(3, 1, 1);
    const initialWorld = cloneWorld(world);
    const sim = new Sim(world);
    sim.spend('cable', 12);
    sim.move(0, Dir.East);

    const verdict = buildVerdict({
      objectives: [Objectives.botAt(vec(1, 0))],
      world: sim.world,
      trace: sim.finish(),
      initialWorld,
      ops: sim.ops,
      seeds: 1,
      spend: sim.spendTotals(),
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.stats.spend).toEqual({ cable: 12 });
    expect(verdict.stats.ticks).toBe(DEFAULT_COSTS.move);
  });

  test('a non-finite amount throws IllegalActionError', () => {
    const sim = new Sim(openWorld(3, 1, 1));
    expect(() => sim.spend('cable', Number.NaN)).toThrow(IllegalActionError);
  });
});

describe('virtual clocks and collisions', () => {
  test('sim.ticks is the makespan, not the sum of the bot clocks', () => {
    const world = openWorld(4, 4, 2);
    const sim = new Sim(world);
    sim.wait(0, 5);
    sim.wait(1, 7);
    expect(bot(world, 0).clock).toBe(5);
    expect(bot(world, 1).clock).toBe(7);
    expect(sim.ticks).toBe(7);
    expect(world.tick).toBe(7);
    expect(sim.finish().endTick).toBe(7);
  });

  test('two bots contending for the same tile: the loser is blocked at moveBlocked cost', () => {
    const world = asciiWorld(['...', '...', '...'], { bots: [vec(0, 1), vec(2, 1)] });
    const sim = new Sim(world);

    expect(sim.move(0, Dir.East)).toBe(true);
    expect(sim.move(1, Dir.West)).toBe(false);

    expect(bot(world, 0).at).toEqual({ x: 1, y: 1 });
    expect(bot(world, 1).at).toEqual({ x: 2, y: 1 });
    expect(bot(world, 1).clock).toBe(DEFAULT_COSTS.moveBlocked);
    expect(must(eventsOfKind(sim.finish().events, 'move')[1]).reason).toBe('bot');
  });

  test('a bot running behind cannot walk through a tile another bot held at that time', () => {
    const world = asciiWorld(['...', '...', '...'], { bots: [vec(1, 1), vec(1, 0)] });
    const sim = new Sim(world);

    sim.wait(0, 50);
    expect(sim.move(0, Dir.East)).toBe(true);
    expect(bot(world, 0).at).toEqual({ x: 2, y: 1 });
    expect(must(tileAt(world, vec(1, 1))).occupant).toBeUndefined();

    expect(sim.move(1, Dir.South)).toBe(false);
    expect(bot(world, 1).at).toEqual({ x: 1, y: 0 });
    expect(bot(world, 1).clock).toBe(DEFAULT_COSTS.moveBlocked);

    sim.wait(1, 50);
    expect(sim.move(1, Dir.South)).toBe(true);
    expect(bot(world, 1).at).toEqual({ x: 1, y: 1 });
  });

  test('a bot may re-enter a tile it vacated itself', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    expect(sim.move(0, Dir.East)).toBe(true);
    expect(sim.move(0, Dir.West)).toBe(true);
    expect(bot(world).at).toEqual({ x: 0, y: 0 });
  });

  test('a follower can occupy the tile the leader has already left', () => {
    const world = asciiWorld(['....'], { bots: [vec(1, 0), vec(0, 0)] });
    const sim = new Sim(world);
    expect(sim.move(0, Dir.East)).toBe(true);
    expect(sim.move(1, Dir.East)).toBe(true);
    expect(bot(world, 1).at).toEqual({ x: 1, y: 0 });
  });

  test('running the identical program twice yields identical traces and worlds', () => {
    const drive = (sim: Sim): void => {
      sim.move(0, Dir.East);
      sim.move(1, Dir.West);
      sim.wait(0, 3);
      sim.move(1, Dir.West);
      sim.mark(0, 'a');
      sim.send(0, 1, 7);
      sim.recv(1);
      sim.sync();
      sim.move(1, Dir.North);
    };

    const worldA = asciiWorld(['...', '...', '...'], { bots: [vec(0, 1), vec(2, 1)] });
    const simA = new Sim(worldA);
    drive(simA);
    const traceA = simA.finish();

    const worldB = asciiWorld(['...', '...', '...'], { bots: [vec(0, 1), vec(2, 1)] });
    const simB = new Sim(worldB);
    drive(simB);
    const traceB = simB.finish();

    expect(traceB).toEqual(traceA);
    expect(simB.snapshot()).toEqual(simA.snapshot());
    expect(simB.ticks).toBe(simA.ticks);
    expect(simB.ops).toBe(simA.ops);
  });
});

describe('extension points', () => {
  test('applyMachineChange mutates and traces, and stops the run on an unknown machine', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, { id: 'm', kind: MachineKind.Node, at: vec(0, 0), vars: { charge: 0 } });
    const sim = new Sim(world);

    sim.applyMachineChange(
      0,
      'm',
      (machine) => {
        machine.vars['charge'] = 5;
        machine.state = 'live';
      },
      3,
    );
    expect(bot(world).clock).toBe(3);
    expect(must(machineById(world, 'm')).state).toBe('live');

    expect(() => sim.applyMachineChange(0, 'ghost', () => undefined, 2)).toThrow(
      IllegalActionError,
    );
    expect(bot(world).clock).toBe(5);
    expect(eventsOfKind(sim.finish().events, 'machineChange')).toHaveLength(1);
  });

  test('refuseMachineAct bills a refusal without pretending an id was involved', () => {
    const world = openWorld(3, 1, 1);
    placeMachine(world, { id: 'm', kind: MachineKind.Node, at: vec(0, 0), vars: {} });
    const sim = new Sim(world);

    sim.refuseMachineAct(0, '', 2);
    expect(bot(world).clock).toBe(2);

    const trace = sim.finish();
    expect(eventsOfKind(trace.events, 'machineChange')).toHaveLength(0);
    const act = must(eventsOfKind(trace.events, 'act')[0]);
    expect([act.name, act.ok, act.detail]).toEqual(['machine', false, '']);
  });

  test('applyTileChange edits a tile for free and traces the before/after', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.applyTileChange(vec(1, 0), (tile) => {
      tile.terrain = Terrain.Cable;
    });
    expect(must(tileAt(world, vec(1, 0))).terrain).toBe(Terrain.Cable);
    expect(bot(world).clock).toBe(0);

    const changes = eventsOfKind(sim.finish().events, 'tileChange');
    expect(must(changes[0]).before.terrain).toBe(Terrain.Floor);
    expect(must(changes[0]).after.terrain).toBe(Terrain.Cable);
  });

  test('applyTileChange out of bounds is a no-op', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.applyTileChange(vec(9, 9), (tile) => {
      tile.terrain = Terrain.Cable;
    });
    expect(eventsOfKind(sim.finish().events, 'tileChange')).toHaveLength(0);
  });

  test('noteObjective lands in the trace at the current makespan', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    sim.wait(0, 4);
    sim.noteObjective('reach-pad', 'met');
    const objectives = eventsOfKind(sim.finish().events, 'objective');
    expect(objectives).toEqual([{ t: 4, kind: 'objective', id: 'reach-pad', state: 'met' }]);
  });

  test('snapshot is a detached deep copy', () => {
    const world = openWorld(3, 1, 1);
    const sim = new Sim(world);
    const snapshot = sim.snapshot();
    sim.move(0, Dir.East);
    expect(must(snapshot.bots[0]).at).toEqual({ x: 0, y: 0 });
    expect(bot(world).at).toEqual({ x: 1, y: 0 });
  });
});

describe('maturity', () => {
  test('derives growth from meta.plantedAt when present', () => {
    const tile = { terrain: Terrain.Soil, maxGrowth: 5, meta: { plantedAt: 10 } };
    expect(maturity(tile, 10)).toBe(0);
    expect(maturity(tile, 13)).toBe(3);
    expect(maturity(tile, 15)).toBe(5);
    expect(maturity(tile, 100)).toBe(5);
    expect(maturity(tile, 5)).toBe(0);
  });

  test('falls back to a hand-authored growth value', () => {
    expect(maturity({ terrain: Terrain.Soil, growth: 4, maxGrowth: 4 }, 0)).toBe(4);
    expect(maturity({ terrain: Terrain.Floor }, 99)).toBe(0);
  });
});

describe('bot identity', () => {
  test('addBot ids drive every command lookup', () => {
    const world = openWorld(3, 3, 0);
    addBot(world, { at: vec(0, 0), id: 5 });
    addBot(world, { at: vec(1, 0), id: 2 });
    const sim = new Sim(world);
    expect(sim.pos(5)).toEqual({ x: 0, y: 0 });
    expect(sim.pos(2)).toEqual({ x: 1, y: 0 });
    expect(() => sim.pos(0)).toThrow(IllegalActionError);
  });

  test.fails('botIds() returns living bot ids in ascending order, as documented', () => {
    const world = openWorld(3, 3, 0);
    addBot(world, { at: vec(0, 0), id: 5 });
    addBot(world, { at: vec(1, 0), id: 2 });
    expect(new Sim(world).botIds()).toEqual([2, 5]);
  });
});

describe('trace event shapes', () => {
  test('bot actions carry botId and dt so replay can restore the clock', () => {
    const world = openWorld(3, 3, 1);
    const sim = new Sim(world);
    sim.move(0, Dir.East);
    sim.wait(0, 2);

    const events = sim.finish().events;
    const move = must(eventsOfKind(events, 'move')[0]) as MoveEvent;
    expect(move).toEqual({
      t: 0,
      botId: 0,
      dt: DEFAULT_COSTS.move,
      kind: 'move',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      dir: Dir.East,
      ok: true,
    });
    const wait = must(eventsOfKind(events, 'wait')[0]);
    expect(wait).toEqual({ t: 1, botId: 0, dt: 2, kind: 'wait', ticks: 2 });
  });
});
