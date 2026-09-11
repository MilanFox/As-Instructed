import { describe, expect, test } from 'vitest';
import type { ItemStack, Message, Tile } from '../index.ts';
import {
  ALL_DIRS,
  Dir,
  ItemKind,
  MachineKind,
  Rng,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  addToInventory,
  botAt,
  botById,
  cloneBot,
  cloneMachine,
  cloneTile,
  cloneWorld,
  countItemsAt,
  createWorld,
  dirBetween,
  dirDelta,
  dirName,
  enqueueMessage,
  eq,
  inBounds,
  indexOf,
  inventoryCount,
  isPassable,
  itemsAt,
  livingBots,
  machineAt,
  machineById,
  makespan,
  manhattan,
  neighbors,
  opposite,
  paintAscii,
  rebuildOccupancy,
  removeFromInventory,
  removeGroundItems,
  setTerrain,
  setTile,
  step,
  terrainProps,
  tileAt,
  vec,
} from '../index.ts';
import { ASCII_LEGEND, asciiWorld, must, openWorld, placeMachine } from './helpers.ts';

describe('geometry', () => {
  test('dirDelta respects "y grows South, North = y-1"', () => {
    expect(dirDelta(Dir.North)).toEqual({ x: 0, y: -1 });
    expect(dirDelta(Dir.East)).toEqual({ x: 1, y: 0 });
    expect(dirDelta(Dir.South)).toEqual({ x: 0, y: 1 });
    expect(dirDelta(Dir.West)).toEqual({ x: -1, y: 0 });
  });

  test('dirDelta hands back a fresh, mutable copy each call', () => {
    const first = dirDelta(Dir.North);
    first.y = 99;
    expect(dirDelta(Dir.North)).toEqual({ x: 0, y: -1 });
  });

  test('dirName', () => {
    expect(dirName(Dir.North)).toBe('North');
    expect(dirName(Dir.East)).toBe('East');
    expect(dirName(Dir.South)).toBe('South');
    expect(dirName(Dir.West)).toBe('West');
  });

  test('opposite pairs the cardinals', () => {
    expect(opposite(Dir.North)).toBe(Dir.South);
    expect(opposite(Dir.South)).toBe(Dir.North);
    expect(opposite(Dir.East)).toBe(Dir.West);
    expect(opposite(Dir.West)).toBe(Dir.East);
    for (const dir of ALL_DIRS) expect(opposite(opposite(dir))).toBe(dir);
  });

  test('step moves North towards y-1 and South towards y+1', () => {
    const from = vec(3, 3);
    expect(step(from, Dir.North)).toEqual({ x: 3, y: 2 });
    expect(step(from, Dir.South)).toEqual({ x: 3, y: 4 });
    expect(step(from, Dir.East)).toEqual({ x: 4, y: 3 });
    expect(step(from, Dir.West)).toEqual({ x: 2, y: 3 });
    expect(from).toEqual({ x: 3, y: 3 });
  });

  test('step then opposite returns to the start', () => {
    for (const dir of ALL_DIRS) {
      expect(step(step(vec(2, 2), dir), opposite(dir))).toEqual({ x: 2, y: 2 });
    }
  });

  test('eq and manhattan', () => {
    expect(eq(vec(1, 2), vec(1, 2))).toBe(true);
    expect(eq(vec(1, 2), vec(2, 1))).toBe(false);
    expect(manhattan(vec(0, 0), vec(3, 4))).toBe(7);
    expect(manhattan(vec(3, 4), vec(0, 0))).toBe(7);
    expect(manhattan(vec(2, 2), vec(2, 2))).toBe(0);
  });

  test('dirBetween finds the orthogonal step, and null otherwise', () => {
    expect(dirBetween(vec(1, 1), vec(1, 0))).toBe(Dir.North);
    expect(dirBetween(vec(1, 1), vec(2, 1))).toBe(Dir.East);
    expect(dirBetween(vec(1, 1), vec(1, 2))).toBe(Dir.South);
    expect(dirBetween(vec(1, 1), vec(0, 1))).toBe(Dir.West);
    expect(dirBetween(vec(1, 1), vec(2, 2))).toBeNull();
    expect(dirBetween(vec(1, 1), vec(1, 1))).toBeNull();
    expect(dirBetween(vec(1, 1), vec(1, 3))).toBeNull();
  });
});

