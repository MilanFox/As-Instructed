import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
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
import { localSeed, reportedLines } from './shared.ts';

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

function progress(ctx: ObjectiveContext): [number, number] {
  return [doneCount(ctx.world), jobMachines(ctx.initialWorld).length];
}

/**
 * The first job still on the board, and how far into it the fleet got.
 *
 * `4 of 12 uses` is the reading `2 of 26` could never give: a job left untouched and a job the
 * fleet walked away from halfway are different mistakes, and one use too many wraps the state
 * back to `open`, which looks from the outside exactly like never having started.
 */
function unfinishedJob(ctx: ObjectiveContext): Divergence | undefined {
  const job = jobMachines(ctx.world).find((machine) => machine.state !== 'done');
  if (job === undefined) return undefined;
  const cost = job.vars.cost ?? 0;
  const used = job.state === 'open' ? 0 : Number(job.state);
  return {
    where: job.id,
    expected: 'done',
    received: Number.isFinite(used)
      ? `${String(used)} of ${String(cost)} uses`
      : clipValue(job.state),
  };
}

/**
 * The tick each job's own clock stopped on: the reading the bot that closed it had straight
 * after its last `use`. A job nobody finished is absent.
 */
function closedAt(ctx: ObjectiveContext): Map<string, number> {
  const closed = new Map<string, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok) continue;
    const id = event.machineId;
    if (id === null || !id.startsWith(JOB_PREFIX)) continue;
    closed.set(id, Math.max(closed.get(id) ?? 0, event.t + event.dt));
  }
  for (const job of jobMachines(ctx.world)) {
    if (job.state !== 'done') closed.delete(job.id);
  }
  return closed;
}

/** The tick the board went clear, and every job that could be said to have decided it. */
function deciders(ctx: ObjectiveContext): { tick: number; jobs: Set<string> } {
  const closed = closedAt(ctx);
  const tick = Math.max(0, ...closed.values());
  const jobs = new Set<string>();
  for (const [id, at] of closed) if (at === tick) jobs.add(id);
  return { tick, jobs };
}

/** `last <job> <tick>` split back into its two halves, or null when it is not that shape. */
function readDecider(line: string): { job: string; tick: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const tick = Number(parts[2]);
  if (!Number.isInteger(tick)) return null;
  return { job: parts[1] as string, tick };
}

/**
 * Where the shift report and the run part company, without naming the job.
 *
 * Naming it is the whole bonus. What comes back instead is the run's own answer priced against
 * the run's own makespan — a tick the player can already read off their own clock — so a wrong
 * guess rules that job out and leaves the bookkeeping that finds the right one exactly where it
 * was.
 */
function misreadDecider(ctx: ObjectiveContext): Divergence | undefined {
  const said = reportedLines(ctx.trace.events, 'last');
  const { tick, jobs } = deciders(ctx);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the shift report',
      expected: 'a line naming the job that finished last',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return {
      where: 'the shift report',
      expected: 'one line',
      received: `${String(said.length)} lines`,
    };
  }
  const claim = readDecider(line);
  if (claim === null) {
    return {
      where: 'the shift report',
      expected: 'a line reading `last <job> <tick>`',
      received: clipValue(line),
    };
  }
  const closed = closedAt(ctx).get(claim.job);
  if (closed === undefined) {
    return {
      where: claim.job,
      expected: 'a job this run finished',
      received: 'never reached done',
    };
  }
  if (!jobs.has(claim.job)) {
    return {
      where: claim.job,
      expected: `a job that closed at tick ${String(tick)}`,
      received: `closed at tick ${String(closed)}`,
    };
  }
  return {
    where: claim.job,
    expected: 'the tick its bot read after the last use',
    received: `tick ${String(claim.tick)}`,
  };
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
    {
      label: 'Shift report',
      value:
        'One line, `last <job> <tick>`: the job whose final `use()` landed latest, and the clock reading of the bot that closed it, straight after that use.',
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
      { progress, divergence: unfinishedJob },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-decider',
      'Report the job that decided the shift',
      (ctx) => {
        const said = reportedLines(ctx.trace.events, 'last');
        if (said.length !== 1) return false;
        const claim = readDecider(said[0] as string);
        if (claim === null) return false;
        const { tick, jobs } = deciders(ctx);
        return jobs.has(claim.job) && claim.tick === tick;
      },
      { divergence: misreadDecider },
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
