import type { Divergence, Machine, ObjectiveContext, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  clipValue,
  createWorld,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';

export const SEGMENTS = 200;
const PER_ROW = 40;
const ROWS = SEGMENTS / PER_ROW;
const WIDTH = PER_ROW + 3;
const HEIGHT = ROWS + 2;
const FIRST_COLUMN = 2;

const BREAK_AT: Readonly<Record<number, number>> = Object.freeze({
  1: 97,
  2: 0,
  3: 199,
  4: 41,
  5: 158,
});

export function breakIndex(seed: number): number {
  return BREAK_AT[seed] ?? new Rng(seed * 4409 + 13).int(0, SEGMENTS - 1);
}

export function segmentAt(index: number): { x: number; y: number } {
  const row = Math.floor(index / PER_ROW);
  const column = index % PER_ROW;
  const x = row % 2 === 0 ? FIRST_COLUMN + column : FIRST_COLUMN + (PER_ROW - 1 - column);
  return { x, y: row + 1 };
}

const relays = (world: World): Machine[] => world.machines.filter((m) => m.id.startsWith('relay-'));

const patchedIds = (world: World): string[] =>
  relays(world)
    .filter((machine) => machine.state === 'patched')
    .map((machine) => machine.id);

const patchReport = (ctx: ObjectiveContext): Divergence => {
  const patched = patchedIds(ctx.world);
  const only = patched[0];
  if (patched.length !== 1 || only === undefined) {
    return {
      where: 'relays patched',
      expected: 'exactly 1',
      received:
        patched.length === 0
          ? NOTHING
          : clipValue(`${String(patched.length)}: ${patched.join(', ')}`),
    };
  }
  return {
    where: only,
    expected: 'the segment the run goes dead at',
    received: 'patched, and it is not that one',
  };
};

export const w5_02: LevelDef = {
  id: 'w5-02',
  world: 5,
  index: 2,
  title: 'Continuity Test',
  hardware: ['power'],
  brief: [
    '**MEMO KD-2491**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Feeder run 12, discontinuity',
    '',
    'Feeder run 12 is two hundred segments long and one of them has failed. The test set is',
    'rated for ten readings per shift. It is rated for ten readings because it is rated for',
    'ten readings.',
    '',
    'Find the broken segment and patch it.',
  ].join('\n'),
  facts: [
    {
      label: 'The run',
      value: '`relay-0` through `relay-199`, in order, from the reactor outward.',
    },
    {
      label: 'A reading',
      value:
        '`probe(id).vars.live` is `1` while the run is still whole that far and `0` once it is not. The first `0` is the break.',
    },
    {
      label: 'The patch',
      value:
        '`power(id, "patched")`, 2 ticks. **Exactly one relay may end up patched, and it must be the broken one.**',
    },
    {
      label: 'Readings',
      value:
        'Ten `probe` calls for the whole shift, whatever you point them at. Nothing else reports continuity.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 2 },
  graded: false,
  build(seed: number): World {
    const broken = breakIndex(seed);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Wall,
      vars: { segments: SEGMENTS, breakAt: broken },
    });
    for (let y = 1; y <= ROWS; y++) {
      for (let x = 1; x < WIDTH - 1; x++) setTerrain(world, vec(x, y), Terrain.Cable);
    }

    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: vec(1, 1),
      state: 'on',
      inventory: [],
      vars: { segments: SEGMENTS, probeBudget: 10 },
    });
    for (let index = 0; index < SEGMENTS; index++) {
      const { x, y } = segmentAt(index);
      addMachine(world, {
        id: `relay-${index}`,
        kind: MachineKind.Node,
        at: vec(x, y),
        state: 'open',
        inventory: [],
        vars: { segment: index, live: index < broken ? 1 : 0 },
      });
    }

    addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'patched',
      'Patch the broken segment, and only that one',
      (ctx) => {
        const broken = `relay-${ctx.world.vars.breakAt ?? -1}`;
        const patched = patchedIds(ctx.world);
        return patched.length === 1 && patched[0] === broken;
      },
      {
        progress: (ctx) => {
          const broken = `relay-${ctx.world.vars.breakAt ?? -1}`;
          const patched = patchedIds(ctx.world);
          const stray = patched.filter((id) => id !== broken).length;
          return [patched.includes(broken) && stray === 0 ? 1 : 0, 1 + stray];
        },
        divergence: patchReport,
      },
    ),
    Objectives.withinSenses('probe', 10, {
      label: 'Locate the break using at most 10 probes',
    }),
  ],
  bonus: [
    Objectives.withinSenses('probe', 8, {
      id: 'eight-probes',
      label: 'Locate the break using at most 8 probes',
    }),
  ],
  starter: [
    '// Ten probes, and only the broken relay may be patched.',
    '',
    'let low = 0;',
    'let high = 199;',
    '',
  ].join('\n'),
  hints: [
    'A reading does not only tell you about the segment you pointed at. It tells you which side of it the break is on.',
    'Two hundred segments and ten readings. Work out how much of the run one reading has to eliminate for that to be enough, and it will be more than one segment.',
    'The readings run 1, 1, 1, ... then 0, 0, 0, and never go back. You are looking for the place they change, and you can always ask about the middle of whatever is left.',
  ],
  docs: ['probe', 'power'],
};