describe('terrain', () => {
  test('terrainProps covers every declared terrain', () => {
    for (const terrain of Object.values(Terrain)) {
      expect(terrainProps(terrain)).toBeDefined();
    }
  });

  test('walkability matches the design table', () => {
    expect(terrainProps(Terrain.Floor).walkable).toBe(true);
    expect(terrainProps(Terrain.Wall).walkable).toBe(false);
    expect(terrainProps(Terrain.Void).walkable).toBe(false);
    expect(terrainProps(Terrain.Pit).walkable).toBe(true);
    expect(terrainProps(Terrain.Pit).lethal).toBe(true);
    expect(terrainProps(Terrain.Soil).plantable).toBe(true);
    expect(terrainProps(Terrain.Rock).mineable).toBe(true);
    expect(terrainProps(Terrain.Rock).minesTo).toBe(Terrain.Floor);
    expect(terrainProps(Terrain.Rock).yields).toBe(ItemKind.Stone);
    expect(terrainProps(Terrain.Wall).opaque).toBe(true);
  });
});

describe('createWorld', () => {
  test('builds a row-major tile array and seeds the rng', () => {
    const world = createWorld({ w: 4, h: 3, seed: 7, fill: Terrain.Regolith });
    expect(world.tiles).toHaveLength(12);
    expect(world.tiles.every((t) => t.terrain === Terrain.Regolith)).toBe(true);
    expect(world.rng).toBeInstanceOf(Rng);
    expect(world.rng.state).toBe(new Rng(7).state);
    expect(world.tick).toBe(0);
  });

  test('each tile is its own object', () => {
    const world = createWorld({ w: 2, h: 2 });
    must(world.tiles[0]).terrain = Terrain.Wall;
    expect(must(world.tiles[1]).terrain).toBe(Terrain.Floor);
  });

  test('rejects bad dimensions', () => {
    expect(() => createWorld({ w: 0, h: 3 })).toThrow(/bad dimensions/);
    expect(() => createWorld({ w: 3, h: -1 })).toThrow(/bad dimensions/);
    expect(() => createWorld({ w: 2.5, h: 3 })).toThrow(/bad dimensions/);
  });

  test('copies the vars bag rather than aliasing it', () => {
    const vars = { power: 3 };
    const world = createWorld({ w: 2, h: 2, vars });
    vars.power = 99;
    expect(world.vars).toEqual({ power: 3 });
  });
});

describe('indexOf / inBounds / tileAt', () => {
  const world = openWorld(4, 3, 0);

  test('indexOf is row-major (y * w + x)', () => {
    expect(indexOf(world, vec(0, 0))).toBe(0);
    expect(indexOf(world, vec(3, 0))).toBe(3);
    expect(indexOf(world, vec(0, 1))).toBe(4);
    expect(indexOf(world, vec(2, 2))).toBe(10);
  });

  test('inBounds', () => {
    expect(inBounds(world, vec(0, 0))).toBe(true);
    expect(inBounds(world, vec(3, 2))).toBe(true);
    expect(inBounds(world, vec(-1, 0))).toBe(false);
    expect(inBounds(world, vec(0, -1))).toBe(false);
    expect(inBounds(world, vec(4, 0))).toBe(false);
    expect(inBounds(world, vec(0, 3))).toBe(false);
  });

  test('tileAt returns undefined out of bounds', () => {
    expect(tileAt(world, vec(0, 0))).toBeDefined();
    expect(tileAt(world, vec(-1, 0))).toBeUndefined();
    expect(tileAt(world, vec(0, -1))).toBeUndefined();
    expect(tileAt(world, vec(4, 0))).toBeUndefined();
    expect(tileAt(world, vec(0, 3))).toBeUndefined();
    expect(tileAt(world, vec(100, 100))).toBeUndefined();
  });
});

