import type { Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
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
import { carveLine, criticalChain, dependenciesOf, localRng, machinesWithPrefix } from './shared.ts';

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
 * fan with no edges at all, where every station is ready at tick zero. The rest sit between them,
 * and the station-to-bot ratio moves as well, so the correct schedule is a function of both.
 */
const LAYOUTS: Record<number, Layout> = {
  1: { stations: 14, bots: 4, layers: 4 },
  2: { stations: 14, bots: 4, layers: 14 },
  3: { stations: 18, bots: 6, layers: 1 },
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

/** The energising itself, plus the walking the busiest bot cannot avoid doing. */
function targetFor(world: World): number {
  return criticalChain(world) * USE_COST + (lanes(world) + 2) * meanHop(world);
}

function allEnergised(ctx: ObjectiveContext): number {
  return stationsOf(ctx.world).filter((machine) => machine.state === 'on').length;
}

/**
 * Precedence, read out of the log.
 *
 * A station's start is the first tick anyone energised it; a feeder's finish is the last tick any
 * energising of it was still running. A start at exactly the feeder's finish is legal, which is
 * what makes ties unambiguous rather than a matter of taste.
 */
function precedenceBreaches(ctx: ObjectiveContext): number {
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

  let breaches = 0;
  for (const machine of stationsOf(ctx.initialWorld)) {
    const start = starts.get(machine.id);
    if (start === undefined) continue;
    for (const feeder of dependenciesOf(machine)) {
      const finish = finishes.get(feeder);
      if (finish !== undefined && start < finish) breaches++;
    }
  }
  return breaches;
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
    'engineering one. Finance have allocated one shift. The shift was costed against the whole',
    'fleet, and the whole fleet is already standing in the yard.',
    '',
    'Energise every substation before the shift ends.',
    '',
    '**The desk.** `probe("desk")` returns the control desk. Its `vars.stations` is how many',
    'substations there are; they are `sub-0` up to `sub-<n-1>`.',
    '',
    '**A station.** `probe(id)` works on any machine from anywhere, for nothing. `vars.deps` is',
    'how many feeders that station hangs off, and `vars.dep0`, `vars.dep1` and so on are the',
    'index numbers of those feeders — `dep0: 3` means `sub-3` feeds it.',
    '',
    '**Energising.** Stand on the station tile and call `use()`, for two ticks. The cycle is',
    '`off, on` and it wraps, so using a station twice turns it back off.',
    '',
    '**The rule the audit enforces.** A station may not *begin* energising until every feeder it',
    'hangs off has *finished*. A `use` that starts at tick 40 finishes at tick 42, so anything',
    'hanging off that station may start at tick 42 or later, and not at 41. The audit reads the',
    'log, not the final state.',
    '',
    '**The deadline** is set per shift, from the shape of the grid and the size of the fleet.',
    'The objectives panel shows it against your makespan.',
    '',
    'The plain is open and the cable on the ground is walkable. Your score is the makespan.',
    '',
    '**Extra objective.** Restart the grid on at most 26 reads of the desk and the stations',
    'together. The grid is fixed the moment the shift starts; a station polled to find out',
    'whether it came up yet is a station you already knew about.',
    '',
    '**The Repository.** You have already filed everything this needs. It assumes `lib.ts`',
    'holds:',
    '',
    '- `waves(deps)` — groups a dependency list so nothing in a group waits on anything else in',
    "  it. `import { waves } from 'lib';`",
    '- `deal(costs, fleet)` — hands jobs out, heaviest first, each to the least-loaded worker.',
    "  `import { deal } from 'lib';`",
    "- `pathTo(x, y, b?)` — walks a bot to a tile. `import { pathTo } from 'lib';`",
    '',
    'If any of them is not in there, write it in this file.',
    '',
    'One says what may be done at the same time; the other says who does it. A routine that',
    'calls both is worth keeping. Later briefs call it `dispatch`.',
  ].join('\n'),
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 128, chars: 2500 },
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
        const vars: Record<string, number> = { deps: chosen.length };
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

    addMachine(world, {
      id: 'desk',
      kind: MachineKind.Router,
      at: DESK,
      state: 'on',
      inventory: [],
      vars: { stations: layout.stations },
    });

    const crew = Math.max(1, Math.min(layout.bots, CREW.length));
    for (let i = 0; i < crew; i++) {
      addBot(world, { at: CREW[i] as Vec, facing: Dir.East, name: `RIG-8${String(30 + i)}` });
    }
    return world;
  },
  objectives: [
    Objectives.custom(
      'grid-live',
      'Leave every substation energised',
      (ctx) => allEnergised(ctx) === stationsOf(ctx.world).length,
      (ctx) => [allEnergised(ctx), stationsOf(ctx.world).length],
    ),
    Objectives.custom(
      'precedence-held',
      'Start no station before every feeder it hangs off has finished',
      (ctx) => precedenceBreaches(ctx) === 0,
    ),
    Objectives.custom(
      'within-shift',
      'Finish the whole grid before the shift deadline',
      (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
      (ctx) => [ctx.trace.endTick, deadlineFor(ctx.initialWorld)],
    ),
  ],
  bonus: [
    Objectives.custom(
      'tight-shift',
      "Finish within the shift's theoretical minimum plus travel",
      (ctx) => ctx.trace.endTick <= targetFor(ctx.initialWorld),
      (ctx) => [ctx.trace.endTick, targetFor(ctx.initialWorld)],
    ),
    Objectives.withinSenses('probe', SURVEY_BUDGET, {
      label: `Plan the restart on ${String(SURVEY_BUDGET)} reads or fewer`,
    }),
  ],
  starter: [
    "// import { waves, deal, pathTo } from 'lib';",
    '// The desk publishes how many substations there are. Each one publishes its own feeders.',
    '',
    'const count = probe("desk").vars.stations;',
    'for (let i = 0; i < count; i++) {',
    '  const station = probe("sub-" + i);',
    '  print(i + " at " + station.at.x + "," + station.at.y + " deps " + station.vars.deps);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Two bots given orders one after the other do not take turns. They spend the same ticks. The only things in this level that make one bot wait for another are a wait you wrote and a sync you called.',
    'A feeder list is not a queue. Read every station before anyone moves, and ask which stations have nothing above them at all — then which have nothing above them once those are finished, and so on down.',
    'A bot standing on its station with nothing to do is cheaper than a bot walking. Work out who is going where before anyone leaves the yard, and let the ones who arrive early sit.',
  ],
  docs: ['probe', 'use', 'bots', 'wait', 'sync'],
};
