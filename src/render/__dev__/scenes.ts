/**
 * Demo scenes for the renderer harness. Dev-only: nothing here is reachable from `src/main.tsx`.
 *
 * Every scene produces a *real* Trace by driving the real `Sim`, because a renderer verified
 * against a hand-written fake trace is a renderer verified against nothing.
 */

import {
  Dir,
  Sim,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  cloneWorld,
  createWorld,
  paintAscii,
  rebuildOccupancy,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { ItemKind, MachineKind, Trace, World } from '../../engine/index.ts';
import { w1_01 } from '../../levels/world-1/w1-01.ts';
import { solution as w1_01_solution } from '../../levels/world-1/__solutions__/w1-01.ts';

export interface Scene {
  id: string;
  label: string;
  world: number;
  trace: Trace;
  /** Cells the objective is about, for `Renderer.setHighlights`. */
  highlights: { x: number; y: number }[];
}

function finish(world: World, drive: (sim: Sim) => void): Trace {
  const sim = new Sim(world, { maxTicks: 60_000, maxOps: 5_000_000, livelockRounds: 1_000 });
  try {
    drive(sim);
  } catch (error) {
    console.warn('[scenes] driver stopped early:', error);
  }
  return sim.finish();
}

/** The real tutorial level, run through its real reference solution. */
export function sceneW101(): Scene {
  const world = w1_01.build(1);
  const trace = finish(world, (sim) => {
    const botId = sim.world.bots[0]?.id ?? 0;
    w1_01_solution.run(sim, botId);
    // A deliberate wall bump after the solution, so the harness always shows the blocked-move
    // treatment required by DESIGN.md §11 A5.
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.North);
    sim.move(botId, Dir.West);
  });
  return { id: 'w1-01', label: 'w1-01 · reference solution', world: 1, trace, highlights: [vec(5, 2)] };
}

/** Every `MachineKind`, each in the state a level most often parks it in. */
const MACHINE_ROW: readonly (readonly [MachineKind, string])[] = [
  ['door', 'closed'],
  ['lever', 'off'],
  ['furnace', 'busy'],
  ['press', 'idle'],
  ['sink', 'idle'],
  ['source', 'on'],
  ['node', 'on'],
  ['antenna', 'idle'],
  ['charger', 'on'],
  ['router', 'idle'],
];

/** Every `ItemKind`. */
const ITEM_ROW: readonly ItemKind[] = [
  'regolith',
  'stone',
  'ore',
  'ice',
  'scrap',
  'seed',
  'crop',
  'crate',
  'part',
  'cell',
  'chip',
];

const SHOWCASE_MAP = [
  '##############',
  '#....#.......#',
  '#.,,,#..o.r..#',
  '#.,,,#.......#',
  '#....D...c...#',
  '#.p..#...c...#',
  '#....#...c...#',
  '#............#',
  '##############',
];

/**
 * Everything the renderer can draw, on one grid: growth stages, mining chips, ground items, a
 * machine, a conveyor run, a fuel depot, three bots on independent clocks, and a bot that spends
 * its whole life bumping into a wall.
 */
