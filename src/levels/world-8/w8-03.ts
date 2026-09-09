import type { Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MANUAL_ONLY,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addMachine,
  createWorld,
  manhattan,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  carveLine,
  criticalChain,
  dependenciesOf,
  localRng,
  machinesWithPrefix,
  overranBy,
} from './shared.ts';

const WIDTH = 32;
const HEIGHT = 24;
const USE_COST = 2;

/**
 * Reading the desk and then every station once costs at most 21 probes on the widest seed, so
 * the star is there for anyone who plans from that one read rather than polling the grid for
 * state they already hold. It is deliberately not a gate: the second axis on this level is a
 * consolation, not a fifth way to fail a 9/10.
 */
const SURVEY_BUDGET = 26;

/** Where the crew parks. The desk sits in the middle of it and every bot starts within a tile. */
const DESK = vec(2, 12);
const CREW: readonly Vec[] = [
  vec(1, 11),
  vec(1, 12),
  vec(1, 13),
  vec(2, 11),
  vec(2, 13),
  vec(3, 11),
  vec(3, 12),
  vec(3, 13),
];

interface Layout {
  stations: number;
  bots: number;
  /** Number of layers in the DAG. 1 is a fan with no edges at all; `stations` is a single chain. */
  layers: number;
}

/**
 * Seed 2 is the single chain, where the fleet buys pre-positioning and nothing else. Seed 3 is the
 * flattest grid — three bands of six across six bots — where almost everything is ready at once.
 * The rest sit between them, and the station-to-bot ratio moves as well, so the correct schedule
 * is a function of both.
 *
 * Seed 3 was `layers: 1`, a fan with no edges at all, and that was two defects wearing one number.
 * `precedence-held` is *vacuously true* on a grid with no edges, so the seed did not exercise the
 * objective the level is about; and `deadlineFor` is a function of the chain, so the seed with no
 * chain got the tightest shift in the set — 98 ticks, under the silver cut of a flat par. The
 * level graded hardest on the one layout that had removed its own idea. Three bands keeps the
 * anti-hardcode axis (a program that assumes a chain still breaks here)
 * and gives the objective something to hold.
 */
const LAYOUTS: Record<number, Layout> = {
  1: { stations: 14, bots: 4, layers: 4 },
  2: { stations: 14, bots: 4, layers: 14 },
  3: { stations: 18, bots: 6, layers: 3 },
  4: { stations: 20, bots: 8, layers: 4 },
  5: { stations: 16, bots: 5, layers: 6 },
};

function layoutFor(seed: number): Layout {
  const fixed = LAYOUTS[seed];
  if (fixed) return fixed;
  const rng = localRng(seed * 31 + 7);
  const stations = rng.int(14, 20);
  return { stations, bots: rng.int(4, 8), layers: rng.int(2, 6) };
}

/** Splits `total` stations across `layers` bands, front-loaded so the top of the grid is wide. */
function bandSizes(total: number, layers: number): number[] {
  const sizes = new Array<number>(layers).fill(1);
  for (let i = layers; i < total; i++) sizes[i % layers] = (sizes[i % layers] as number) + 1;
  return sizes;
}

/** Scattered station tiles, kept apart so the fleet is not queueing on one square of the plain. */
function stationSites(seed: number, count: number): Vec[] {
  const rng = localRng(seed);
  const candidates: Vec[] = [];
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 7; x < WIDTH - 1; x++) candidates.push(vec(x, y));
  }
  const pool = rng.shuffle(candidates);
  for (const spacing of [5, 4, 3, 2, 1]) {
    const chosen: Vec[] = [];
    for (const at of pool) {
      if (chosen.length === count) break;
      if (chosen.every((taken) => manhattan(taken, at) >= spacing)) chosen.push(at);
    }
    if (chosen.length === count) return chosen;
  }
  return pool.slice(0, count);
}

function stationsOf(world: World): Machine[] {
  return machinesWithPrefix(world, 'sub-');
}

/**
 * Mean walking distance between two station tiles, rounded up. The plain is open, so Manhattan is
 * the true cost of a hop, and this is the honest price of "and then go to the next one".
 */
