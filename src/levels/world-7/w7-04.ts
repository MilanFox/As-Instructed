import type { Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
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
import { localSeed } from './shared.ts';

const WIDTH = 28;
const HEIGHT = 20;
/** Depot 0. The fleet musters here and the yard runs east of it. */
const DEPOT_X = 2;
const YARD_X0 = 8;
/** The walk from Depot 0 to the near edge of the yard. Published as part of the load bound. */
const WALK_OUT = YARD_X0 - DEPOT_X;
const JOB_PREFIX = 'job-';

export type Shape = 'uniform' | 'spread' | 'skewed' | 'bimodal' | 'heavy';

export interface Requisition {
  bots: number;
  jobs: number;
  shape: Shape;
}

/**
 * One distribution shape per seed, because the level is about the *condition* under which
 * dealing the jobs out in advance is fine, not about a rule (CURRICULUM.md §9).
 *
 * Seed 1 is near-uniform and comfortably wide: round-robin is a correct answer there and the
 * player should get to notice that. Seed 3 is the skewed one — three quarters of the jobs are
 * trivial and a handful are twenty ticks, so dealing in advance hands one bot two of them and
 * doubles the makespan. Seed 5 is the squeeze: the largest job set against the smallest fleet.
 */
const REQUISITIONS: Readonly<Record<number, Requisition>> = Object.freeze({
  1: { bots: 6, jobs: 18, shape: 'uniform' },
  2: { bots: 6, jobs: 24, shape: 'spread' },
  3: { bots: 4, jobs: 26, shape: 'skewed' },
  4: { bots: 8, jobs: 30, shape: 'bimodal' },
  5: { bots: 5, jobs: 15, shape: 'heavy' },
});

function requisitionFor(seed: number): Requisition {
  return REQUISITIONS[seed] ?? { bots: 5, jobs: 20, shape: 'spread' };
}

function drawCost(rng: Rng, shape: Shape, index: number): number {
  switch (shape) {
    case 'uniform':
      return rng.int(8, 12);
    case 'spread':
      return rng.int(1, 20);
    case 'skewed':
      return rng.chance(0.75) ? rng.int(1, 3) : rng.int(17, 20);
    case 'bimodal':
      return index % 3 === 0 ? rng.int(14, 20) : rng.int(1, 5);
    case 'heavy':
    default:
      return rng.int(12, 20);
  }
}

export interface Job {
  id: string;
  at: Vec;
  cost: number;
}

/**
 * The work is packed into one block rather than sprinkled across the yard, so walking is a real
 * cost and never the deciding one. This level is about *when* a bot starts a job, and a layout
 * where routing dominates would be teaching w3-05 again (CURRICULUM.md §12).
 */
export function jobsFor(seed: number): Job[] {
  const { jobs, shape } = requisitionFor(seed);
  const rng = new Rng(localSeed(seed) + 401);
  const width = 7;
  const rows = Math.ceil((jobs * 1.4) / width);
  const top = Math.max(1, Math.floor((HEIGHT - (2 * rows - 1)) / 2));
  // Every other row is left empty. A bot parked on a finished job is a wall from then on, and
  // without the gaps a late job can end up walled in by the fleet that already served its
  // neighbours.
  const cells: Vec[] = [];
  for (let r = 0; r < rows; r++) {
    for (let x = YARD_X0; x < YARD_X0 + width; x++) cells.push(vec(x, top + r * 2));
  }
  const places = rng.shuffle(cells);
  const out: Job[] = [];
  for (let i = 0; i < jobs; i++) {
    out.push({
      id: `${JOB_PREFIX}${String(i)}`,
      at: places[i] as Vec,
      cost: drawCost(rng, shape, i),
    });
  }
  return out;
}

/** `cost` uses to reach `done`, and a wrap after it, so overshooting a job undoes it. */
function cycleFor(cost: number): string[] {
  const cycle = ['open'];
  for (let i = 1; i < cost; i++) cycle.push(String(i));
  cycle.push('done');
  return cycle;
}

const jobMachines = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith(JOB_PREFIX));

const doneCount = (world: World): number =>
  jobMachines(world).filter((machine) => machine.state === 'done').length;

/**
 * The number no schedule can beat: nobody finishes before the longest single job is done, every
 * job costs at least a step in and a step out on top of its own price, the rest has to be shared
 * across the fleet, and somebody has to walk out of the depot first.
 */
export function boundOf(jobCosts: readonly number[], fleet: number): number {
  let total = 0;
  let longest = 0;
  for (const cost of jobCosts) {
    total += cost + 2;
    longest = Math.max(longest, cost);
  }
  return Math.max(longest, Math.ceil(total / Math.max(1, fleet))) + WALK_OUT;
}

