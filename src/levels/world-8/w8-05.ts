import type {
  Divergence,
  Machine,
  ObjectiveContext,
  Vec,
  World,
} from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  MANUAL_ONLY,
  MachineKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  clipValue,
  createWorld,
  inventoryCount,
  machineById,
  manhattan,
  rebuildOccupancy,
  setTerrain,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  carveCaves,
  carveLine,
  criticalChain,
  dependenciesOf,
  groundCensus,
  itemsOnTile,
  key,
  loadAntenna,
  localRng,
  machinesWithPrefix,
  overranBy,
  point,
  scatterCandidates,
  sealPacket,
  useLog as machineUseLog,
  worldDistances,
} from './shared.ts';

const WIDTH = 48;
const HEIGHT = 40;

/** Rooms are drawn with this margin, so the carved cave never reaches past x = 40. */
const CARVE_MARGIN = 6;

/** The muster bay. West of everything, outside the carve box, hand-built so it is always there. */
const SPAWN = { x: 1, y: 16, w: 5, h: 8 };
const EXIT_ROW = 20;
const HOME_DEPOT: Vec = { x: 4, y: EXIT_ROW };
const DESK_AT: Vec = { x: 2, y: EXIT_ROW };

/** The airlock stands here; its two gate tiles are the next two east. */
const GATE_X = 40;
const CHAMBER_X0 = 43;
const CHAMBER_X1 = WIDTH - 1;
const CHAMBER_REACH = 3;

/**
 * Ten entries, the first of which is the state the door starts in, so `use()` reaches `open` on
 * the ninth call and not before. `vars.stages` publishes that nine so a program never has to
 * count the list.
 */
const AIRLOCK_CYCLE = ['sealed', '1', '2', '3', '4', '5', '6', '7', '8', 'open'];
const AIRLOCK_STAGES = AIRLOCK_CYCLE.length - 1;

/** The five kinds a crate class may be drawn from. Named in the brief. */
const CLASS_KINDS = [ItemKind.Ore, ItemKind.Ice, ItemKind.Scrap, ItemKind.Part, ItemKind.Cell];

const DEPOT_PREFIX = 'depot-';
const STATION_PREFIX = 'sub-';

/**
 * One instance per seed. Every axis is drawn independently of the others.
 *
 * Three seeds, and each of them asks a different question. Seed 1 is the general case and the
 * teaching instance: a branching grid, the smallest fleet, the smallest quota, and the shape a
 * player should be able to close first. Seed 4 is a pure chain — the grid cannot be parallelised
 * at all, so a fleet that waits on it wastes the whole shift and the answer is to spend the fleet
 * on the crates instead. Seed 7 is the squeeze: the same six bots against twelve stations and
 * twenty crates, where fuel and not scheduling is what runs out.
 *
 * The four seeds this table used to carry moved the same numbers without moving a decision, and
 * seven randomisations of a 48x40 map is seven times the failure surface for no extra idea.
 * docs/FIX-FINALE.md records which went and why.
 */
interface Instance {
  bots: number;
  stations: number;
  crates: number;
  classes: number;
  shape: 'wide' | 'chain';
  fuel: number;
  depots: number;
}

const INSTANCES: readonly (readonly [number, Instance])[] = [
  [1, { bots: 6, stations: 8, crates: 12, classes: 3, shape: 'wide', fuel: 110, depots: 4 }],
  [4, { bots: 7, stations: 10, crates: 15, classes: 4, shape: 'chain', fuel: 110, depots: 4 }],
  [7, { bots: 6, stations: 12, crates: 20, classes: 4, shape: 'wide', fuel: 120, depots: 5 }],
];

function instanceFor(seed: number): Instance {
  for (const [id, spec] of INSTANCES) if (id === seed) return spec;
  return INSTANCES[0]?.[1] as Instance;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function carveRect(world: World, box: { x: number; y: number; w: number; h: number }): void {
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) setTerrain(world, { x, y }, Terrain.Floor);
  }
}

function walkableAt(world: World, at: Vec): boolean {
  const tile = tileAt(world, at);
  if (!tile) return false;
  return tile.terrain === Terrain.Floor || tile.terrain === Terrain.Depot;
}