export function sceneShowcase(): Scene {
  const world = createWorld({ w: 14, h: 9, seed: 7, fill: Terrain.Floor });
  paintAscii(world, SHOWCASE_MAP, {
    '#': Terrain.Wall,
    '.': Terrain.Regolith,
    ',': Terrain.Soil,
    o: Terrain.Ore,
    r: Terrain.Rock,
    c: Terrain.Conveyor,
    D: Terrain.Depot,
    p: Terrain.Pad,
  });

  // Six crops planted at staggered ticks, so the whole maturity ladder is on screen at once and
  // visibly advances as the playhead moves (ENGINE.md §6.4: growth is derived, not scheduled).
  const plantedAt = [0, 4, 8, 12, 16, 20];
  const cells = [vec(2, 2), vec(3, 2), vec(4, 2), vec(2, 3), vec(3, 3), vec(4, 3)];
  cells.forEach((at, i) => {
    setTile(world, at, {
      terrain: Terrain.Soil,
      growth: 0,
      maxGrowth: 8,
      crop: 'crop',
      meta: { plantedAt: plantedAt[i] as number },
    });
  });

  addGroundItems(world, vec(7, 7), 'crate', 3);
  addGroundItems(world, vec(8, 7), 'ore', 1);
  addGroundItems(world, vec(9, 7), 'cell', 2);
  addGroundItems(world, vec(10, 7), 'chip', 5);

  addMachine(world, {
    id: 'silo',
    kind: 'sink',
    at: vec(12, 2),
    state: 'on',
    inventory: [],
    vars: {},
    cycle: ['on', 'off'],
  });
  addMachine(world, {
    id: 'mast',
    kind: 'antenna',
    at: vec(12, 5),
    state: 'off',
    inventory: [],
    vars: {},
  });

  addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'RIG-01' });
  addBot(world, { at: vec(1, 7), facing: Dir.East, name: 'RIG-02', fuel: 26, fuelMax: 26 });
  addBot(world, { at: vec(11, 7), facing: Dir.North, name: 'RIG-03' });
  rebuildOccupancy(world);

  const trace = finish(world, (sim) => {
    const [a, b, c] = sim.world.bots;
    if (!a || !b || !c) return;

    // Bot A: farm the plot, then run into the wall it cannot pass.
    sim.move(a.id, Dir.South);
    sim.move(a.id, Dir.East);
    for (let i = 0; i < 3; i++) sim.move(a.id, Dir.East);
    sim.harvest(a.id);
    sim.move(a.id, Dir.South);
    sim.harvest(a.id);
    for (let i = 0; i < 4; i++) sim.move(a.id, Dir.East);
    for (let i = 0; i < 3; i++) sim.move(a.id, Dir.North);

    // Bot B: refuel, cross the map, mine the ore vein.
    sim.move(b.id, Dir.North);
    sim.move(b.id, Dir.North);
    sim.move(b.id, Dir.North);
    sim.move(b.id, Dir.East);
    sim.move(b.id, Dir.East);
    sim.move(b.id, Dir.East);
    sim.move(b.id, Dir.East);
    sim.refuel(b.id);
    for (let i = 0; i < 3; i++) sim.move(b.id, Dir.East);
    sim.move(b.id, Dir.North);
    sim.move(b.id, Dir.North);
    sim.mine(b.id, Dir.East);
    sim.move(b.id, Dir.East);
    sim.mine(b.id, Dir.East);

    // Bot C: collect the ground items, then spend the rest of the run failing to walk East.
    sim.move(c.id, Dir.West);
    sim.pickup(c.id);
    sim.move(c.id, Dir.West);
    sim.pickup(c.id);
    sim.move(c.id, Dir.West);
    sim.pickup(c.id);
    sim.move(c.id, Dir.South);
    for (let i = 0; i < 6; i++) sim.move(c.id, Dir.South);

    sim.use(a.id, Dir.East);
    sim.send(a.id, b.id, 'plot cleared');
    sim.send(a.id, 999, 'nobody home');
    // `sync` emits one event per bot that actually idled, which is what drives the idle tell.
    sim.sync();
    sim.print(a.id, 'showcase complete');
  });

  return {
    id: 'showcase',
    label: 'showcase · growth, mining, blocked moves',
    world: 2,
    trace,
    highlights: [vec(2, 5)],
  };
}

/**
 * The performance target from the brief: 30x30, 20 bots, particles active. Each bot walks its own
 * loop, so every bot is on a different clock and the animation state genuinely differs per bot.
 */
export function sceneStress(): Scene {
  const size = 30;
  const world = createWorld({ w: size, h: size, seed: 3, fill: Terrain.Regolith });
  for (let x = 0; x < size; x++) {
    setTile(world, vec(x, 0), { terrain: Terrain.Wall });
    setTile(world, vec(x, size - 1), { terrain: Terrain.Wall });
    setTile(world, vec(0, x), { terrain: Terrain.Wall });
    setTile(world, vec(size - 1, x), { terrain: Terrain.Wall });
  }
  for (let i = 0; i < 60; i++) {
    const x = 2 + ((i * 7) % (size - 4));
    const y = 2 + ((i * 13) % (size - 4));
    setTile(world, vec(x, y), { terrain: i % 3 === 0 ? Terrain.Rock : Terrain.Ore });
  }
  for (let i = 0; i < 40; i++) {
    addGroundItems(world, vec(3 + ((i * 11) % 24), 3 + ((i * 5) % 24)), 'ore', 1 + (i % 4));
  }
  const starts: { x: number; y: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const at = vec(2 + (i % 5) * 5, 2 + Math.floor(i / 5) * 6);
    if (world.tiles[at.y * size + at.x]?.terrain !== Terrain.Regolith) {
      setTile(world, at, { terrain: Terrain.Regolith });
    }
    addBot(world, { at, facing: (i % 4) as Dir, name: `SWARM-${String(i).padStart(2, '0')}` });
    starts.push(at);
  }
  rebuildOccupancy(world);

  const trace = finish(world, (sim) => {
    const bots = sim.world.bots.slice();
    for (let round = 0; round < 24; round++) {
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot) continue;
        const dir = ((round + i) % 4) as Dir;
        sim.move(bot.id, dir);
        if (round % 5 === 2) sim.mine(bot.id);
        if (round % 7 === 3) sim.pickup(bot.id);
      }
    }
  });

  return { id: 'stress', label: 'stress · 30x30, 20 bots', world: 7, trace, highlights: [] };
}

