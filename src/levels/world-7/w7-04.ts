import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MANUAL_ONLY,
  MachineKind,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  clipValue,
  createWorld,
  machineById,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { localSeed, reportedLines } from './shared.ts';

const WIDTH = 28;
const HEIGHT = 20;
const DEPOT_X = 2;
const YARD_X0 = 8;
const WALK_OUT = YARD_X0 - DEPOT_X;
const JOB_PREFIX = 'job-';

export type Shape = 'uniform' | 'spread' | 'skewed' | 'bimodal' | 'heavy';

export interface Requisition {
  bots: number;
  jobs: number;
  shape: Shape;
}

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

export function jobsFor(seed: number): Job[] {
  const { jobs, shape } = requisitionFor(seed);
  const rng = new Rng(localSeed(seed) + 401);
  const width = 7;
  const rows = Math.ceil((jobs * 1.4) / width);
  const top = Math.max(1, Math.floor((HEIGHT - (2 * rows - 1)) / 2));
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

export function boundOf(jobCosts: readonly number[], fleet: number): number {
  let total = 0;
  let longest = 0;
  for (const cost of jobCosts) {
    total += cost + 2;
    longest = Math.max(longest, cost);
  }
  return Math.max(longest, Math.ceil(total / Math.max(1, fleet))) + WALK_OUT;
}

export function deadlineOf(bound: number): number {
  return bound * 2;
}

function deadlineIn(world: World): number {
  return machineById(world, 'board')?.vars.deadline ?? 0;
}

function overranDeadline(ctx: ObjectiveContext): Divergence {
  const last = [...ctx.world.bots].sort((a, b) => b.clock - a.clock)[0];
  return {
    where: last === undefined ? 'the shift' : `${last.name}, the last to stop`,
    expected: `tick ${String(deadlineIn(ctx.initialWorld))}`,
    received: `tick ${String(ctx.trace.endTick)}`,
  };
}

function progress(ctx: ObjectiveContext): [number, number] {
  return [doneCount(ctx.world), jobMachines(ctx.initialWorld).length];
}

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

function deciders(ctx: ObjectiveContext): { tick: number; jobs: Set<string> } {
  const closed = closedAt(ctx);
  const tick = Math.max(0, ...closed.values());
  const jobs = new Set<string>();
  for (const [id, at] of closed) if (at === tick) jobs.add(id);
  return { tick, jobs };
}

function readDecider(line: string): { job: string; tick: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const tick = Number(parts[2]);
  if (!Number.isInteger(tick)) return null;
  return { job: parts[1] as string, tick };
}

function misreadDecider(ctx: ObjectiveContext): Divergence | undefined {
  const said = reportedLines(ctx.trace.events, 'last');
  const { tick, jobs } = deciders(ctx);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the shift report',
      expected: 'a line naming the last job to finish',
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

function begunAt(ctx: ObjectiveContext): Map<string, { t: number; by: number }> {
  const begun = new Map<string, { t: number; by: number }>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok) continue;
    const id = event.machineId;
    if (id === null || !id.startsWith(JOB_PREFIX)) continue;
    if (!begun.has(id)) begun.set(id, { t: event.t, by: event.botId });
  }
  return begun;
}

function costOfEach(ctx: ObjectiveContext): Map<string, number> {
  return new Map(jobMachines(ctx.initialWorld).map((job) => [job.id, job.vars.cost ?? 0]));
}

interface WaveJob {
  id: string;
  cost: number;
  begun: number;
  by: number;
}

interface FirstWave {
  size: number;
  wave: WaveJob[];
  dearest: number[];
  hands: number;
}

function openingJobs(ctx: ObjectiveContext): WaveJob[] {
  const cost = costOfEach(ctx);
  const opened = new Map<number, WaveJob>();
  for (const [id, first] of begunAt(ctx)) {
    const held = opened.get(first.by);
    if (held !== undefined && held.begun <= first.t) continue;
    opened.set(first.by, { id, cost: cost.get(id) ?? 0, begun: first.t, by: first.by });
  }
  return [...opened.values()].sort((a, b) => a.begun - b.begun || b.cost - a.cost);
}

function firstWave(ctx: ObjectiveContext): FirstWave {
  const cost = costOfEach(ctx);
  const size = Math.min(ctx.initialWorld.bots.length, cost.size);
  const opened = openingJobs(ctx);
  return {
    size,
    wave: opened.slice(0, size),
    dearest: [...cost.values()].sort((a, b) => b - a).slice(0, size),
    hands: opened.length,
  };
}

function dearestFirst(ctx: ObjectiveContext): boolean {
  const { size, wave, dearest } = firstWave(ctx);
  if (size === 0 || wave.length < size) return false;
  const taken = wave.map((job) => job.cost).sort((a, b) => b - a);
  return taken.every((each, index) => each === dearest[index]);
}