/**
 * Corridors come out of `carveCaves` one tile wide, which turns every junction into a place two
 * bots can hold each other still forever. Widening anything with two or fewer floor neighbours
 * leaves the rooms alone and gives every passage somewhere to step aside.
 */
function widenPassages(world: World): void {
  const before: boolean[] = world.tiles.map((tile) => tile.terrain === Terrain.Floor);
  const solid = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || before[y * WIDTH + x] !== true;

  for (let y = 1; y <= HEIGHT - 2; y++) {
    for (let x = 1; x <= GATE_X - 1; x++) {
      if (solid(x, y)) continue;
      let open = 0;
      if (!solid(x - 1, y)) open++;
      if (!solid(x + 1, y)) open++;
      if (!solid(x, y - 1)) open++;
      if (!solid(x, y + 1)) open++;
      if (open > 2) continue;
      if (y + 1 <= HEIGHT - 2) setTerrain(world, { x, y: y + 1 }, Terrain.Floor);
      if (x + 1 <= GATE_X) setTerrain(world, { x: x + 1, y }, Terrain.Floor);
    }
  }
}

function nearestFloor(world: World, to: Vec, allow: (at: Vec) => boolean): Vec {
  let best: Vec = to;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const at = { x, y };
      if (!walkableAt(world, at) || !allow(at)) continue;
      const distance = manhattan(at, to);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = at;
      }
    }
  }
  return best;
}