describe('setTile / setTerrain', () => {
  test('setTile preserves an existing occupant', () => {
    const world = openWorld(3, 3, 1);
    expect(must(tileAt(world, vec(0, 0))).occupant).toBe(0);

    setTile(world, vec(0, 0), { terrain: Terrain.Pad });
    const after = must(tileAt(world, vec(0, 0)));
    expect(after.terrain).toBe(Terrain.Pad);
    expect(after.occupant).toBe(0);
  });

  test('setTile keeps an explicitly named occupant', () => {
    const world = openWorld(3, 3, 2);
    setTile(world, vec(0, 0), { terrain: Terrain.Pad, occupant: 1 });
    expect(must(tileAt(world, vec(0, 0))).occupant).toBe(1);
  });

  test('setTile replaces the tile wholesale, dropping unrelated fields', () => {
    const world = openWorld(3, 3, 0);
    setTile(world, vec(1, 1), { terrain: Terrain.Soil, mark: 'x', growth: 4 });
    setTile(world, vec(1, 1), { terrain: Terrain.Floor });
    const after = must(tileAt(world, vec(1, 1)));
    expect(after.mark).toBeUndefined();
    expect(after.growth).toBeUndefined();
  });

  test('setTile throws out of bounds', () => {
    const world = openWorld(3, 3, 0);
    expect(() => setTile(world, vec(9, 9), { terrain: Terrain.Floor })).toThrow(/out of bounds/);
  });

  test('setTerrain edits in place and throws out of bounds', () => {
    const world = openWorld(3, 3, 0);
    setTile(world, vec(1, 1), { terrain: Terrain.Floor, mark: 'keep' });
    setTerrain(world, vec(1, 1), Terrain.Wall);
    const after = must(tileAt(world, vec(1, 1)));
    expect(after.terrain).toBe(Terrain.Wall);
    expect(after.mark).toBe('keep');
    expect(() => setTerrain(world, vec(-1, 0), Terrain.Wall)).toThrow(/out of bounds/);
  });
});

describe('neighbors', () => {
  test('returns N, E, S, W in Dir order', () => {
    const world = openWorld(3, 3, 0);
    expect(neighbors(world, vec(1, 1))).toEqual([
      { dir: Dir.North, pos: { x: 1, y: 0 } },
      { dir: Dir.East, pos: { x: 2, y: 1 } },
      { dir: Dir.South, pos: { x: 1, y: 2 } },
      { dir: Dir.West, pos: { x: 0, y: 1 } },
    ]);
  });

  test('clips at the edges', () => {
    const world = openWorld(3, 3, 0);
    expect(neighbors(world, vec(0, 0))).toEqual([
      { dir: Dir.East, pos: { x: 1, y: 0 } },
      { dir: Dir.South, pos: { x: 0, y: 1 } },
    ]);
    expect(neighbors(world, vec(2, 2))).toEqual([
      { dir: Dir.North, pos: { x: 2, y: 1 } },
      { dir: Dir.West, pos: { x: 1, y: 2 } },
    ]);
  });

  test('a 1x1 world has no neighbours', () => {
    expect(neighbors(openWorld(1, 1, 0), vec(0, 0))).toEqual([]);
  });
});

describe('isPassable', () => {
  test('is terrain-only and ignores bots', () => {
    const world = asciiWorld(['.#.'], { bots: [vec(2, 0)] });
    expect(isPassable(world, vec(0, 0))).toBe(true);
    expect(isPassable(world, vec(1, 0))).toBe(false);
    expect(isPassable(world, vec(2, 0))).toBe(true);
    expect(isPassable(world, vec(3, 0))).toBe(false);
  });
});

describe('paintAscii', () => {
  test('paints terrain row by row with y growing South', () => {
    const world = asciiWorld(['###', '#.#', '#P#']);
    expect(must(tileAt(world, vec(1, 1))).terrain).toBe(Terrain.Floor);
    expect(must(tileAt(world, vec(1, 2))).terrain).toBe(Terrain.Pad);
    expect(must(tileAt(world, vec(0, 0))).terrain).toBe(Terrain.Wall);
  });

  test('accepts a tile factory in the legend', () => {
    const world = createWorld({ w: 2, h: 1 });
    paintAscii(world, ['.S'], {
      '.': Terrain.Floor,
      S: (): Tile => ({ terrain: Terrain.Soil, growth: 0, maxGrowth: 5, crop: ItemKind.Crop }),
    });
    const tile = must(tileAt(world, vec(1, 0)));
    expect(tile.terrain).toBe(Terrain.Soil);
    expect(tile.maxGrowth).toBe(5);
    expect(tile.crop).toBe(ItemKind.Crop);
  });

  test('preserves occupancy of already-placed bots', () => {
    const world = openWorld(3, 1, 1);
    paintAscii(world, ['...'], ASCII_LEGEND);
    expect(must(tileAt(world, vec(0, 0))).occupant).toBe(0);
  });

  test('throws on an unknown legend character', () => {
    const world = createWorld({ w: 2, h: 1 });
    expect(() => paintAscii(world, ['?.'], { '.': Terrain.Floor })).toThrow(/no legend entry/);
  });
});

