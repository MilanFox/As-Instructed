import type { Divergence, Machine, ObjectiveContext, World } from '../../engine/index.ts';
import {
  BROKEN,
  Dir,
  FED_BY,
  LIVE,
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
  settleContinuity,
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
    expected: 'the broken relay',
    received: 'patched, but it is not broken',
  };
};

export const w5_02: LevelDef = {
  id: 'w5-02',
  world: 5,
  index: 2,
  title: 'Continuity Test',
  hardware: ['power'],
  brief: [
    'One relay in 200 is broken. Every probe costs money, the office pays for ten, and it would be delighted by fewer. — M. Vance',
    '',
    '**Find the one broken relay among 200 and patch it.**',
  ].join('\n'),
  facts: [
    {
      label: 'Relays',
      value:
        '`relay-0` to `relay-199`, in order from the reactor. `vars.live` is `1` before the break and `0` from the break on. The break can be at any relay, even the first or the last.',
    },
    {
      label: 'Broken relay',
      value:
        'The first relay with `live` at `0`. Patch it with `power(id, "patched")`, 2 ticks. Patch no other relay.',
    },
    {
      label: 'Probes',
      value:
        'Probes cost no ticks. Every `probe` call counts, whatever it reads. Only `probe` shows `live`.',
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
      vars: { segments: SEGMENTS },
    });
    for (let index = 0; index < SEGMENTS; index++) {
      const { x, y } = segmentAt(index);
      addMachine(world, {
        id: `relay-${index}`,
        kind: MachineKind.Node,
        at: vec(x, y),
        state: index === broken ? BROKEN : 'open',
        inventory: [],
        vars: {
          segment: index,
          [LIVE]: 1,
          ...(index > 0 ? { [`${FED_BY}relay-${index - 1}`]: 1 } : {}),
        },
      });
    }
    settleContinuity(world);

    addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'patched',
      'Patch the broken relay and no other',
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
      label: 'Use at most 10 probes',
    }),
  ],
  bonus: [
    Objectives.withinSenses('probe', 8, {
      label: 'Use at most 8 probes',
    }),
  ],
  starter: ['// Ten probes. Patch only the broken relay.', ''].join('\n'),
  hints: [
    'One probe tells you which side of that relay the break is on.',
    '200 relays and 10 probes. Each probe must rule out much more than one relay.',
    'The values go 1, 1, 1, then 0, 0, 0. Probe the middle of the part that is left.',
  ],
  docs: ['probe', 'power'],
};