/** Anything the muster bay cannot reach is filled back in, so the site is one component. */
function sealStrandedGround(world: World, from: Vec): void {
  const reached = worldDistances(world, from);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (x > GATE_X) continue;
      const at = { x, y };
      if (!walkableAt(world, at)) continue;
      if (reached.has(y * WIDTH + x)) continue;
      setTerrain(world, at, Terrain.Rock);
    }
  }
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function build(seed: number): World {
  const spec = instanceFor(seed);
  const rng = localRng(seed);
  const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Rock });

  const rooms = carveCaves(world, rng, {
    rooms: 16,
    minSize: 4,
    maxSize: 8,
    margin: CARVE_MARGIN,
  });

  // A tree of corridors makes every corridor a cut vertex. A few extra joins remove that.
  for (let i = 0; i + 3 < rooms.length; i += 3) {
    const a = rooms[i];
    const b = rooms[i + 3];
    if (!a || !b) continue;
    const from = { x: a.x + (a.w >> 1), y: a.y + (a.h >> 1) };
    const to = { x: b.x + (b.w >> 1), y: b.y + (b.h >> 1) };
    carveLine(world, from, { x: to.x, y: from.y });
    carveLine(world, { x: to.x, y: from.y }, to);
  }

  carveRect(world, SPAWN);
  const bayMouth: Vec = { x: SPAWN.x + SPAWN.w - 1, y: EXIT_ROW };
  const junction = nearestFloor(world, { x: CARVE_MARGIN, y: EXIT_ROW }, (at) => at.x >= CARVE_MARGIN);
  carveLine(world, bayMouth, { x: junction.x, y: bayMouth.y });
  carveLine(world, { x: junction.x, y: bayMouth.y }, junction);

  const gateRow = 16 + rng.int(0, 8);
  const gateStand: Vec = { x: GATE_X, y: gateRow };
  const approach = nearestFloor(world, gateStand, (at) => at.x <= GATE_X - 2);
  carveLine(world, approach, { x: gateStand.x, y: approach.y });
  carveLine(world, { x: gateStand.x, y: approach.y }, gateStand);

  widenPassages(world);

  const bayCentre: Vec = { x: SPAWN.x + 1, y: EXIT_ROW };
  sealStrandedGround(world, bayCentre);
  setTerrain(world, gateStand, Terrain.Floor);

  // The two gate tiles. `links` only repaints on a state change, so build paints them shut.
  const gates: Vec[] = [
    { x: GATE_X + 1, y: gateRow },
    { x: GATE_X + 2, y: gateRow },
  ];
  for (const at of gates) setTerrain(world, at, Terrain.Wall);

  carveRect(world, {
    x: CHAMBER_X0,
    y: gateRow - CHAMBER_REACH,
    w: CHAMBER_X1 - CHAMBER_X0 + 1,
    h: CHAMBER_REACH * 2 + 1,
  });

  const charterAt: Vec = { x: CHAMBER_X1, y: gateRow - CHAMBER_REACH };
  const renewalsAt: Vec = { x: CHAMBER_X1, y: gateRow + CHAMBER_REACH };

  // ---- contents -----------------------------------------------------------

  setTerrain(world, HOME_DEPOT, Terrain.Depot);

  const pool = scatterCandidates(world, bayCentre, rng).filter(
    (at) => at.x >= CARVE_MARGIN && at.x <= GATE_X - 2 && manhattan(at, gateStand) > 2,
  );
  const used = new Set<string>();
  const take = (ok: (at: Vec) => boolean): Vec => {
    for (let i = 0; i < pool.length; i++) {
      const at = pool[i];
      if (!at || used.has(key(at)) || !ok(at)) continue;
      used.add(key(at));
      pool.splice(i, 1);
      return at;
    }
    throw new Error(`w8-05: seed ${seed} ran out of placement candidates`);
  };

  const fuelDepots: Vec[] = [HOME_DEPOT];
  for (let i = 0; i < spec.depots; i++) {
    const at = take((candidate) => fuelDepots.every((d) => manhattan(d, candidate) >= 9));
    fuelDepots.push(at);
    setTerrain(world, at, Terrain.Depot);
  }

  const antennaAt = take((at) => manhattan(at, bayCentre) >= 10);
  addMachine(world, {
    id: 'antenna',
    kind: MachineKind.Antenna,
    at: antennaAt,
    state: 'on',
    inventory: [],
    vars: { band: 4470 },
  });

  const stationAt: Vec[] = [];
  for (let i = 0; i < spec.stations; i++) {
    stationAt.push(take((at) => stationAt.every((s) => manhattan(s, at) >= 5)));
  }

  const deps: number[][] = [];
  for (let i = 0; i < spec.stations; i++) {
    if (i === 0) {
      deps.push([]);
      continue;
    }
    if (spec.shape === 'chain') {
      deps.push([i - 1]);
      continue;
    }
    if (rng.chance(0.25)) {
      deps.push([]);
      continue;
    }
    const first = rng.int(0, i - 1);
    if (i >= 3 && rng.chance(0.45)) {
      let second = rng.int(0, i - 1);
      if (second === first) second = (first + 1) % i;
      deps.push([Math.min(first, second), Math.max(first, second)]);
    } else {
      deps.push([first]);
    }
  }

  for (let i = 0; i < spec.stations; i++) {
    const vars: Record<string, number> = { deps: (deps[i] ?? []).length, [MANUAL_ONLY]: 1 };
    (deps[i] ?? []).forEach((d, n) => {
      vars[`dep${n}`] = d;
    });
    addMachine(world, {
      id: `${STATION_PREFIX}${i}`,
      kind: MachineKind.Node,
      at: stationAt[i] as Vec,
      state: 'off',
      inventory: [],
      vars,
      cycle: ['off', 'on'],
    });
  }

  const classes = rng.shuffle([...CLASS_KINDS]).slice(0, spec.classes);
  const sinkAt: Vec[] = [];
  classes.forEach((kind, i) => {
    const at = take((candidate) => sinkAt.every((s) => manhattan(s, candidate) >= 7));
    sinkAt.push(at);
    addMachine(world, {
      id: `${DEPOT_PREFIX}${kind}`,
      kind: MachineKind.Sink,
      at,
      state: 'open',
      inventory: [],
      vars: { lane: i },
    });
  });

  const crates: { at: Vec; kind: string }[] = [];
  for (let i = 0; i < spec.crates; i++) {
    const kind = classes[i % classes.length] ?? ItemKind.Ore;
    const at = take((candidate) => sinkAt.every((s) => manhattan(s, candidate) >= 2));
    crates.push({ at, kind });
    addGroundItems(world, at, kind, 1);
  }

  const formAt = take((at) => manhattan(at, bayCentre) >= 18);
  addGroundItems(world, formAt, ItemKind.Chip, 1);
  const formTile = tileAt(world, formAt);
  if (formTile) formTile.mark = 'KD-0001-T';

  addMachine(world, {
    id: 'desk',
    kind: MachineKind.Lever,
    at: DESK_AT,
    state: 'idle',
    inventory: [],
    vars: { stations: spec.stations, classes: classes.length, crates: spec.crates },
  });

  addMachine(world, {
    id: 'airlock',
    kind: MachineKind.Door,
    at: gateStand,
    state: AIRLOCK_CYCLE[0] as string,
    inventory: [],
    vars: { stages: AIRLOCK_STAGES, [MANUAL_ONLY]: 1 },
    cycle: [...AIRLOCK_CYCLE],
    links: gates,
  });

  addMachine(world, {
    id: 'slot-charter',
    kind: MachineKind.Sink,
    at: charterAt,
    state: 'open',
    inventory: [],
    vars: {},
  });
  addMachine(world, {
    id: 'slot-renewals',
    kind: MachineKind.Sink,
    at: renewalsAt,
    state: 'open',
    inventory: [],
    vars: {},
  });
  const charterTile = tileAt(world, charterAt);
  if (charterTile) charterTile.mark = 'charter registry';
  const renewalsTile = tileAt(world, renewalsAt);
  if (renewalsTile) renewalsTile.mark = 'renewals tray';

  // ---- fleet --------------------------------------------------------------

  const bays: Vec[] = [];
  for (let y = SPAWN.y; y < SPAWN.y + SPAWN.h; y++) {
    for (let x = SPAWN.x; x < SPAWN.x + SPAWN.w; x++) {
      const at = { x, y };
      if (key(at) === key(HOME_DEPOT) || key(at) === key(DESK_AT)) continue;
      bays.push(at);
    }
  }
  bays.sort((a, b) => manhattan(a, bayMouth) - manhattan(b, bayMouth) || a.y - b.y || a.x - b.x);

  for (let i = 0; i < spec.bots; i++) {
    addBot(world, {
      at: bays[i] as Vec,
      facing: Dir.East,
      name: `KD-${String(80 + i)}`,
      capacity: 6,
      fuel: spec.fuel,
      fuelMax: spec.fuel,
    });
  }

  // ---- the packet stream --------------------------------------------------

  const plain: string[] = [];
  for (const crate of crates) plain.push(sealPacket(['CRATE', crate.at.x, crate.at.y, crate.kind]));
  classes.forEach((kind, i) => {
    const at = sinkAt[i] as Vec;
    plain.push(sealPacket(['DEPOT', at.x, at.y, kind]));
  });
  plain.push(sealPacket(['FORM', formAt.x, formAt.y]));
  loadAntenna(world, antennaAt, rng.shuffle(plain));

  rebuildOccupancy(world);
  return world;
}