function wrongWave(ctx: ObjectiveContext): Divergence {
  const { size, wave, hands } = firstWave(ctx);
  if (wave.length < size) {
    return {
      where: 'the first jobs',
      expected: `${String(size)} bots on a job of their own`,
      received: `${String(hands)} started one`,
    };
  }
  const inWave = new Set(wave.map((job) => job.id));
  let passedOver = 0;
  for (const [id, cost] of costOfEach(ctx)) {
    if (!inWave.has(id) && cost > passedOver) passedOver = cost;
  }
  let weakest = wave[0] as WaveJob;
  for (const job of wave) if (job.cost < weakest.cost) weakest = job;
  return {
    where: weakest.id,
    expected: `a job costing ${String(passedOver)} or more`,
    received: `cost ${String(weakest.cost)}, started at tick ${String(weakest.begun)}`,
  };
}

export const w7_04: LevelDef = {
  id: 'w7-04',
  world: 7,
  index: 4,
  title: 'Dispatch',
  hardware: [],
  costs: { use: 1 },
  brief: [
    'Head office wants the long jobs started first. It read this in a book, and now it also wants to know which job finished last. — M. Vance',
    '',
    '**Several bots share many jobs of different costs. Finish every job before the deadline.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the bot count, four to eight',
      'the job count, 15 to 30',
      'the cost of each job',
      'how costs are spread: even, or a few long jobs among short ones',
      'the tile of each job',
    ],
  },
  facts: [
    { label: 'Score', value: 'The tick when the **last** bot stops.' },
    {
      label: 'Jobs',
      value:
        '`probe("job-0")` upward, with no gaps. Free. Gives `vars.cost` and the position. Returns `null` after the last job. No new jobs appear.',
    },
    {
      label: 'Doing a job',
      value:
        'Stand on it and call `use()` exactly `cost` times, 1 tick each. `power()` does not work on jobs. One `use()` too many sets it back to `open`: it needs all `cost` uses again.',
    },
    {
      label: 'Deadline',
      value: "`probe('board').vars.deadline`. The last bot must stop by this tick.",
    },
    {
      label: 'Last job',
      value:
        "Print one line, `last <job> <tick>`: the job whose final `use()` came latest, and its bot's clock right after that use.",
    },
    {
      label: 'Highest-cost jobs',
      value:
        'With n bots, these are the n jobs with the highest cost. Each bot starts one of them, a different one each. A bot starts a job with its first `use()`. Equal costs count the same. A bot with no job fails this.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 79 },
  budget: { maxTicks: 1200 },
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
        vars: { cost: job.cost, [MANUAL_ONLY]: 1 },
        cycle: cycleFor(job.cost),
      });
    }

    const bound = boundOf(
      jobs.map((job) => job.cost),
      bots,
    );
    addMachine(world, {
      id: 'board',
      kind: MachineKind.Lever,
      at: vec(DEPOT_X, 1),
      state: 'idle',
      inventory: [],
      vars: { jobs: jobs.length, bound, deadline: deadlineOf(bound) },
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
      'Finish every job',
      (ctx) => doneCount(ctx.world) === jobMachines(ctx.initialWorld).length,
      { progress, divergence: unfinishedJob },
    ),
    Objectives.custom(
      'inside-the-deadline',
      'The last bot stops by the deadline',
      (ctx) => ctx.trace.endTick <= deadlineIn(ctx.initialWorld),
      {
        progress: (ctx) => {
          const limit = deadlineIn(ctx.initialWorld);
          return [Math.min(ctx.trace.endTick, limit), limit];
        },
        divergence: overranDeadline,
        meter: { kind: 'ticks' },
        unit: 'ticks',
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-decider',
      'Print which job finished last',
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
    Objectives.custom(
      'long-jobs-first',
      'Each bot starts with one of the highest-cost jobs',
      dearestFirst,
      { divergence: wrongWave },
    ),
  ],
  starter: [
    '// The jobs are not sorted by cost.',
    '',
    'const board = probe("board");',
    'const jobs = [];',
    'for (let i = 0; i < board.vars.jobs; i++) jobs.push(probe(`job-${i}`));',
    'print(`${jobs.length} jobs, deadline ${board.vars.deadline}`);',
    '',
  ].join('\n'),
  hints: [
    'Do not split all the jobs before the start. Give a bot its next job when it becomes free.',
    'Bots become free at different times. You can work out which bot is free next without asking it.',
    'The last job to start decides when the shift ends. It is better if that job is short.',
    'A nearer job finishes sooner. But the cost of the job matters more.',
  ],
  docs: ['bots', 'sync', 'probe', 'use'],
};
