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
      where: 'the first wave',
      expected: `${String(size)} bots on a job of their own`,
      received: `${String(hands)} ever began one`,
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
    received: `cost ${String(weakest.cost)}, begun at tick ${String(weakest.begun)}`,
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
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:** Yard 7 dispatch',
    '',
    'The board is a different size every shift. Some items are a minute. Some are the whole',
    'shift. The board does not distinguish between these, and neither, historically, have we.',
    'Head office wants the long ones started first, and a line naming whatever held us open.',
    '',
    'Clear the board inside the shift.',
  ].join('\n'),
  board: {
    fixed: [
      'the yard is 26 by 18 of open floor inside its wall',
      'the whole fleet starts at Depot 0 on the west wall, one bot to a row',
      'the jobs stand in a block seven columns wide, with an empty row between every row of them',
      'the jobs are `job-0` upward with no gaps, and the board never gains one mid-shift',
      'no job costs more than twenty uses, and `probe` reports every cost before anybody moves',
    ],
    redrawn: [
      'how many bots the requisition approves, four to eight',
      'how many jobs are on the board, fifteen to thirty',
      'what each job costs',
      'how the costs are spread — one shift is all much of a muchness, another puts a handful of long jobs among short ones',
      'which yard tile each job stands on',
    ],
  },
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops.' },
    {
      label: 'The jobs',
      value:
        '`job-0` upward. `probe(id)` is free, reports `vars.cost` and the position, and gives back `null` past the last one.',
    },
    {
      label: 'Clearing one',
      value:
        'Stand on the job and call `use()` exactly `cost` times. One tick each. A job is hand-worked and `power()` reaches none of them — `vars.manual` is 1 on every one.',
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
      label: 'The deadline',
      value:
        "`probe('board').vars.deadline` — twice the load bound, posted before anybody moves. The shift is only cleared if the last bot stops on or before it, which no fleet that leaves bots at the depot will manage.",
    },
    {
      label: 'Shift report',
      value:
        'One line, `last <job> <tick>`: the job whose final `use()` landed latest — not necessarily the last one you dispatched — and the clock reading of the bot that closed it, straight after that use.',
    },
    {
      label: 'The first wave',
      value:
        'A job is begun on the tick of its first `use()`. For the star, the job each bot begins first must be one of the most expensive jobs on the board — one bot to each of them, so a bot that never begins a job costs you the star. Costs are compared, not job ids, so jobs of equal cost are interchangeable.',
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
      'Leave every job on the board done',
      (ctx) => doneCount(ctx.world) === jobMachines(ctx.initialWorld).length,
      { progress, divergence: unfinishedJob },
    ),
    Objectives.custom(
      'inside-the-deadline',
      'Stop the last bot inside the deadline the board posts',
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
    Objectives.custom(
      'long-jobs-first',
      'Put the fleet on the most expensive jobs first',
      dearestFirst,
      { divergence: wrongWave },
    ),
  ],
  starter: [
    '// NOTE(4470): the board is not sorted. it has never been sorted',
    '// NOTE(4470): the twenty-tick jobs are the ones that decide the shift',
    '',
    'const board = probe("board");',
    'const jobs = [];',
    'for (let i = 0; i < board.vars.jobs; i++) jobs.push(probe(`job-${i}`));',
    'print(`${jobs.length} jobs, bound ${board.vars.bound}, deadline ${board.vars.deadline}`);',
    '',
  ].join('\n'),
  hints: [
    'Splitting the board between the bots before anybody moves is one decision made with no information. Deciding one job at a time is many decisions, each made with more.',
    'Two bots do not become free at the same moment. The interesting question at any point is which one is free soonest, and you can answer it without asking the bot.',
    'The last job to be started decides when the shift ends. It is much better for that job to be a short one.',
    'A bot that is nearer to a job finishes it sooner. That matters, but not as much as the number written on the job.',
    'Every bot is idle at the start, so the opening move is one free choice per bot, made with the whole board already known. Nothing later in the shift is that unconstrained.',
  ],
  docs: ['bots', 'sync', 'probe', 'use'],
};