// ---------------------------------------------------------------------------
// Adjudication
// ---------------------------------------------------------------------------

function classSinks(world: World): Machine[] {
  return world.machines.filter((machine) => machine.id.startsWith(DEPOT_PREFIX));
}

function classOf(sink: Machine): string {
  return sink.id.slice(DEPOT_PREFIX.length);
}

function quotaTally(ctx: ObjectiveContext): [number, number] {
  const census = groundCensus(ctx.initialWorld, CLASS_KINDS);
  let done = 0;
  let total = 0;
  for (const sink of classSinks(ctx.world)) {
    const kind = CLASS_KINDS.find((candidate) => candidate === classOf(sink));
    if (kind === undefined) continue;
    const wanted = census.get(kind) ?? 0;
    total += wanted;
    done += Math.min(wanted, itemsOnTile(ctx.world, sink.at, kind));
  }
  return [done, total];
}

/**
 * The first class the shift is short of, and where its crates got to instead.
 *
 * Everything here is already on the band: `CRATE` lines give every crate and `DEPOT` lines give
 * every bay, so naming the tile costs the level nothing. What the count adds is which of the two
 * ways to be short this run was — crates never fetched, or crates fetched and still aboard.
 */
function quotaMiss(ctx: ObjectiveContext): Divergence | undefined {
  const census = groundCensus(ctx.initialWorld, CLASS_KINDS);
  for (const sink of classSinks(ctx.world)) {
    const kind = CLASS_KINDS.find((candidate) => candidate === classOf(sink));
    if (kind === undefined) continue;
    const wanted = census.get(kind) ?? 0;
    const landed = itemsOnTile(ctx.world, sink.at, kind);
    if (landed >= wanted) continue;
    const held = ctx.world.bots.reduce((sum, bot) => sum + inventoryCount(bot, kind), 0);
    const there = landed === 0 ? `no ${kind} there` : `${String(landed)} ${kind} there`;
    return {
      where: `${sink.id} at ${point(sink.at)}`,
      expected: `${String(wanted)} ${kind} on the tile`,
      received: held > 0 ? `${there}, ${String(held)} still in a hold` : there,
    };
  }
  return undefined;
}

