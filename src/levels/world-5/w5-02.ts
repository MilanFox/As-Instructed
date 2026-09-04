import type { Machine, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  createWorld,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';

/** The run is always 200 segments; the brief says so, so the player never spends a probe on it. */
export const SEGMENTS = 200;
const PER_ROW = 40;
const ROWS = SEGMENTS / PER_ROW;
const WIDTH = PER_ROW + 3;
const HEIGHT = ROWS + 2;
const FIRST_COLUMN = 2;

/**
 * Break positions are placed, not drawn. CURRICULUM.md §15.3 requires the degenerate cases in the
 * seed list, and a uniform draw over 200 indices will not hand you 0 and 199 in five tries.
 * Seed 1 is the teaching instance and sits comfortably in the middle.
 */
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

/** Segment `k` snakes: even rows run East, odd rows run West, so the run is one unbroken line. */
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

/**
 * Par: the reference spends exactly one `power`, so 2 ticks is the whole clock cost and par is
 * that. The scoring pressure on this level is the probe budget, not the clock.
 */
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
    'Feeder run 12 is two hundred segments long and one of them has failed. The test set',
    'is rated for ten readings per shift. It is rated for ten readings because it is',
    'rated for ten readings.',
    '',
    'Find the broken segment and patch it.',
    '',
    '- The run is `relay-0` through `relay-199`, in order, from the reactor outward.',
    '- `probe(id)` returns that relay. `vars.live` is `1` when the run is still continuous from',
    '  the reactor as far as that segment, and `0` once it is not. The first segment reading `0`',
    '  is the broken one.',
    '- Patch it with `power(id, "patched")`. That costs 2 ticks.',
    '- **Exactly one relay may end up patched, and it must be the broken one.**',
    '- **You may call `probe` at most ten times in total.** Every `probe` call counts, whatever',
    '  you point it at. Nothing else you can call reports continuity.',
  ].join('\n'),
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 2, chars: 260 },
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
      (ctx) => {
        const broken = `relay-${ctx.world.vars.breakAt ?? -1}`;
        const patched = patchedIds(ctx.world);
        const stray = patched.filter((id) => id !== broken).length;
        return [patched.includes(broken) && stray === 0 ? 1 : 0, 1 + stray];
      },
    ),
    Objectives.withinSenses('probe', 10, {
      id: 'probe-budget',
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
    '// relay-0 through relay-199 run outward from the reactor.',
    '// probe(id).vars.live is 1 while the run is still continuous that far, 0 after that.',
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
