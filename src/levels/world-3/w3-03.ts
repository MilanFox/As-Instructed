import type { ItemKind, Objective, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  createWorld,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { MANIFEST_ORDER, frame, groundTotal, warm } from './yard.ts';

const PAR_TICKS = 25;

/** One line per class actually present, in the order the brief declares. Zero counts are dropped. */
export function manifestFor(world: World): string[] {
  const lines: string[] = [];
  for (const kind of MANIFEST_ORDER) {
    const count = groundTotal(world, kind);
    if (count > 0) lines.push(`${kind} ${count}`);
  }
  return lines;
}

const filed = (ctx: ObjectiveContext): Objective =>
  Objectives.printedSequence(manifestFor(ctx.initialWorld));

/**
 * Rack Row 7: three racks, two aisles, four painted aisle heads. Every rack bay is adjacent to
 * an aisle tile, so a bot that walks the two aisles has read the whole row without ever standing
 * on a crate. Walking the yard instead costs about seven times par, which is the lesson.
 *
 * Seed 1 is pinned to the friendly instance — the short row with the terminal at the aisle head
 * the tour finishes on — so the teaching seed is the one where the first honest attempt is quick.
 */
export const w3_03: LevelDef = {
  id: 'w3-03',
  world: 3,
  index: 3,
  title: 'Manifest',
  hardware: ['use'],
  brief: [
    '**FROM:** Field Engineer D. Halloran',
    '',
    'shipping want a count of rack row 7 by end of shift. they do not want it checked, they',
    'want it filed. the terminal sits on one of the four aisle heads. which one moves.',
    '',
    'Count every item in the row and report it, then file the report.',
    '',
    'A manifest line is the class name, one space, then the total count of that class across',
    'the whole row: `chip 12`. Print the lines in exactly this order:',
    '',
    '`crate`, `part`, `chip`, `cell`, `ore`, `stone`, `scrap`, `ice`.',
    '',
    'A class with a count of zero is not reported at all. Every line your program prints is a',
    'manifest line, debug output included.',
    '',
    'Then operate the manifest terminal until it reads `filed`. The aisle heads are the',
    'painted pads at either end of each aisle.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS, chars: 1100 },
  build(seed: number): World {
    const world = createWorld({ w: 20, h: 14, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);

    const height = seed === 1 ? 5 : rng.int(5, 7);
    const left = rng.int(1, 14);
    const top = rng.int(2, 12 - height);
    const aisles = [left + 1, left + 3];
    const racks = [left, left + 2, left + 4];

    const heads: Vec[] = [];
    for (const x of aisles) {
      for (const y of [top - 1, top + height]) {
        setTile(world, vec(x, y), { terrain: Terrain.Pad });
        heads.push(vec(x, y));
      }
    }

    const bays: Vec[] = [];
    for (const x of racks) {
      for (let y = top; y < top + height; y++) bays.push(vec(x, y));
    }

    const classes = rng.shuffle(MANIFEST_ORDER).slice(0, rng.int(5, 7));
    const stocked = rng.shuffle(bays).slice(0, rng.int(8, Math.min(14, bays.length)));
    stocked.forEach((at, i) => {
      const primary = (i < classes.length ? classes[i] : rng.pick(classes)) as ItemKind;
      addGroundItems(world, at, primary, rng.int(1, 4));
      if (rng.chance(0.5)) addGroundItems(world, at, rng.pick(classes) as ItemKind, rng.int(1, 3));
    });

    // The manifest has to land between thirty and sixty items whatever the draw produced.
    let total = MANIFEST_ORDER.reduce((sum, kind) => sum + groundTotal(world, kind), 0);
    while (total < 30) {
      addGroundItems(world, rng.pick(stocked) as Vec, rng.pick(classes) as ItemKind, 1);
      total++;
    }
    for (const stack of world.items) {
      while (total > 60 && stack.count > 1) {
        stack.count--;
        total--;
      }
    }

    const terminalAt = (seed === 1 ? heads[2] : rng.pick(heads)) as Vec;
    addMachine(world, {
      id: 'terminal',
      kind: MachineKind.Lever,
      at: terminalAt,
      state: 'idle',
      inventory: [],
      vars: {},
      cycle: ['idle', 'filed'],
    });

    addBot(world, {
      at: vec(aisles[0] as number, top - 1),
      facing: Dir.South,
      name: 'RIG-04',
      capacity: 4,
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'manifest-printed',
      'Report one line per class present, in the declared order',
      (ctx) => filed(ctx).evaluate(ctx),
      (ctx) => filed(ctx).progress?.(ctx) ?? [0, 0],
    ),
    Objectives.machineState('terminal', 'filed', {
      id: 'manifest-filed',
      label: 'Leave the terminal reading filed',
    }),
  ],
  bonus: [
    Objectives.withinTicks(20, { id: 'quick-count', label: 'File the manifest within 20 ticks' }),
  ],
  budget: { maxTicks: 2500 },
  starter: [
    '// The manifest order, exactly as the brief prints it.',
    "const ORDER: ItemKind[] = ['crate', 'part', 'chip', 'cell', 'ore', 'stone', 'scrap', 'ice'];",
    '',
    'move(Dir.South);',
    '',
  ].join('\n'),
  hints: [
    'Reading a tile costs nothing. Standing on it costs a tick.',
    'A bot in an aisle is already beside both of the racks that flank it.',
    'Nothing here asks you to move a crate. It asks you to report one.',
    'The set of classes stocked in the row changes between shifts, so the number of lines changes with it.',
  ],
  docs: ['scan', 'print', 'use'],
};