/**
 * Stations that finished `on` *and* have somebody's `use` against them in the log.
 *
 * The brief has always said the audit reads the use log, and now it does. A station is only ever
 * `manual`, so the two readings agree today; they are both here so that the promise in the brief
 * stays true whatever a later edit does to the machine flags.
 */
function gridTally(ctx: ObjectiveContext): [number, number] {
  const switched = new Set(machineUseLog(ctx).map((record) => record.machineId));
  const stations = machinesWithPrefix(ctx.world, STATION_PREFIX);
  const done = stations.filter(
    (station) => station.state === 'on' && switched.has(station.id),
  ).length;
  return [done, stations.length];
}

/**
 * A station may not *start* energising before every feeder has *finished*.
 *
 * Read off the use log rather than the final world, because the final world cannot tell the
 * difference between a grid that came up in order and one that came up all at once.
 */
function precedenceHolds(ctx: ObjectiveContext): boolean {
  return breachesIn(ctx).length === 0;
}

/**
 * The first station the audit will not sign off, and why.
 *
 * `power()` cannot reach a station on this site, so the only two ways to be short are a station
 * nobody walked to and a station somebody used twice.
 */
function darkStation(ctx: ObjectiveContext): { id: string; at: Vec; reason: string } | undefined {
  const switched = new Set(machineUseLog(ctx).map((record) => record.machineId));
  for (const station of machinesWithPrefix(ctx.world, STATION_PREFIX)) {
    if (station.state === 'on' && switched.has(station.id)) continue;
    const reason = switched.has(station.id)
      ? `${station.state} — used an even number of times`
      : 'never used; no bot stood on it';
    return { id: station.id, at: station.at, reason };
  }
  return undefined;
}

/** Where KD-0001-T actually ended the shift, in the words the player can act on. */
function whereIsTheForm(ctx: ObjectiveContext): string {
  for (const bot of ctx.world.bots) {
    if (bot.inventory.some((stack) => stack.kind === ItemKind.Chip && stack.count > 0)) {
      return `still in the hold of ${bot.name}`;
    }
  }
  const loose = ctx.world.items.find((stack) => stack.kind === ItemKind.Chip && stack.count > 0);
  return loose
    ? `on the ground at (${String(loose.at.x)}, ${String(loose.at.y)})`
    : 'nowhere on the site';
}

/** Stations that came up in order, out of every station on the site. */
function precedenceTally(ctx: ObjectiveContext): [number, number] {
  const stations = machinesWithPrefix(ctx.initialWorld, STATION_PREFIX);
  const early = new Set(breachesIn(ctx).map((breach) => breach.station));
  return [Math.max(0, stations.length - early.size), stations.length];
}

interface Breach {
  station: string;
  feeder: string;
  started: number;
  /** The tick the feeder was done, or null when it was never energised at all. */
  fedAt: number | null;
}

function breachesIn(ctx: ObjectiveContext): Breach[] {
  const firstUse = new Map<string, number>();
  const lastDone = new Map<string, number>();
  for (const record of machineUseLog(ctx)) {
    const start = firstUse.get(record.machineId);
    if (start === undefined || record.t < start) firstUse.set(record.machineId, record.t);
    const done = lastDone.get(record.machineId);
    if (done === undefined || record.done > done) lastDone.set(record.machineId, record.done);
  }
  const breaches: Breach[] = [];
  for (const station of machinesWithPrefix(ctx.initialWorld, STATION_PREFIX)) {
    const start = firstUse.get(station.id);
    if (start === undefined) continue;
    for (const feeder of dependenciesOf(station)) {
      const finished = lastDone.get(feeder);
      if (finished !== undefined && start >= finished) continue;
      breaches.push({ station: station.id, feeder, started: start, fedAt: finished ?? null });
    }
  }
  return breaches;
}

/**
 * The earliest station started too early, and the feeder it jumped.
 *
 * A grid brought up in the wrong order broke the order once first, and that station is the one
 * worth naming: everything downstream of it is a consequence, not a second mistake.
 */