export function loadBound(world: World): number {
  const costs = jobMachines(world).map((job) => job.vars.cost ?? 0);
  return boundOf(costs, world.bots.filter((bot) => bot.alive).length);
}

function progress(ctx: ObjectiveContext): [number, number] {
  return [doneCount(ctx.world), jobMachines(ctx.initialWorld).length];
}

/**
 * Par: measured from the reference, which hands the longest job still on the board to whichever
 * bot comes free soonest. That lands between 51 and 79 ticks across the five seeds and par is
 * the worst of them, because every seed has to clear it. Dealing the board out in advance is
 * fine on seed 1 and misses by roughly double on seed 3, which is the whole level.
 */
export const w7_04: LevelDef = {
  id: 'w7-04',
  world: 7,
  index: 4,
  title: 'Dispatch',
  hardware: [],
  costs: { use: 1 },
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Yard 7 dispatch',
    '',
    'The board has a different number of work items every shift. Some of them are a minute. Some',
    'of them are the rest of the shift. The board does not distinguish between these, and',
    'neither, historically, have we.',
    '',
    'Clear the board. Every job has to be `done` when your program stops.',
  ].join('\n'),
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops.' },
    {
      label: 'The jobs',
      value:
        '`job-0` upward. `probe(id)` is free, reports `vars.cost` and the position, and gives back `null` past the last one.',
    },
    {
      label: 'Clearing one',
      value: 'Stand on the job and call `use()` exactly `cost` times. One tick each.',
    },
    { label: 'One use too many', value: 'The state wraps and the job goes back to `open`.' },
    {
      label: 'The fleet',
      value: 'Starts at Depot 0 on the west wall. The yard between is open floor.',
    },
    {
      label: 'Load bound',
      value:
        "`probe('board').vars.bound` — the longer of the longest single job, or every job plus two ticks of walking shared out across the fleet, plus the walk out from Depot 0.",
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 79 },
  budget: { maxTicks: 4000 },
  build(seed: number): World {
    const { bots } = requisitionFor(seed);
    const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Floor, vars: { seed } });
    for (let y = 0; y < HEIGHT; y++) {
      setTerrain(world, vec(0, y), Terrain.Wall);
      setTerrain(world, vec(WIDTH - 1, y), Terrain.Wall);
    }
    for (let x = 0; x < WIDTH; x++) {
      setTerrain(world, vec(x, 0), Terrain.Wall);
      setTerrain(world, vec(x, HEIGHT - 1), Terrain.Wall);
    }

    const jobs = jobsFor(seed);
    for (const job of jobs) {
      addMachine(world, {
        id: job.id,
        kind: MachineKind.Node,
        at: job.at,
        state: 'open',
        inventory: [],
        vars: { cost: job.cost },
        cycle: cycleFor(job.cost),
      });
    }

    addMachine(world, {
      id: 'board',
      kind: MachineKind.Lever,
      at: vec(DEPOT_X, 1),
      state: 'idle',
      inventory: [],
      vars: {
        jobs: jobs.length,
        bound: boundOf(
          jobs.map((job) => job.cost),
          bots,
        ),
      },
    });

    for (let i = 0; i < bots; i++) {
      const at = vec(DEPOT_X, 2 + i * 2);
      setTerrain(world, at, Terrain.Depot);
      addBot(world, { at, facing: Dir.East, name: `YARD-${String(10 + i)}` });
    }
    return world;
  },
  objectives: [
    Objectives.custom(
      'board-clear',
      'Leave every job on the board done',
      (ctx) => doneCount(ctx.world) === jobMachines(ctx.initialWorld).length,
      progress,
    ),
  ],
  bonus: [
    Objectives.custom(
      'within-bound',
      'Finish within a third of the load bound',
      (ctx) => ctx.trace.endTick <= Math.floor((loadBound(ctx.initialWorld) * 4) / 3),
    ),
  ],
  starter: [
    '// NOTE(4470): the board is not sorted. it has never been sorted',
    '// NOTE(4470): the twenty-tick jobs are the ones that decide the shift',
    '',
    'const board = probe("board");',
    'const jobs = [];',
    'for (let i = 0; i < board.vars.jobs; i++) jobs.push(probe(`job-${i}`));',
    'print(`${jobs.length} jobs, bound ${board.vars.bound}`);',
    '',
  ].join('\n'),
  hints: [
    'Splitting the board between the bots before anybody moves is one decision made with no information. Deciding one job at a time is many decisions, each made with more.',
    'Two bots do not become free at the same moment. The interesting question at any point is which one is free soonest, and you can answer it without asking the bot.',
    'The last job to be started decides when the shift ends. It is much better for that job to be a short one.',
    'A bot that is nearer to a job finishes it sooner. That matters, but not as much as the number written on the job.',
  ],
  docs: ['bots', 'sync', 'probe', 'use'],
};
