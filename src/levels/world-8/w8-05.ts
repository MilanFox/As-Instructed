import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  FED_BY,
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

const CARVE_MARGIN = 6;

const SPAWN = { x: 1, y: 16, w: 5, h: 8 };
const EXIT_ROW = 20;
const HOME_DEPOT: Vec = { x: 4, y: EXIT_ROW };
const DESK_AT: Vec = { x: 2, y: EXIT_ROW };

const GATE_X = 40;
const CHAMBER_X0 = 43;
const CHAMBER_X1 = WIDTH - 1;
const CHAMBER_REACH = 3;

const AIRLOCK_CYCLE = ['sealed', '1', '2', '3', '4', '5', '6', '7', '8', 'open'];
const AIRLOCK_STAGES = AIRLOCK_CYCLE.length - 1;

const CLASS_KINDS = [ItemKind.Ore, ItemKind.Ice, ItemKind.Scrap, ItemKind.Part, ItemKind.Cell];

const DEPOT_PREFIX = 'depot-';
const STATION_PREFIX = 'sub-';

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

function feederIndex(deps: readonly (readonly number[])[], stationAt: Vec[], gate: Vec): number {
  const depthOf = (i: number): number => {
    let deep = 0;
    for (const feeder of deps[i] ?? []) deep = Math.max(deep, depthOf(feeder) + 1);
    return deep;
  };
  let best = 0;
  let bestDepth = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < deps.length; i++) {
    const depth = depthOf(i);
    const gap = manhattan(stationAt[i] as Vec, gate);
    if (depth < bestDepth || (depth === bestDepth && gap >= bestGap)) continue;
    best = i;
    bestDepth = depth;
    bestGap = gap;
  }
  return best;
}