function firstBreach(ctx: ObjectiveContext): Breach | undefined {
  return breachesIn(ctx).reduce<Breach | undefined>(
    (earliest, breach) =>
      earliest === undefined || breach.started < earliest.started ? breach : earliest,
    undefined,
  );
}

const HOLD_KEYWORD = 'held';

/**
 * How long each fed station stood ready and unstarted.
 *
 * The gap between the last of a station's feeders going quiet and the station's own first use.
 * `precedence` grades one side of this — nobody may start *early* — and nothing on the level has
 * ever looked at the other side, which is where a schedule leaks. A station with no feeder has
 * nothing to have waited for, and a station nobody started has no answer at all.
 */
function holdsIn(ctx: ObjectiveContext): Map<string, number> {
  const firstUse = new Map<string, number>();
  const lastDone = new Map<string, number>();
  for (const record of machineUseLog(ctx)) {
    const start = firstUse.get(record.machineId);
    if (start === undefined || record.t < start) firstUse.set(record.machineId, record.t);
    const done = lastDone.get(record.machineId);
    if (done === undefined || record.done > done) lastDone.set(record.machineId, record.done);
  }
  const held = new Map<string, number>();
  for (const station of machinesWithPrefix(ctx.initialWorld, STATION_PREFIX)) {
    const start = firstUse.get(station.id);
    if (start === undefined) continue;
    let fed = -1;
    for (const feeder of dependenciesOf(station)) {
      const done = lastDone.get(feeder);
      if (done !== undefined && done > fed) fed = done;
    }
    if (fed < 0) continue;
    held.set(station.id, start - fed);
  }
  return held;
}

/** The longest hold on the site, and every station that can be said to have carried it. */
function longestHold(ctx: ObjectiveContext): { ticks: number; stations: Set<string> } {
  const held = holdsIn(ctx);
  const stations = new Set<string>();
  if (held.size === 0) return { ticks: -1, stations };
  const ticks = Math.max(...held.values());
  for (const [id, own] of held) if (own === ticks) stations.add(id);
  return { ticks, stations };
}

/** `held <station> <n>` split back into its two halves, or null when it is not that shape. */
function readHold(line: string): { station: string; ticks: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const ticks = Number(parts[2]);
  if (!Number.isInteger(ticks)) return null;
  return { station: parts[1] as string, ticks };
}

/** The lines the run filed under the hold keyword, in the order it printed them. */
function holdLines(ctx: ObjectiveContext): string[] {
  const prefix = `${HOLD_KEYWORD} `;
  return ctx.trace.events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

function longestHoldFiled(ctx: ObjectiveContext): boolean {
  const said = holdLines(ctx);
  if (said.length !== 1) return false;
  const claim = readHold(said[0] as string);
  if (claim === null) return false;
  const { ticks, stations } = longestHold(ctx);
  return ticks >= 0 && stations.has(claim.station) && claim.ticks === ticks;
}

/**
 * Where the hand-over note and the shift part company, without naming the station.
 *
 * Naming it is the whole bonus. A wrong claim comes back priced against itself — the station the
 * note named, and what that station actually stood for — which rules one station out and leaves
 * the bookkeeping that would find the right one exactly where it was.
 */
function misreadHold(ctx: ObjectiveContext): Divergence {
  const said = holdLines(ctx);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the hand-over note',
      expected: 'a line naming the substation that stood',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return {
      where: 'the hand-over note',
      expected: 'one line',
      received: `${String(said.length)} lines`,
    };
  }
  const claim = readHold(line);
  if (claim === null) {
    return {
      where: 'the hand-over note',
      expected: 'a line reading `held <station> <n>`',
      received: clipValue(line),
    };
  }
  const own = holdsIn(ctx).get(claim.station);
  if (own === undefined) {
    return {
      where: claim.station,
      expected: 'a station this run started after its feeders',
      received: 'nothing on the site answers to that',
    };
  }
  return {
    where: claim.station,
    expected: own === claim.ticks ? 'the longest stand on the site' : `${String(own)} ticks`,
    received: own === claim.ticks ? 'a shorter one' : `${String(claim.ticks)} claimed`,
  };
}