describe('bots', () => {
  test('addBot wires up occupancy and defaults', () => {
    const world = createWorld({ w: 3, h: 3 });
    const first = addBot(world, { at: vec(1, 1) });
    expect(first.id).toBe(0);
    expect(first.name).toBe('bot-0');
    expect(first.facing).toBe(Dir.East);
    expect(first.capacity).toBe(8);
    expect(first.clock).toBe(0);
    expect(first.alive).toBe(true);
    expect(must(tileAt(world, vec(1, 1))).occupant).toBe(0);
  });

  test('addBot copies its position and inventory rather than aliasing them', () => {
    const world = createWorld({ w: 3, h: 3 });
    const at = vec(1, 1);
    const inventory: ItemStack[] = [{ kind: ItemKind.Seed, count: 2 }];
    const created = addBot(world, { at, inventory });
    at.x = 99;
    inventory[0] = { kind: ItemKind.Ore, count: 99 };
    expect(created.at).toEqual({ x: 1, y: 1 });
    expect(created.inventory).toEqual([{ kind: ItemKind.Seed, count: 2 }]);
  });

  test('addBot rejects a duplicate id', () => {
    const world = createWorld({ w: 3, h: 3 });
    addBot(world, { at: vec(0, 0), id: 4 });
    expect(() => addBot(world, { at: vec(1, 0), id: 4 })).toThrow(/duplicate bot id/);
  });

  test('botAt, botById and livingBots', () => {
    const world = openWorld(3, 3, 2);
    expect(must(botAt(world, vec(0, 0))).id).toBe(0);
    expect(must(botAt(world, vec(1, 0))).id).toBe(1);
    expect(botAt(world, vec(2, 2))).toBeUndefined();
    expect(must(botById(world, 1)).id).toBe(1);
    expect(botById(world, 9)).toBeUndefined();

    must(world.bots[1]).alive = false;
    expect(livingBots(world).map((b) => b.id)).toEqual([0]);
    expect(botAt(world, vec(1, 0))).toBeUndefined();
  });

  test('makespan is max(bot.clock)', () => {
    const world = openWorld(3, 3, 3);
    expect(makespan(world)).toBe(0);
    must(world.bots[0]).clock = 4;
    must(world.bots[1]).clock = 11;
    must(world.bots[2]).clock = 7;
    expect(makespan(world)).toBe(11);
  });
});

describe('enqueueMessage', () => {
  test('orders by send time so a live inbox and a replayed one agree', () => {
    const bot = { inbox: [] as Message[] };
    enqueueMessage(bot, { from: 0, body: 'late', t: 40 });
    enqueueMessage(bot, { from: 1, body: 'early', t: 0 });
    enqueueMessage(bot, { from: 2, body: 'middle', t: 12 });
    expect(bot.inbox.map((m) => m.body)).toEqual(['early', 'middle', 'late']);
  });

  test('breaks ties on sender id, then keeps insertion order', () => {
    const bot = { inbox: [] as Message[] };
    enqueueMessage(bot, { from: 3, body: 'c', t: 5 });
    enqueueMessage(bot, { from: 1, body: 'a', t: 5 });
    enqueueMessage(bot, { from: 1, body: 'b', t: 5 });
    expect(bot.inbox.map((m) => m.body)).toEqual(['a', 'b', 'c']);
  });
});