function meanHop(world: World): number {
  const sites = stationsOf(world).map((machine) => machine.at);
  if (sites.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      total += manhattan(sites[i] as Vec, sites[j] as Vec);
      pairs++;
    }
  }
  return Math.ceil(total / pairs);
}

/** Stations the busiest bot has to own if the work is shared out evenly. */
function lanes(world: World): number {
  const crew = world.bots.filter((bot) => bot.alive).length;
  return crew === 0 ? stationsOf(world).length : Math.ceil(stationsOf(world).length / crew);
}

/**
 * The shift.
 *
 * Two things have to happen and neither can be compressed away: the longest chain of feeders has
 * to run end to end, and the busiest bot has to walk its own round. Each is charged at a hop plus
 * an energising, and one hop is added for getting out of the yard. A grid with no edges therefore
 * gets a short shift and a grid that is one long chain gets a long one.
 */
function deadlineFor(world: World): number {
  const hop = meanHop(world);
  return (criticalChain(world) + lanes(world)) * (USE_COST + hop) + hop;
}

/**
 * The shift and the medal ladder are the same axis, so the shift has to sit above the ladder.
 *
 * Par is flat and `deadlineFor` is not, and for one seed the two disagreed: par 128 called a run
 * gold up to 128 on a layout that failed it outright at 99. A ladder that promises a rung inside a
 * band the verdict has already refused is not a ladder. `w8-03 grades and fails on one axis` in
 * `src/levels/world-8/__tests__/divergence.test.ts` holds this on every seed, and it is what any
 * future change to `deadlineFor`, to a `LAYOUTS` row or to par has to keep true.
 */
const PAR_TICKS = 84;

/** The first station the audit will not sign off, and why. */
function darkStation(ctx: ObjectiveContext): { id: string; at: Vec; reason: string } | undefined {
  const switched = usedMachines(ctx);
  for (const machine of stationsOf(ctx.world)) {
    if (machine.state === 'on' && switched.has(machine.id)) continue;
    const reason = switched.has(machine.id)
      ? `${machine.state} — used an even number of times`
      : 'never used; no bot stood on it';
    return { id: machine.id, at: machine.at, reason };
  }
  return undefined;
}

function usedMachines(ctx: ObjectiveContext): Set<string> {
  const switched = new Set<string>();
  for (const event of ctx.trace.events) {
    if (event.kind === 'use' && event.ok && event.machineId !== null) switched.add(event.machineId);
  }
  return switched;
}

function allEnergised(ctx: ObjectiveContext): number {
  const switched = usedMachines(ctx);
  return stationsOf(ctx.world).filter(
    (machine) => machine.state === 'on' && switched.has(machine.id),
  ).length;
}

/**
 * Precedence, read out of the log.
 *
 * A station's start is the first tick anyone energised it; a feeder's finish is the last tick any
 * energising of it was still running. A start at exactly the feeder's finish is legal, which is
 * what makes ties unambiguous rather than a matter of taste.
 */
interface Breach {
  station: string;
  feeder: string;
  started: number;
  fedAt: number;
}

function breachesIn(ctx: ObjectiveContext): Breach[] {
  const starts = new Map<string, number>();
  const finishes = new Map<string, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok || event.machineId === null) continue;
    const id = event.machineId;
    const start = starts.get(id);
    if (start === undefined || event.t < start) starts.set(id, event.t);
    const finish = finishes.get(id);
    const done = event.t + event.dt;
    if (finish === undefined || done > finish) finishes.set(id, done);
  }

  const breaches: Breach[] = [];
  for (const machine of stationsOf(ctx.initialWorld)) {
    const start = starts.get(machine.id);
    if (start === undefined) continue;
    for (const feeder of dependenciesOf(machine)) {
      const finish = finishes.get(feeder);
      if (finish !== undefined && start < finish) {
        breaches.push({ station: machine.id, feeder, started: start, fedAt: finish });
      }
    }
  }
  return breaches;
}