/**
 * The shift, in ticks, sized from the instance the seed actually produced.
 *
 * Deliberately generous: CURRICULUM.md's w8-05 block requires bronze to stay reachable with a
 * slow, honest program, and `par.ticks` is the thing that separates bronze from gold. The
 * deadline is not allowed to be the thing that stops anybody.
 *
 * The floor is measured, not guessed. A reference that surveys with the whole fleet, walks the
 * grid on one clock and hauls one crate at a time — the slow, ugly shape the level block asks
 * to stay viable — costs a little over 2200 ticks on the widest instance. Below the floor the
 * formula was quietly making that shape fail, which would have gated the ending on gold.
 */
const SHIFT_FLOOR = 3000;

export function deadlineFor(world: World): number {
  const stations = machinesWithPrefix(world, STATION_PREFIX).length;
  let crates = 0;
  for (const count of groundCensus(world, CLASS_KINDS).values()) crates += count;
  const span = world.w + world.h;
  const chain = criticalChain(world, STATION_PREFIX);
  return Math.max(SHIFT_FLOOR, Math.round(span * 6 + crates * 90 + stations * 40 + chain * 20));
}

/**
 * Which slot KD-0001-T ended up in. Exists so the save and the ending screen can record the
 * player's choice; it carries no score and no objective reads it.
 */