function relabel(seed: number, deps: readonly (readonly number[])[]): number[] {
  const identity = Array.from({ length: deps.length }, (_, i) => i);
  const ascendingWorks = (label: readonly number[]): boolean =>
    deps.every((feeders, slot) =>
      feeders.every((feeder) => (label[feeder] as number) < (label[slot] as number)),
    );
  const rng = localRng(seed * 613 + 29);
  for (let attempt = 0; attempt < 64; attempt++) {
    const label = rng.shuffle(identity);
    if (!ascendingWorks(label)) return label;
  }
  return identity;
}

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
  const junction = nearestFloor(
    world,
    { x: CARVE_MARGIN, y: EXIT_ROW },
    (at) => at.x >= CARVE_MARGIN,
  );
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

  const label = relabel(seed, deps);
  for (let i = 0; i < spec.stations; i++) {
    const vars: Record<string, number> = { deps: (deps[i] ?? []).length, [MANUAL_ONLY]: 1 };
    (deps[i] ?? []).forEach((d, n) => {
      vars[`dep${n}`] = label[d] as number;
    });
    addMachine(world, {
      id: `${STATION_PREFIX}${String(label[i] as number)}`,
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

  const feeder = `${STATION_PREFIX}${String(label[feederIndex(deps, stationAt, gateStand)] as number)}`;
  addMachine(world, {
    id: 'airlock',
    kind: MachineKind.Door,
    at: gateStand,
    state: AIRLOCK_CYCLE[0] as string,
    inventory: [],
    vars: { stages: AIRLOCK_STAGES, [MANUAL_ONLY]: 1, [`${FED_BY}${feeder}`]: 1 },
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

function gridTally(ctx: ObjectiveContext): [number, number] {
  const switched = new Set(machineUseLog(ctx).map((record) => record.machineId));
  const stations = machinesWithPrefix(ctx.world, STATION_PREFIX);
  const done = stations.filter(
    (station) => station.state === 'on' && switched.has(station.id),
  ).length;
  return [done, stations.length];
}

function precedenceHolds(ctx: ObjectiveContext): boolean {
  return breachesIn(ctx).length === 0;
}

function darkStation(ctx: ObjectiveContext): { id: string; at: Vec; reason: string } | undefined {
  const switched = new Set(machineUseLog(ctx).map((record) => record.machineId));
  for (const station of machinesWithPrefix(ctx.world, STATION_PREFIX)) {
    if (station.state === 'on' && switched.has(station.id)) continue;
    const reason = switched.has(station.id)
      ? `${station.state} — used an even number of times`
      : 'never used; no bot worked this tile';
    return { id: station.id, at: station.at, reason };
  }
  return undefined;
}

function airlockFeeder(world: World): string | null {
  const airlock = machineById(world, 'airlock');
  if (!airlock) return null;
  for (const [name, value] of Object.entries(airlock.vars)) {
    if (value === 1 && name.startsWith(FED_BY)) return name.slice(FED_BY.length);
  }
  return null;
}

function sealedAirlock(ctx: ObjectiveContext): Divergence | undefined {
  const airlock = machineById(ctx.world, 'airlock');
  if (!airlock || airlock.state === 'open') return undefined;
  const feeder = airlockFeeder(ctx.world);
  const station = feeder === null ? undefined : machineById(ctx.world, feeder);
  const dark = station !== undefined && station.state !== 'on';
  const moved = machineUseLog(ctx).filter((record) => record.machineId === 'airlock').length;
  return {
    where: `airlock at ${point(airlock.at)}`,
    expected: `open — ${String(AIRLOCK_STAGES)} uses, with ${feeder ?? 'its feeder'} on`,
    received: dark
      ? `${feeder as string} is ${station.state}; the gate took the ticks`
      : `${airlock.state} after ${String(moved)} uses that moved it`,
  };
}

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

function precedenceTally(ctx: ObjectiveContext): [number, number] {
  const stations = machinesWithPrefix(ctx.initialWorld, STATION_PREFIX);
  const early = new Set(breachesIn(ctx).map((breach) => breach.station));
  return [Math.max(0, stations.length - early.size), stations.length];
}

interface Breach {
  station: string;
  feeder: string;
  started: number;
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

function firstBreach(ctx: ObjectiveContext): Breach | undefined {
  return breachesIn(ctx).reduce<Breach | undefined>(
    (earliest, breach) =>
      earliest === undefined || breach.started < earliest.started ? breach : earliest,
    undefined,
  );
}

const GATE_KEYWORD = 'gate';

function filedLines(ctx: ObjectiveContext, keyword: string): string[] {
  const prefix = `${keyword} `;
  return ctx.trace.events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

function readClaim(line: string): { id: string; count: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const count = Number(parts[2]);
  if (!Number.isInteger(count)) return null;
  return { id: parts[1] as string, count };
}

function gateMovedAt(ctx: ObjectiveContext): number | undefined {
  let earliest: number | undefined;
  for (const record of machineUseLog(ctx)) {
    if (record.machineId !== 'airlock') continue;
    if (earliest === undefined || record.t < earliest) earliest = record.t;
  }
  return earliest;
}

function feederThrownAt(ctx: ObjectiveContext): number | undefined {
  const feeder = airlockFeeder(ctx.world);
  if (feeder === null) return undefined;
  let earliest: number | undefined;
  for (const record of machineUseLog(ctx)) {
    if (record.machineId !== feeder) continue;
    if (earliest === undefined || record.t < earliest) earliest = record.t;
  }
  return earliest;
}

function gateSlack(ctx: ObjectiveContext): number | undefined {
  const powered = feederThrownAt(ctx);
  const moved = gateMovedAt(ctx);
  if (powered === undefined || moved === undefined) return undefined;
  return moved < powered ? undefined : moved - powered;
}

function gateReportFiled(ctx: ObjectiveContext): boolean {
  const said = filedLines(ctx, GATE_KEYWORD);
  if (said.length !== 1) return false;
  const claim = readClaim(said[0] as string);
  if (claim === null) return false;
  const slack = gateSlack(ctx);
  if (slack === undefined) return false;
  return claim.id === airlockFeeder(ctx.world) && claim.count === slack;
}

function misreadGate(ctx: ObjectiveContext): Divergence {
  const said = filedLines(ctx, GATE_KEYWORD);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the gate note',
      expected: 'a line naming the door’s substation',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return {
      where: 'the gate note',
      expected: 'one line',
      received: `${String(said.length)} lines`,
    };
  }
  const claim = readClaim(line);
  if (claim === null) {
    return {
      where: 'the gate note',
      expected: 'a line reading `gate <station> <n>`',
      received: clipValue(line),
    };
  }
  const feeder = airlockFeeder(ctx.world);
  if (feeder !== null && claim.id !== feeder) {
    return {
      where: claim.id,
      expected: 'the substation the airlock draws from',
      received: 'a different one on the site',
    };
  }
  if (gateSlack(ctx) === undefined) {
    const moved = gateMovedAt(ctx);
    const thrown = feederThrownAt(ctx);
    if (moved !== undefined && thrown !== undefined) {
      return {
        where: 'the airlock',
        expected: `a gate moved after ${feeder ?? 'its substation'} was thrown`,
        received: `moved at tick ${String(moved)}, thrown at tick ${String(thrown)}`,
      };
    }
    return {
      where: 'the airlock',
      expected: 'a gate somebody moved this shift',
      received:
        moved === undefined ? 'nobody moved it' : `nobody threw ${feeder ?? 'its substation'}`,
    };
  }
  return {
    where: 'the gate note',
    expected: 'how long it stood powered and shut',
    received: `${String(claim.count)} claimed`,
  };
}

function handleTurns(ctx: ObjectiveContext): { turns: number; dark: number } {
  let turns = 0;
  let dark = 0;
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || event.machineId !== 'airlock') continue;
    turns++;
    if (!event.ok) dark++;
  }
  return { turns, dark };
}

function gateOpenedCleanly(ctx: ObjectiveContext): boolean {
  if (machineById(ctx.world, 'airlock')?.state !== 'open') return false;
  return handleTurns(ctx).turns === AIRLOCK_STAGES;
}

function wastedTurns(ctx: ObjectiveContext): Divergence {
  const airlock = machineById(ctx.world, 'airlock');
  const where = airlock ? `airlock at ${point(airlock.at)}` : 'the airlock';
  const wanted = `${String(AIRLOCK_STAGES)} turns of the handle`;
  const { turns, dark } = handleTurns(ctx);
  if (turns === 0) return { where, expected: wanted, received: 'nobody turned it' };
  if (dark > 0) {
    return {
      where,
      expected: `every turn with ${airlockFeeder(ctx.world) ?? 'its substation'} on`,
      received: `${String(dark)} of ${String(turns)} at a dark gate`,
    };
  }
  return {
    where,
    expected: wanted,
    received: `${String(turns)}, and it reads ${airlock?.state ?? 'sealed'}`,
  };
}

const SHIFT_FLOOR = 3000;

export function deadlineFor(world: World): number {
  const stations = machinesWithPrefix(world, STATION_PREFIX).length;
  let crates = 0;
  for (const count of groundCensus(world, CLASS_KINDS).values()) crates += count;
  const span = world.w + world.h;
  const chain = criticalChain(world, STATION_PREFIX);
  return Math.max(SHIFT_FLOOR, Math.round(span * 6 + crates * 90 + stations * 40 + chain * 20));
}

export function filedIn(world: World): 'charter' | 'renewals' | null {
  const charter = machineById(world, 'slot-charter');
  if (charter && itemsOnTile(world, charter.at, ItemKind.Chip) > 0) return 'charter';
  const renewals = machineById(world, 'slot-renewals');
  if (renewals && itemsOnTile(world, renewals.at, ItemKind.Chip) > 0) return 'renewals';
  return null;
}

const BRIEF = [
  'dot: the Yards run this every night, so nothing is where it was yesterday. the airlock',
  'past them wants the handle turned and turned, and it draws off the grid; nobody wrote',
  'that down because nobody had to. Maintenance bill us for turns taken at a dark gate,',
  'and Vance wants the time it stood lit and shut.',
  '',
  'Bring the grid up, clear the crates, and file KD-0001-T. the Charter registry ends the',
  'engagement; the renewals tray runs the Contract on, with you as signatory.',
].join('\n');

const FACTS = [
  {
    label: 'The desk',
    value:
      '`probe("desk")` publishes `stations`, `classes` and `crates`. The stations are `sub-0` up to `sub-N`.',
  },
  {
    label: 'Feeders',
    value:
      '`vars.deps` is how many stations feed this one. `vars.dep0`, `vars.dep1` hold their numbers.',
  },
  {
    label: 'The order rule',
    value:
      'A station may not **start** until every feeder has **finished**. Read off the use log, not the final state. Every record in that log carries the clock of the bot that made it, and each bot keeps its own — **before** here means a lower tick, not an earlier line of your program.',
  },
  {
    label: 'Energising',
    value:
      'Every substation is hand-operated: stand on it, or beside it and pass the direction, and call `use()`. `power()` reaches none of them — `probe(id).vars.manual` is 1 on every one. The cycle is `off`, `on` and it wraps, so using a station twice turns it back off. A `use()` costs one tick here, so a station **finishes** one tick after it is thrown.',
  },
  {
    label: 'The quota',
    value:
      'Each class has one sink, `depot-<class>` — `ore`, `ice`, `scrap`, `part` or `cell`. Deliver by dropping the crate on the sink’s own tile; a crate still in a bot is not delivered, and a crate on the wrong class’s tile is not either. Only the classes the desk counts are on site tonight. These sinks are machines, and nothing to do with the fuel depot **terrain** below.',
  },
  {
    label: 'The band',
    value:
      '`antenna` is live. `receive()` reads it from anywhere on the site, for nothing, and returns the next line or `null`. It is one queue for the whole fleet — a line one bot takes never comes back to another. Nothing on it tonight is enciphered or corrupt.',
  },
  {
    label: 'A line',
    value:
      '`KD4470|<field>|…|<checksum>`. Split on `|`, drop the header and the checksum, and read `CRATE|x|y|kind`, `DEPOT|x|y|kind`, `FORM|x|y`.',
  },
  {
    label: 'Fuel',
    value:
      'Every bot starts full and a full cell has no gauge, so `fuel()` before anybody moves is the number. A full cell is not a night of walking. `refuel()` works on any depot **tile** — the terrain, not a `depot-<class>` sink: the muster bay has one on the row the desk stands on, and the rest are scattered over the site — no packet lists them, so `scan()` and `look()` on the terrain are how you find them. A bot that reaches zero does not stop on its own — it ends the shift for the whole fleet.',
  },
  {
    label: 'The airlock',
    value:
      'Starts sealed, and is hand-operated like the substations. One `use()` advances one stage for one tick, and `probe("airlock")` publishes `vars.stages` — the nine uses it takes to open. The cycle wraps: a tenth `use()` seals it again and walls the chamber back up, so read the state rather than counting. `probe("airlock").links` gives the two gate tiles it walls off, drawn on the board as a tether from the gate to each of them; they are the only way in.',
  },
  {
    label: 'What opens it',
    value:
      'The door runs off the grid. `probe("airlock").vars` carries a `fed:sub-N` key: until that substation reads `on`, every `use()` at the gate costs its tick, moves nothing, and is still a turn of the handle. It is the station furthest down the grid, never a root, so the order rule puts its whole ancestry in front of the errand east.',
  },
  {
    label: 'The form',
    value:
      'KD-0001-T is a chip on a marked tile in the workings. It is filed by leaving it on the tile of `slot-charter` or `slot-renewals`, both of them past the airlock; either one closes the work order. `probe` gives their positions.',
  },
  {
    label: 'The shift',
    value:
      'The work order fails if the last bot stops after tick **3000**. Par is 1050, so the shift is the wall and par is the medal — a slow, honest program closes this inside the shift.',
  },
  {
    label: 'Gate note',
    value:
      'One line, `gate <station> <n>`: the substation the airlock draws from, and the ticks between that substation being **thrown** — the tick of the `use()`, not the tick it finished — and the gate first moving. Both are read off the clock of whichever bot did it. A fleet that never squares its clocks can turn the handle at a lower tick than the throw it was waiting for: that shift has no such interval and the note cannot be filed for it.',
  },
];

const STARTER = [
  "// import { reach, dispatch } from 'lib';",
  '',
  '// NOTE(4470): the whole site runs on your code now. mine is all switched off',
  '// NOTE(4470): the airlock wants a hand on the handle and our power. it needs both',
  '',
  'const fleet = bots();',
  'print(`fleet: ${fleet.length}`);',
  'print(`stations: ${probe("desk")?.vars.stations ?? 0}`);',
].join('\n');

export const w8_05: LevelDef = {
  id: 'w8-05',
  world: 8,
  index: 5,
  title: 'The Kessler Contract',
  hardware: [],
  brief: BRIEF,
  board: {
    fixed: [
      'the site is 46 by 38 inside the wall — the muster bay west, the Yards in the middle, the airlock and the chamber east',
      'the whole fleet musters in the bay on full cells, six crates of hold each, beside a fuel depot tile on the row the desk stands on',
      'every tile the shift needs is walkable from the bay; the chamber is the only shut part of the site, and the two gate tiles are the only way in',
      'nine turns of the handle at the airlock, and the substation it draws off always has feeders of its own',
      'the station numbers are not an energising order: some station is fed by one numbered above it',
      'the shift is 3000 ticks on all three draws',
    ],
    redrawn: [
      'how many bots, six or seven',
      'how many substations, and the shape of the grid — one draw is a pure chain, the others branch',
      'how many crates, and which classes the night draws',
      'which substation the airlock draws from',
      'how much fuel a full cell holds',
      'the cave layout, the row the airlock stands on, and where the depots, the sinks, the antenna and the form sit in it',
    ],
  },
  facts: FACTS,
  seeds: [1, 4, 7],
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
        divergence: (ctx) =>
          sealedAirlock(ctx) ?? {
            where: 'KD-0001-T',
            expected: 'on slot-charter or slot-renewals',
            received: whereIsTheForm(ctx),
          },
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
    Objectives.custom(
      'nine-turns',
      `Open the airlock in ${String(AIRLOCK_STAGES)} turns of the handle`,
      gateOpenedCleanly,
      { divergence: wastedTurns },
    ),
    Objectives.custom(
      'mind-the-gate',
      'Name the substation the airlock draws from and how long it stood powered and shut',
      gateReportFiled,
      { divergence: misreadGate },
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
    'The gate is on the same grid you were sent here to bring up, and it says which ' +
      'substation before anybody walks anywhere. That substation is not allowed to come ' +
      'up before its own feeders, so the errand east has a queue in front of it.',
    'A turn of the handle taken while the gate is dark costs its tick, moves nothing, ' +
      'and still counts against you. What the substation reads is free to ask for, and ' +
      'asking is cheaper than finding out.',
    'Nothing in the grid records when a station was thrown, only that it was. If you want ' +
      'the interval the gate stood waiting, you have to read the clock as you throw.',
  ],
  docs: ['fuel', 'refuel', 'power', 'use', 'receive', 'probe', 'clock', 'scan', 'look'],
};