describe('ground items', () => {
  test('addGroundItems merges into an existing stack of the same kind', () => {
    const world = openWorld(3, 3, 0);
    addGroundItems(world, vec(1, 1), ItemKind.Stone, 2);
    addGroundItems(world, vec(1, 1), ItemKind.Stone, 3);
    expect(world.items).toHaveLength(1);
    expect(countItemsAt(world, vec(1, 1), ItemKind.Stone)).toBe(5);
  });

  test('addGroundItems keeps different kinds and positions apart', () => {
    const world = openWorld(3, 3, 0);
    addGroundItems(world, vec(1, 1), ItemKind.Stone, 2);
    addGroundItems(world, vec(1, 1), ItemKind.Ore, 1);
    addGroundItems(world, vec(2, 2), ItemKind.Stone, 4);
    expect(world.items).toHaveLength(3);
    expect(countItemsAt(world, vec(1, 1))).toBe(3);
    expect(countItemsAt(world, vec(2, 2))).toBe(4);
    expect(itemsAt(world, vec(1, 1)).map((s) => s.kind)).toEqual([ItemKind.Stone, ItemKind.Ore]);
  });

  test('addGroundItems ignores non-positive counts', () => {
    const world = openWorld(3, 3, 0);
    addGroundItems(world, vec(0, 0), ItemKind.Stone, 0);
    addGroundItems(world, vec(0, 0), ItemKind.Stone, -3);
    expect(world.items).toHaveLength(0);
  });

  test('removeGroundItems removes partially and reports what it took', () => {
    const world = openWorld(3, 3, 0);
    addGroundItems(world, vec(1, 1), ItemKind.Stone, 5);
    expect(removeGroundItems(world, vec(1, 1), ItemKind.Stone, 2)).toBe(2);
    expect(countItemsAt(world, vec(1, 1), ItemKind.Stone)).toBe(3);
    expect(world.items).toHaveLength(1);
  });

  test('removeGroundItems cleans up an emptied stack and clamps over-removal', () => {
    const world = openWorld(3, 3, 0);
    addGroundItems(world, vec(1, 1), ItemKind.Stone, 2);
    addGroundItems(world, vec(1, 1), ItemKind.Ore, 1);
    expect(removeGroundItems(world, vec(1, 1), ItemKind.Stone, 10)).toBe(2);
    expect(world.items).toHaveLength(1);
    expect(must(world.items[0]).kind).toBe(ItemKind.Ore);
  });

  test('removeGroundItems on an empty tile takes nothing', () => {
    const world = openWorld(3, 3, 0);
    expect(removeGroundItems(world, vec(2, 2), ItemKind.Stone, 3)).toBe(0);
  });

  test('itemsAt hides zero-count stacks', () => {
    const world = openWorld(3, 3, 0);
    world.items.push({ kind: ItemKind.Stone, count: 0, at: vec(0, 0) });
    expect(itemsAt(world, vec(0, 0))).toEqual([]);
    expect(countItemsAt(world, vec(0, 0))).toBe(0);
  });
});

describe('inventory', () => {
  test('addToInventory merges and ignores non-positive counts', () => {
    const holder = { inventory: [] as { kind: ItemKind; count: number }[] };
    addToInventory(holder, ItemKind.Ore, 2);
    addToInventory(holder, ItemKind.Ore, 3);
    addToInventory(holder, ItemKind.Seed, 1);
    addToInventory(holder, ItemKind.Chip, 0);
    addToInventory(holder, ItemKind.Chip, -4);
    expect(holder.inventory).toEqual([
      { kind: ItemKind.Ore, count: 5 },
      { kind: ItemKind.Seed, count: 1 },
    ]);
  });

  test('inventoryCount totals everything or one kind', () => {
    const holder = {
      inventory: [
        { kind: ItemKind.Ore, count: 5 },
        { kind: ItemKind.Seed, count: 2 },
      ],
    };
    expect(inventoryCount(holder)).toBe(7);
    expect(inventoryCount(holder, ItemKind.Ore)).toBe(5);
    expect(inventoryCount(holder, ItemKind.Crate)).toBe(0);
  });

  test('removeFromInventory removes partially, drops emptied stacks, and clamps', () => {
    const holder = {
      inventory: [
        { kind: ItemKind.Ore, count: 5 },
        { kind: ItemKind.Seed, count: 2 },
      ],
    };
    expect(removeFromInventory(holder, ItemKind.Ore, 2)).toBe(2);
    expect(inventoryCount(holder, ItemKind.Ore)).toBe(3);
    expect(removeFromInventory(holder, ItemKind.Ore, 99)).toBe(3);
    expect(holder.inventory).toEqual([{ kind: ItemKind.Seed, count: 2 }]);
    expect(removeFromInventory(holder, ItemKind.Ore, 1)).toBe(0);
  });
});