export function filedIn(world: World): 'charter' | 'renewals' | null {
  const charter = machineById(world, 'slot-charter');
  if (charter && itemsOnTile(world, charter.at, ItemKind.Chip) > 0) return 'charter';
  const renewals = machineById(world, 'slot-renewals');
  if (renewals && itemsOnTile(world, renewals.at, ItemKind.Chip) > 0) return 'renewals';
  return null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const BRIEF = [
  'dot: the Yards run this every night, so nothing is where it was yesterday. the',
  'airlock past the Yards has cycled on a nine-tick clock since before I got here.',
  'nobody wrote it down because nobody had to. now you know.',
  '',
  'Bring the grid up, clear the crates, and file KD-0001-T.',
  '',
  'The form is filed when it is left in one of two slots past the airlock. The Charter',
  'registry countersigns it and the engagement concludes. The renewals tray processes it',
  'and the Contract runs on, with you as signatory. Either one closes the work order.',
].join('\n');

const FACTS = [
  {
    label: 'The desk',
    value:
      '`probe("desk")` publishes `stations` and `classes`. The stations are `sub-0` up to `sub-N`.',
  },
  {
    label: 'Feeders',
    value:
      '`vars.deps` is how many stations feed this one. `vars.dep0`, `vars.dep1` hold their numbers.',
  },
  {
    label: 'The order rule',
    value:
      'A station may not **start** until every feeder has **finished**. Read off the use log, not the final state.',
  },
  {
    label: 'Energising',
    value: 'The cycle is `off`, `on` and it wraps. Using a station twice turns it back off.',
  },
  {
    label: 'The quota',
    value:
      'Each class has one sink, `depot-<class>` — `ore`, `ice`, `scrap`, `part` or `cell`. A crate still in a bot is not delivered.',
  },
  {
    label: 'The band',
    value:
      '`antenna` is live. `receive()` returns the next line or `null`. Nothing on it tonight is enciphered or corrupt.',
  },
  {
    label: 'A line',
    value:
      '`KD4470|<field>|…|<checksum>`. Split on `|`, drop the header and the checksum, and read `CRATE|x|y|kind`, `DEPOT|x|y|kind`, `FORM|x|y`.',
  },
  {
    label: 'Fuel',
    value:
      'Every bot starts full and a full cell has no gauge, so `fuel()` before anybody moves is the number. `refuel()` works on any depot tile, and there are several.',
  },
  {
    label: 'The airlock',
    value:
      'Starts sealed. One `use()` advances one stage for one tick, and `probe("airlock")` publishes `vars.stages` — the uses it takes to open. It stays open after that.',
  },
  {
    label: 'The form',
    value:
      'KD-0001-T is a chip on a marked tile in the workings. `probe` gives the positions of `slot-charter` and `slot-renewals`.',
  },
  {
    label: 'Hand-over note',
    value:
      'One line, `held <station> <n>`: the substation that stood longest between its last feeder finishing and its own first `use()`, and how many ticks that was.',
  },
];

const STARTER = [
  "// import { reach, dispatch } from 'lib';",
  '',
  '// NOTE(4470): the whole site runs on your code now. mine is all switched off',
  '// NOTE(4470): the airlock still runs on its own clock. it does not care',
  '',
  'const fleet = bots();',
  'print(`fleet: ${fleet.length}`);',
  'print(`stations: ${probe("desk")?.vars.stations ?? 0}`);',
].join('\n');

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

export const w8_05: LevelDef = {
  id: 'w8-05',
  world: 8,
  index: 5,
  title: 'The Kessler Contract',
  hardware: [],
  brief: BRIEF,
  facts: FACTS,
  seeds: [1, 4, 7],
  /* Both halves of the reference — the `Sim` driver and the player-facing source — come in
     between 560 and 977 ticks across the three seeds. Par is left where it was when there were
     seven: the two most expensive instances went with the seed cull, and moving the gold line
     down to meet the new worst case would be tightening the medal on a level nobody has closed
     yet. docs/FIX-FINALE.md flags it as a decision for the orchestrator, not a silent one. */
  par: { ticks: 1050 },
  costs: { use: 1 },
  budget: { maxTicks: 16000, maxOps: 8_000_000 },
  build,
  objectives: [
    Objectives.custom(
      'grid-online',
      'Leave every substation on',
      (ctx) => {
        const [done, total] = gridTally(ctx);
        return total > 0 && done === total;
      },
      {
        progress: gridTally,
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
      'precedence',
      'Energise each station only after its feeders',
      precedenceHolds,
      {
        progress: precedenceTally,
        divergence: (ctx) => {
          const breach = firstBreach(ctx);
          if (!breach) return undefined;
          return {
            where: `${breach.station} · feeder ${breach.feeder}`,
            expected:
              breach.fedAt === null
                ? `feeder ${breach.feeder} energised first`
                : `start at tick ${String(breach.fedAt)} or later`,
            received: `started at tick ${String(breach.started)}`,
          };
        },
      },
    ),
    Objectives.custom(
      'quota',
      'Deliver every crate to its own class depot',
      (ctx) => {
        const [done, total] = quotaTally(ctx);
        return done === total;
      },
      { progress: quotaTally, divergence: quotaMiss },
    ),
    Objectives.custom(
      'file-form',
      'File KD-0001-T in the Charter registry or the renewals tray',
      (ctx) => filedIn(ctx.world) !== null,
      {
        divergence: (ctx) => ({
          where: 'KD-0001-T',
          expected: 'on slot-charter or slot-renewals',
          received: whereIsTheForm(ctx),
        }),
      },
    ),
    Objectives.custom(
      'deadline',
      'Finish inside the shift',
      (ctx) => ctx.trace.endTick <= deadlineFor(ctx.initialWorld),
      {
        progress: (ctx) => {
          const limit = deadlineFor(ctx.initialWorld);
          return [Math.min(ctx.trace.endTick, limit), limit];
        },
        divergence: (ctx) => overranBy(ctx, deadlineFor(ctx.initialWorld)),
        meter: { kind: 'ticks' },
        unit: 'ticks',
      },
    ),
  ],
  bonus: [
    /* No `progress()`. The number is one edge's slack, not a run-wide total, so `budgetFor`
       would have had to guess a meter for the bar and would have drawn the wrong one. */
    Objectives.custom(
      'name-the-hold',
      'Name the substation your order left standing longest',
      longestHoldFiled,
      { divergence: misreadHold },
    ),
  ],
  starter: STARTER,
  hints: [
    'Ask the desk and the stations where everything is before anybody walks anywhere. ' +
      'Machine positions are free. The ground between them is not.',
    'Nothing on this site answers to an id from a distance. Work out who is nearest to ' +
      'what before you work out what order it all has to happen in.',
    'A bot that is not allowed to switch its station on yet is not a bot that is stuck. ' +
      'It is a bot that has something else it could be doing first.',
    'Fuel is not a chore until the second errand. Then it decides which bot should have ' +
      'taken it.',
    'Until somebody has stood at the airlock and paid every stage of it, your route ' +
      'planner sees a wall. The toll is the same size whoever pays it, so let the bot ' +
      'that was going that way anyway pay it early.',
    'Nothing in the grid records when a station could have started, only when it did. ' +
      'If you want to know which one your order kept standing about, you have to read ' +
      'the clock as you throw each one.',
  ],
  docs: ['fuel', 'refuel', 'power', 'use', 'receive', 'probe'],
};