/** A biome contact sheet: every terrain, drawn under one world's palette. */
export function sceneBiome(world: number, label: string): Scene {
  const terrains: Terrain[] = [
    Terrain.Floor,
    Terrain.Wall,
    Terrain.Pad,
    Terrain.Regolith,
    Terrain.Soil,
    Terrain.Rock,
    Terrain.Ore,
    Terrain.Rubble,
    Terrain.Ice,
    Terrain.Pit,
    Terrain.Cable,
    Terrain.Depot,
    Terrain.Conveyor,
  ];
  const cols = 13;
  const grid = createWorld({ w: cols, h: 5, seed: 1, fill: Terrain.Floor });
  terrains.forEach((terrain, i) => {
    setTile(grid, vec(i, 1), { terrain });
    setTile(grid, vec(i, 2), { terrain });
  });
  addBot(grid, { at: vec(0, 4), facing: Dir.East, name: 'PROBE' });
  rebuildOccupancy(grid);
  const snapshot = cloneWorld(grid);
  const trace = finish(snapshot, (sim) => {
    const botId = sim.world.bots[0]?.id ?? 0;
    for (let i = 0; i < cols - 1; i++) sim.move(botId, Dir.East);
  });
  return { id: `biome-${world}`, label, world, trace, highlights: [] };
}

/**
 * The legibility case: a 21x21 maze, which in the real viewport panel lands around 13 CSS px per
 * tile. Everything the renderer has to stay readable at that size is on this grid — a pit, ore,
 * a machine, crops, ground items — and the highlights are scattered rather than adjacent, which
 * is what `highlightsAt` actually feeds the renderer during a run.
 */
export function sceneMaze(): Scene {
  const size = 21;
  const world = createWorld({ w: size, h: size, seed: 11, fill: Terrain.Regolith });
  for (let i = 0; i < size; i++) {
    setTile(world, vec(i, 0), { terrain: Terrain.Wall });
    setTile(world, vec(i, size - 1), { terrain: Terrain.Wall });
    setTile(world, vec(0, i), { terrain: Terrain.Wall });
    setTile(world, vec(size - 1, i), { terrain: Terrain.Wall });
  }
  // A pillared maze: walls on every other cell, with a deterministic stub hanging off each one.
  for (let y = 2; y < size - 1; y += 2) {
    for (let x = 2; x < size - 1; x += 2) {
      setTile(world, vec(x, y), { terrain: Terrain.Wall });
      const dir = (x * 7 + y * 13) % 4;
      const nx = x + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
      const ny = y + (dir === 2 ? 1 : dir === 0 ? -1 : 0);
      if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1) {
        setTile(world, vec(nx, ny), { terrain: Terrain.Wall });
      }
    }
  }
  const hazards: [number, number, Terrain][] = [
    [3, 1, Terrain.Pit],
    [9, 5, Terrain.Pit],
    [15, 11, Terrain.Pit],
    [5, 17, Terrain.Pit],
    [17, 3, Terrain.Ore],
    [11, 15, Terrain.Ore],
    [7, 9, Terrain.Rock],
    [13, 7, Terrain.Ice],
    [1, 11, Terrain.Pad],
  ];
  for (const [x, y, terrain] of hazards) setTile(world, vec(x, y), { terrain });
  for (let i = 0; i < 4; i++) {
    setTile(world, vec(3 + i * 2, 13), {
      terrain: Terrain.Soil,
      growth: 0,
      maxGrowth: 8,
      crop: 'crop',
      meta: { plantedAt: i * 6 },
    });
  }
  addGroundItems(world, vec(1, 1), 'crate', 2);
  addGroundItems(world, vec(19, 19), 'ore', 3);
  addMachine(world, {
    id: 'relay',
    kind: 'antenna',
    at: vec(19, 1),
    state: 'on',
    inventory: [],
    vars: {},
  });
  addBot(world, { at: vec(1, 19), facing: Dir.North, name: 'MAZE-01' });
  addBot(world, { at: vec(19, 17), facing: Dir.West, name: 'MAZE-02' });
  rebuildOccupancy(world);

  const trace = finish(world, (sim) => {
    const [a, b] = sim.world.bots;
    if (!a || !b) return;
    for (let round = 0; round < 30; round++) {
      sim.move(a.id, round % 4 === 3 ? Dir.East : Dir.North);
      sim.move(b.id, round % 3 === 2 ? Dir.North : Dir.West);
      if (round % 6 === 5) sim.mine(a.id);
    }
  });

  return {
    id: 'maze21',
    label: 'maze21 · 21x21, the small-tile case',
    world: 4,
    trace,
    // Scattered the way an objective's remaining work is scattered, not a neat block.
    highlights: [vec(1, 11), vec(11, 15), vec(17, 3), vec(9, 5), vec(5, 17)],
  };
}