/** The earliest one, because a restart that went out of order went out of order once first. */
function firstBreach(ctx: ObjectiveContext): Breach | undefined {
  return breachesIn(ctx).reduce<Breach | undefined>(
    (earliest, breach) =>
      earliest === undefined || breach.started < earliest.started ? breach : earliest,
    undefined,
  );
}

/**
 * An open plain with a dependency graph painted onto it in cable.
 *
 * The map is deliberately featureless: there is no route to work out, no wall to go around and
 * almost nothing for two bots to argue over. Everything that is hard here is in the order the
 * stations may be touched and in who is standing where when they may be touched.
 */
export const w8_03: LevelDef = {
  id: 'w8-03',
  world: 8,
  index: 3,
  title: 'The Grid Goes Down',
  hardware: [],
  brief: [
    '**MEMO KD-2833**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:**   Grid restart',
    '',
    'The grid is down. Restarting it is a sequencing matter and not, at this time, an',
    'engineering one. Finance have allocated one shift, costed against the whole fleet, and the',
    'whole fleet is already standing in the yard.',
    '',
    'Energise every substation before the shift ends.',
  ].join('\n'),
  facts: [
    {
      label: 'The desk',
      value:
        '`probe("desk")`. Its `vars.stations` is how many substations there are, named `sub-0` up to `sub-<n-1>`, and its `vars.shift` is how many ticks Finance allocated.',
    },
    {
      label: 'The shift',
      value:
        'Overrunning `vars.shift` fails the work order. It is set from the grid — the longest chain of feeders and the round the busiest bot has to walk — so it moves with the layout.',
    },
    {
      label: 'A station',
      value:
        '`probe(id)` reads any machine from anywhere and costs no ticks. The calls are counted, though — the survey bonus is scored on how many the whole fleet makes, not how many each bot makes.',
    },
    {
      label: 'Feeders',
      value:
        '`vars.deps` is how many stations feed this one. `vars.dep0`, `vars.dep1` … hold their numbers, so `dep0: 3` means `sub-3` feeds it.',
    },
    {
      label: 'Energising',
      value:
        'Stand on the station tile and call `use()`. Two ticks. The cycle is `off, on` and it wraps, so a second use turns it back off.',
    },
    {
      label: 'The order rule',
      value:
        'A station may not **start** until every feeder has **finished**. A `use` at tick 40 finishes at 42, so 42 is legal and 41 is not. Read off the log, not the final state.',
    },
    {
      label: 'The plain',
      value:
        'Open. The cable on the ground is walkable. The layout and the feeder lists are fixed before the shift starts — the only thing that changes while you run is a station state.',
    },
    { label: 'Your score', value: 'The clock stops when the last bot stops.' },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS },
  build(seed: number): World {
    const layout = layoutFor(seed);
    const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Floor });

    const layers = Math.max(1, Math.min(layout.layers, layout.stations));
    const sizes = bandSizes(layout.stations, layers);
    const sites = stationSites(seed, layout.stations);
    const rng = localRng(seed + 991);

    const bands: number[][] = [];
    let next = 0;
    for (const size of sizes) {
      const band: number[] = [];
      for (let i = 0; i < size; i++) band.push(next++);
      bands.push(band);
    }

    setTerrain(world, DESK, Terrain.Pad);
    carveLine(world, DESK, vec(WIDTH - 2, DESK.y), Terrain.Cable);

    for (let band = 0; band < bands.length; band++) {
      const feeders = band === 0 ? [] : (bands[band - 1] as number[]);
      for (const index of bands[band] as number[]) {
        const at = sites[index] as Vec;
        const chosen =
          feeders.length === 0
            ? []
            : rng.shuffle(feeders).slice(0, Math.min(feeders.length, rng.int(1, 2)));
        const vars: Record<string, number> = { deps: chosen.length, [MANUAL_ONLY]: 1 };
        chosen.forEach((feeder, i) => {
          vars[`dep${i}`] = feeder;
          const from = sites[feeder] as Vec;
          carveLine(world, from, vec(at.x, from.y), Terrain.Cable);
          carveLine(world, vec(at.x, from.y), at, Terrain.Cable);
        });
        addMachine(world, {
          id: `sub-${index}`,
          kind: MachineKind.Node,
          at,
          state: 'off',
          inventory: [],
          vars,
          cycle: ['off', 'on'],
        });
      }
    }

    for (const site of sites) setTerrain(world, site, Terrain.Cable);
    setTerrain(world, DESK, Terrain.Pad);

    const crew = Math.max(1, Math.min(layout.bots, CREW.length));
    for (let i = 0; i < crew; i++) {
      addBot(world, { at: CREW[i] as Vec, facing: Dir.East, name: `RIG-8${String(30 + i)}` });
    }

    /* Posted after the fleet is on the pad because the shift is a function of it: `deadlineFor`
       divides the stations across the crew. A budget the player can only learn by overrunning it
       is the trap `MANUAL_ONLY` is written to avoid, so it rides in `vars` where `probe` publishes
       it, next to the station count that is read in the same call. */
    addMachine(world, {
      id: 'desk',
      kind: MachineKind.Router,
      at: DESK,
      state: 'on',
      inventory: [],
      vars: { stations: layout.stations, shift: deadlineFor(world) },
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'grid-live',
      'Leave every substation energised',
      (ctx) => allEnergised(ctx) === stationsOf(ctx.world).length,
      {
        progress: (ctx) => [allEnergised(ctx), stationsOf(ctx.world).length],
        divergence: (ctx) => {
          const dark = darkStation(ctx);
          if (!dark) return undefined;
          return {
            where: `${dark.id} at (${String(dark.at.x)}, ${String(dark.at.y)})`,
            expected: 'on, switched by a use() at the tile',
            received: dark.reason,
          };
        },
      },
    ),
    Objectives.custom(
      'precedence-held',
      'Start no station before every feeder it hangs off has finished',
      (ctx) => breachesIn(ctx).length === 0,
      {
        /* Divergence says which feeder was jumped; this says how much of the grid came up in
           order anyway, so a schedule that is one edge wrong does not read like one that is
           entirely wrong. */
        progress: (ctx) => {
          const total = stationsOf(ctx.initialWorld).length;
          const early = new Set(breachesIn(ctx).map((breach) => breach.station));
          return [Math.max(0, total - early.size), total];
        },
        divergence: (ctx) => {
          const breach = firstBreach(ctx);
          if (!breach) return undefined;
          return {
            where: `${breach.station} · feeder ${breach.feeder}`,
            expected: `start at tick ${String(breach.fedAt)} or later`,
            received: `started at tick ${String(breach.started)}`,
          };
        },
      },
    ),
    Objectives.custom(
      'within-shift',
      'Finish the whole grid inside the shift the desk posts',
      (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
      {
        progress: (ctx) => [ctx.trace.endTick, deadlineFor(ctx.initialWorld)],
        divergence: (ctx) => overranBy(ctx, deadlineFor(ctx.initialWorld)),
        meter: { kind: 'ticks' },
        unit: 'ticks',
      },
    ),
  ],
  bonus: [
    Objectives.withinSenses('probe', SURVEY_BUDGET, {
      label: `Plan the restart on ${String(SURVEY_BUDGET)} probe() calls or fewer`,
    }),
  ],
  starter: [
    "// import { waves, deal, pathTo } from 'lib';",
    '// The desk publishes how many substations there are and how long the shift is.',
    '// Each station publishes its own feeders.',
    '',
    'const count = probe("desk").vars.stations;',
    'for (let i = 0; i < count; i++) {',
    '  const station = probe("sub-" + i);',
    '  print(i + " at " + station.at.x + "," + station.at.y + " deps " + station.vars.deps);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Two bots given orders one after the other do not take turns. They spend the same ticks. The only thing that makes one bot wait for another is a wait or a sync you wrote.',
    'A feeder list is not a queue. Read every station before anyone moves. Ask which stations have nothing feeding them, then which have nothing left unfinished above them, and so on down.',
    'A bot sitting on its station with nothing to do is cheaper than a bot walking. Decide who goes where before anyone leaves the yard.',
    'The grid is fixed the moment the shift starts. Reading a station to find out whether it came up yet tells you nothing you did not already know.',
  ],
  docs: ['probe', 'use', 'bots', 'wait', 'sync'],
};