describe('machines', () => {
  test('addMachine rejects duplicate ids and machineById / machineAt find them', () => {
    const world = openWorld(3, 3, 0);
    placeMachine(world, { id: 'door-1', kind: MachineKind.Door, at: vec(1, 1) });
    expect(must(machineById(world, 'door-1')).kind).toBe(MachineKind.Door);
    expect(must(machineAt(world, vec(1, 1))).id).toBe('door-1');
    expect(machineAt(world, vec(0, 0))).toBeUndefined();
    expect(machineById(world, 'nope')).toBeUndefined();
    expect(() =>
      addMachine(world, {
        id: 'door-1',
        kind: MachineKind.Lever,
        at: vec(2, 2),
        state: 'off',
        inventory: [],
        vars: {},
      }),
    ).toThrow(/duplicate machine id/);
  });
});

describe('rebuildOccupancy', () => {
  test('recomputes every occupant from world.bots', () => {
    const world = openWorld(3, 3, 2);
    must(world.bots[0]).at = vec(2, 2);
    must(tileAt(world, vec(0, 1))).occupant = 42;

    rebuildOccupancy(world);

    expect(must(tileAt(world, vec(2, 2))).occupant).toBe(0);
    expect(must(tileAt(world, vec(0, 0))).occupant).toBeUndefined();
    expect(must(tileAt(world, vec(0, 1))).occupant).toBeUndefined();
    expect(must(tileAt(world, vec(1, 0))).occupant).toBe(1);
  });

  test('skips dead bots', () => {
    const world = openWorld(3, 3, 2);
    must(world.bots[1]).alive = false;
    rebuildOccupancy(world);
    expect(must(tileAt(world, vec(1, 0))).occupant).toBeUndefined();
    expect(must(tileAt(world, vec(0, 0))).occupant).toBe(0);
  });

  test('ignores bots standing outside the grid', () => {
    const world = openWorld(3, 3, 1);
    must(world.bots[0]).at = vec(9, 9);
    expect(() => rebuildOccupancy(world)).not.toThrow();
    expect(world.tiles.every((t) => t.occupant === undefined)).toBe(true);
  });
});

describe('shallow clone helpers', () => {
  test('cloneTile copies meta and omits absent optionals', () => {
    const tile: Tile = {
      terrain: Terrain.Soil,
      growth: 2,
      maxGrowth: 5,
      crop: ItemKind.Crop,
      occupant: 3,
      mark: 'here',
      meta: { plantedAt: 4 },
    };
    const copy = cloneTile(tile);
    expect(copy).toEqual(tile);
    expect(copy.meta).not.toBe(tile.meta);
    must(copy.meta)['plantedAt'] = 99;
    expect(must(tile.meta)['plantedAt']).toBe(4);
    expect(Object.keys(cloneTile({ terrain: Terrain.Floor }))).toEqual(['terrain']);
  });

  test('cloneBot deep-copies position, inventory, vars and inbox', () => {
    const world = openWorld(2, 2, 1);
    const original = must(world.bots[0]);
    original.inventory = [{ kind: ItemKind.Ore, count: 2 }];
    original.vars = { mode: 1 };
    original.inbox = [{ from: 1, body: 'hi', t: 3 }];

    const copy = cloneBot(original);
    copy.at.x = 9;
    must(copy.inventory[0]).count = 99;
    copy.vars['mode'] = 99;
    must(copy.inbox[0]).body = 'nope';

    expect(original.at).toEqual({ x: 0, y: 0 });
    expect(must(original.inventory[0]).count).toBe(2);
    expect(original.vars).toEqual({ mode: 1 });
    expect(must(original.inbox[0]).body).toBe('hi');
  });

  test('cloneMachine deep-copies vars, links, cycle and inventory', () => {
    const world = openWorld(3, 3, 0);
    const original = placeMachine(world, {
      id: 'm',
      kind: MachineKind.Door,
      at: vec(1, 1),
      state: 'closed',
      cycle: ['closed', 'open'],
      links: [vec(2, 1)],
      vars: { charge: 1 },
      inventory: [{ kind: ItemKind.Cell, count: 1 }],
      facing: Dir.North,
    });

    const copy = cloneMachine(original);
    expect(copy).toEqual(original);
    copy.at.x = 9;
    copy.vars['charge'] = 9;
    must(copy.links)[0] = vec(9, 9);
    must(copy.cycle)[0] = 'nope';
    must(copy.inventory[0]).count = 9;

    expect(original.at).toEqual({ x: 1, y: 1 });
    expect(original.vars).toEqual({ charge: 1 });
    expect(must(original.links)[0]).toEqual({ x: 2, y: 1 });
    expect(must(original.cycle)[0]).toBe('closed');
    expect(must(original.inventory[0]).count).toBe(1);
  });
});