/**
 * The identity case: every machine kind, the whole maturity ladder and every item kind at once.
 *
 * `docs/FIX-SPRITES.md` claims three things and this is the grid all three are checked on. Two of
 * them only fail in company — a furnace and a press are each fine on their own board and converge
 * the moment they are side by side, and ripe reads perfectly against bare soil and stops reading
 * against a crop one bucket short of it. So the ten kinds sit in one row and the crops alternate
 * ripe with unripe rather than running the ladder in order.
 *
 * Static on purpose: no `plantedAt`, so `maturity` returns the authored `growth` and the row means
 * the same thing at every tick (`sim.ts:102`). A shot of this scene can be compared against a shot
 * of it taken a month later.
 */
export function sceneSprites(): Scene {
  const world = createWorld({ w: 13, h: 8, seed: 5, fill: Terrain.Floor });
  for (let x = 0; x < 13; x++) {
    setTile(world, vec(x, 0), { terrain: Terrain.Wall });
    setTile(world, vec(x, 7), { terrain: Terrain.Wall });
  }
  for (let y = 0; y < 8; y++) {
    setTile(world, vec(0, y), { terrain: Terrain.Wall });
    setTile(world, vec(12, y), { terrain: Terrain.Wall });
  }

  MACHINE_ROW.forEach(([kind, state], i) => {
    addMachine(world, {
      id: `m-${kind}`,
      kind,
      at: vec(1 + i, 1),
      state,
      inventory: [],
      vars: {},
      facing: Dir.South,
    });
  });

  // Alternating, so every ripe tile has an unripe neighbour on both sides. The unripe values walk
  // the ladder from bare to one tick short of ready, which is the reading w2-02 is lost on.
  const unripe = [0, 2, 4, 6, 7];
  for (let i = 0; i < 5; i++) {
    setTile(world, vec(1 + i * 2, 3), {
      terrain: Terrain.Soil,
      crop: 'crop',
      growth: 8,
      maxGrowth: 8,
    });
    setTile(world, vec(2 + i * 2, 3), {
      terrain: Terrain.Soil,
      crop: 'crop',
      growth: unripe[i] as number,
      maxGrowth: 8,
    });
  }
  // The ladder in order underneath it, so a reader can name which bucket an alternating tile is in.
  for (let i = 0; i < 6; i++) {
    setTile(world, vec(1 + i, 5), {
      terrain: Terrain.Soil,
      crop: 'crop',
      growth: i === 5 ? 10 : i * 2,
      maxGrowth: 10,
    });
  }

  ITEM_ROW.forEach((kind, i) => {
    addGroundItems(world, vec(1 + i, 6), kind, i === 3 ? 4 : 1);
  });

  addBot(world, { at: vec(11, 5), facing: Dir.West, name: 'RIG-01' });
  rebuildOccupancy(world);

  const trace = finish(world, (sim) => {
    const botId = sim.world.bots[0]?.id ?? 0;
    sim.print(botId, 'sprite legend');
  });

  return {
    id: 'sprites',
    label: 'sprites - every machine, maturity, item',
    world: 2,
    trace,
    highlights: [vec(1, 3)],
  };
}

export function allScenes(): Scene[] {
  return [
    sceneW101(),
    sceneSprites(),
    sceneShowcase(),
    sceneMaze(),
    sceneStress(),
    sceneBiome(1, 'biome · Boot Sector'),
    sceneBiome(4, 'biome · Cave Systems'),
    sceneBiome(5, 'biome · The Grid'),
    sceneBiome(8, 'biome · Kessler Contract'),
  ];
}