describe('cloneWorld is a genuine deep copy', () => {
  function fullWorld() {
    const world = asciiWorld(['...', '.S.', '..#'], { bots: [vec(0, 0), vec(2, 0)] });
    world.vars['quota'] = 5;
    setTile(world, vec(1, 1), {
      terrain: Terrain.Soil,
      growth: 1,
      maxGrowth: 4,
      crop: ItemKind.Crop,
      mark: 'field',
      meta: { plantedAt: 2, label: 'north-forty' },
    });
    addGroundItems(world, vec(2, 1), ItemKind.Crate, 3);
    must(world.bots[0]).inventory = [{ kind: ItemKind.Seed, count: 2 }];
    must(world.bots[0]).inbox = [{ from: 1, body: 'go', t: 0 }];
    must(world.bots[0]).vars['mode'] = 1;
    placeMachine(world, {
      id: 'door-1',
      kind: MachineKind.Door,
      at: vec(2, 2),
      state: 'closed',
      cycle: ['closed', 'open'],
      links: [vec(1, 2)],
      vars: { charge: 2 },
      inventory: [{ kind: ItemKind.Cell, count: 1 }],
    });
    return world;
  }

  test('the clone equals the original', () => {
    const world = fullWorld();
    expect(cloneWorld(world)).toEqual(world);
  });

  test('mutating every nested structure on the clone leaves the original untouched', () => {
    const world = fullWorld();
    const before = cloneWorld(world);
    const copy = cloneWorld(world);

    must(copy.tiles[0]).terrain = Terrain.Ore;
    const field = must(tileAt(copy, vec(1, 1)));
    field.growth = 99;
    field.mark = 'vandalised';
    must(field.meta)['plantedAt'] = 99;
    must(field.meta)['label'] = 'nope';
    copy.tiles.push({ terrain: Terrain.Void });

    const clonedBot = must(copy.bots[0]);
    clonedBot.at.x = 9;
    clonedBot.at.y = 9;
    clonedBot.clock = 99;
    clonedBot.alive = false;
    must(clonedBot.inventory[0]).count = 99;
    clonedBot.inventory.push({ kind: ItemKind.Ore, count: 1 });
    must(clonedBot.inbox[0]).body = 'nope';
    clonedBot.inbox.push({ from: 9, body: 9, t: 9 });
    clonedBot.vars['mode'] = 99;
    copy.bots.push(cloneBot(clonedBot));

    const stack = must(copy.items[0]);
    stack.count = 99;
    stack.at.x = 9;
    copy.items.push({ kind: ItemKind.Chip, count: 1, at: vec(0, 0) });

    const clonedMachine = must(copy.machines[0]);
    clonedMachine.state = 'open';
    clonedMachine.at.y = 9;
    clonedMachine.vars['charge'] = 99;
    must(clonedMachine.links)[0] = vec(9, 9);
    must(clonedMachine.cycle).push('jammed');
    must(clonedMachine.inventory[0]).count = 99;
    copy.machines.push(cloneMachine(clonedMachine));

    copy.tick = 99;
    copy.vars['quota'] = 99;
    copy.vars['extra'] = 1;

    copy.rng.next();

    expect(world).toEqual(before);
  });

  test('clone.rng is a real Rng whose next() matches the original', () => {
    const world = fullWorld();
    world.rng.next();
    const copy = cloneWorld(world);

    expect(copy.rng).toBeInstanceOf(Rng);
    expect(copy.rng).not.toBe(world.rng);
    expect(copy.rng.state).toBe(world.rng.state);

    const fromCopy = Array.from({ length: 10 }, () => copy.rng.next());
    const fromOriginal = Array.from({ length: 10 }, () => world.rng.next());
    expect(fromCopy).toEqual(fromOriginal);
  });

  test('clone.rng advances independently of the original', () => {
    const world = fullWorld();
    const copy = cloneWorld(world);
    copy.rng.next();
    expect(world.rng.state).not.toBe(copy.rng.state);
  });
});
