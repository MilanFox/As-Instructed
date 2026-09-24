import type { Divergence, ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import {
  ALL_DIRS,
  Dir,
  ItemKind,
  MachineKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  clipValue,
  createWorld,
  eq,
  inventoryCount,
  opposite,
  rebuildOccupancy,
  setTerrain,
  step,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  encodeCaesar,
  key,
  loadAntenna,
  localRng,
  point,
  sealPacket,
  tilesEntered,
  worldDistance,
  worldDistances,
} from './shared.ts';

const SIZE = 30;
const LIFT: Vec = { x: 4, y: 4 };
const EDGE = 3;
const TRUNK_LENGTH = 30;
const TRUNK_MINIMUM = 9;
const LETTER: Readonly<Record<Dir, string>> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };
export interface Leg {
  from: Vec;
  dir: Dir;
  length: number;
}

export interface Collapse {
  leg: number;
  side: Dir;
}

export interface Survey {
  legs: Leg[];
  collapsed: Collapse[];
  sections: number[];
  cipherKey: number;
  decoys: number;
  trunks: number;
  locker: Vec;
}

interface Drift {
  legs: number;
  stale: number;
  cipherKey: number;
  decoys: number;
  trunks: number;
}

const DRIFTS: Readonly<Record<number, Drift>> = Object.freeze({
  1: { legs: 12, stale: 2, cipherKey: 41, decoys: 3, trunks: 7 },
  2: { legs: 11, stale: 0, cipherKey: 58, decoys: 2, trunks: 7 },
  3: { legs: 12, stale: 3, cipherKey: 77, decoys: 3, trunks: 7 },
  4: { legs: 12, stale: 5, cipherKey: 13, decoys: 4, trunks: 7 },
  5: { legs: 11, stale: 3, cipherKey: 94, decoys: 3, trunks: 7 },
});

function driftFor(seed: number): Drift {
  return DRIFTS[seed] ?? { legs: 12, stale: 3, cipherKey: 29, decoys: 3, trunks: 5 };
}

const inBox = (at: Vec): boolean =>
  at.x >= EDGE + 1 && at.y >= EDGE + 1 && at.x <= SIZE - EDGE - 2 && at.y <= SIZE - EDGE - 2;

const onSite = (at: Vec): boolean => at.x >= 1 && at.y >= 1 && at.x <= SIZE - 2 && at.y <= SIZE - 2;

const cell = (at: Vec): number => at.y * SIZE + at.x;

function stepBy(from: Vec, dir: Dir, count: number): Vec {
  let at = from;
  for (let i = 0; i < count; i++) at = step(at, dir);
  return at;
}

const acrossFrom = (dir: Dir): Dir[] =>
  dir === Dir.North || dir === Dir.South ? [Dir.East, Dir.West] : [Dir.North, Dir.South];

function legTiles(leg: Leg): Vec[] {
  const out: Vec[] = [];
  let at = leg.from;
  for (let i = 0; i < leg.length; i++) {
    at = step(at, leg.dir);
    out.push(at);
  }
  return out;
}

function endOf(leg: Leg): Vec {
  return stepBy(leg.from, leg.dir, leg.length);
}

function clearOf(taken: Set<number>, tiles: readonly Vec[], joins: readonly Vec[]): boolean {
  const own = new Set([...tiles, ...joins].map(cell));
  for (const at of tiles) {
    if (!inBox(at) || taken.has(cell(at))) return false;
    for (const dir of ALL_DIRS) {
      const beside = step(at, dir);
      if (!own.has(cell(beside)) && taken.has(cell(beside))) return false;
    }
  }
  return true;
}

function bypassPath(leg: Leg, side: Dir): Vec[] {
  const out: Vec[] = [];
  let at = stepBy(leg.from, leg.dir, 2);
  for (let i = 0; i < 3; i++) {
    at = step(at, side);
    out.push(at);
  }
  for (let i = 0; i < 4; i++) {
    at = step(at, leg.dir);
    out.push(at);
  }
  const back = opposite(side);
  for (let i = 0; i < 3; i++) {
    at = step(at, back);
    out.push(at);
  }
  return out;
}

function fallenOf(leg: Leg): Vec[] {
  return [stepBy(leg.from, leg.dir, 3), stepBy(leg.from, leg.dir, 4)];
}

function sideFor(leg: Leg, taken: Set<number>): Dir | null {
  const joins = [stepBy(leg.from, leg.dir, 2), stepBy(leg.from, leg.dir, 6)];
  for (const side of acrossFrom(leg.dir)) {
    const path = bypassPath(leg, side);
    if (clearOf(taken, path.slice(0, -1), joins)) return side;
  }
  return null;
}

function layout(drift: Drift, salt: number): Survey | null {
  const rng = localRng(salt);
  const taken = new Set<number>([cell(LIFT)]);

  const legs: Leg[] = [];
  let at = LIFT;
  let previous: Dir | null = null;
  for (let guard = 0; legs.length < drift.legs && guard < 600; guard++) {
    const dir = rng.pick<Dir>([Dir.East, Dir.East, Dir.South, Dir.South, Dir.North, Dir.West]);
    if (previous !== null && dir === opposite(previous)) continue;
    const leg: Leg = { from: at, dir, length: rng.int(6, 9) };
    const tiles = legTiles(leg);
    if (!clearOf(taken, tiles, [at])) continue;
    legs.push(leg);
    for (const tile of tiles) taken.add(cell(tile));
    at = tiles[tiles.length - 1] as Vec;
    previous = dir;
  }
  if (legs.length < drift.legs) return null;

  const collapsed: Collapse[] = [];
  for (const candidate of rng.shuffle(legs.map((_, index) => index))) {
    if (collapsed.length >= drift.stale) break;
    const leg = legs[candidate] as Leg;
    if (leg.length < 7) continue;
    const side = sideFor(leg, taken);
    if (side === null) continue;
    collapsed.push({ leg: candidate, side });
    for (const tile of bypassPath(leg, side)) taken.add(cell(tile));
  }
  if (collapsed.length < drift.stale) return null;
  collapsed.sort((a, b) => a.leg - b.leg);

  const sections: number[] = [];
  for (let i = 0; i < legs.length; i += 2) sections.push(i);

  return {
    legs,
    collapsed,
    sections,
    cipherKey: drift.cipherKey,
    decoys: drift.decoys,
    trunks: drift.trunks,
    locker: endOf(legs[legs.length - 1] as Leg),
  };
}

export function surveyFor(seed: number): Survey {
  const drift = driftFor(seed);
  for (let salt = 0; salt < 200; salt++) {
    const attempt = layout(drift, seed * 31 + 7 + salt * 1009);
    if (attempt !== null) return attempt;
  }
  throw new Error(`w8-04: seed ${String(seed)} would not lay a route out`);
}

export function sectionText(survey: Survey, index: number): string {
  const first = survey.sections[index] as number;
  const last = survey.sections[index + 1] ?? survey.legs.length;
  let out = '';
  for (let i = first; i < last; i++) {
    const leg = survey.legs[i] as Leg;
    out += `${String(leg.length)}${LETTER[leg.dir]}`;
  }
  return out;
}

function carveLeg(world: World, leg: Leg): void {
  let at = leg.from;
  setTerrain(world, at, Terrain.Floor);
  for (let i = 0; i < leg.length; i++) {
    at = step(at, leg.dir);
    setTerrain(world, at, Terrain.Floor);
  }
}

function openFor(world: World, at: Vec, from: Vec): boolean {
  if (!onSite(at)) return false;
  if (tileAt(world, at)?.terrain !== Terrain.Rock) return false;
  for (const dir of ALL_DIRS) {
    const beside = step(at, dir);
    if (eq(beside, from)) continue;
    if (tileAt(world, beside)?.terrain === Terrain.Floor) return false;
  }
  return true;
}

function driveTrunk(world: World, rng: Rng, anchor: Vec): Vec | null {
  let at = anchor;
  const opening = rng.shuffle(ALL_DIRS).find((dir) => openFor(world, step(at, dir), at));
  if (opening === undefined) return null;
  let heading: Dir = opening;

  const carved: Vec[] = [];
  let run = 0;
  let straight = rng.int(3, 6);
  for (let guard = 0; guard < TRUNK_LENGTH * 4 && carved.length < TRUNK_LENGTH; guard++) {
    const ahead = step(at, heading);
    if (run < straight && openFor(world, ahead, at)) {
      setTerrain(world, ahead, Terrain.Floor);
      carved.push(ahead);
      at = ahead;
      run++;
      continue;
    }
    const turn: Dir | undefined = rng
      .shuffle(acrossFrom(heading))
      .find((dir) => openFor(world, step(at, dir), at));
    if (turn === undefined) break;
    heading = turn;
    run = 0;
    straight = rng.int(3, 6);
  }

  if (carved.length < TRUNK_MINIMUM) {
    for (const tile of carved) setTerrain(world, tile, Terrain.Rock);
    return null;
  }
  return carved[carved.length - 1] as Vec;
}

function build(seed: number): World {
  const survey = surveyFor(seed);
  const rng = localRng(seed * 977 + 3);
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock, vars: { seed } });

  for (const leg of survey.legs) carveLeg(world, leg);

  const fallen: Vec[] = [];
  for (const collapse of survey.collapsed) {
    const leg = survey.legs[collapse.leg] as Leg;
    for (const at of bypassPath(leg, collapse.side)) setTerrain(world, at, Terrain.Floor);
    fallen.push(...fallenOf(leg));
  }

  const onRoute = survey.legs
    .flatMap((leg) => legTiles(leg))
    .filter((at) => !fallen.some((rock) => eq(rock, at)));
  const near = Math.max(4, Math.floor(onRoute.length * 0.5));
  const anchors = [
    ...rng.shuffle(onRoute.slice(0, near)),
    ...rng.shuffle(onRoute.slice(near, onRoute.length - 1)),
  ];
  const deadEnds: Vec[] = [];
  for (const anchor of anchors) {
    if (deadEnds.length >= survey.trunks) break;
    const end = driveTrunk(world, rng, anchor);
    if (end !== null) deadEnds.push(end);
  }

  for (const at of fallen) setTerrain(world, at, Terrain.Rock);
  setTerrain(world, LIFT, Terrain.Depot);

  const locker = survey.locker;
  setTerrain(world, locker, Terrain.Floor);
  addGroundItems(world, locker, ItemKind.Chip, 1);
  const lockerTile = tileAt(world, locker);
  if (lockerTile) lockerTile.mark = 'KD-0001-T (unsigned)';

  rng.shuffle([locker, ...deadEnds]).forEach((at, ordinal) => {
    addMachine(world, {
      id: `locker-${String(ordinal)}`,
      kind: MachineKind.Sink,
      at,
      state: 'open',
      inventory: [],
      vars: {},
    });
    if (eq(at, locker)) return;
    const tile = tileAt(world, at);
    if (tile)
      tile.mark = `KD-${String(rng.int(1000, 9999))}-${LETTER[rng.pick(ALL_DIRS)]} (signed)`;
  });

  addMachine(world, {
    id: 'antenna',
    kind: MachineKind.Antenna,
    at: LIFT,
    state: 'on',
    inventory: [],
    vars: { sections: survey.sections.length },
  });

  const plain: string[] = [];
  for (let i = 0; i < survey.sections.length; i++) {
    plain.push(sealPacket(['SEC', i, sectionText(survey, i)]));
  }
  for (let i = 0; i < survey.decoys; i++) {
    const body = [
      'KD4470',
      'SEC',
      String(rng.int(0, survey.sections.length - 1)),
      `${String(rng.int(2, 9))}${LETTER[rng.pick<Dir>([Dir.North, Dir.East, Dir.South, Dir.West])]}`,
    ].join('|');
    plain.push(`${body}|${String((rng.int(1, 999) + 1) % 1000)}`);
  }
  loadAntenna(
    world,
    LIFT,
    rng.shuffle(plain).map((line) => encodeCaesar(line, survey.cipherKey)),
  );

  addBot(world, { at: LIFT, facing: Dir.East, name: 'RIG-11' });
  rebuildOccupancy(world);

  if (!worldDistances(world, LIFT).has(locker.y * SIZE + locker.x)) {
    throw new Error(`w8-04: seed ${String(seed)} sealed the locker off`);
  }
  const filed = survey.legs.reduce((total, leg) => total + leg.length, 0);
  const walk = worldDistance(world, LIFT, locker);
  if (walk !== filed + 6 * survey.collapsed.length) {
    throw new Error(
      `w8-04: seed ${String(seed)} walks to the locker in ${String(walk)}, plan says ${String(filed + 6 * survey.collapsed.length)}`,
    );
  }
  return world;
}

const PLAN_KEYWORD = 'plan';

function planLines(ctx: ObjectiveContext): string[] {
  const prefix = `${PLAN_KEYWORD} `;
  return ctx.trace.events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

function readPlanNote(line: string): { cipher: number; legs: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const cipher = Number(parts[1]);
  const legs = Number(parts[2]);
  if (!Number.isInteger(cipher) || !Number.isInteger(legs)) return null;
  return { cipher, legs };
}

function planRead(ctx: ObjectiveContext): boolean {
  if (!holdsForm(ctx)) return false;
  const said = planLines(ctx);
  if (said.length !== 1) return false;
  const claim = readPlanNote(said[0] as string);
  if (claim === null) return false;
  const survey = surveyFor(ctx.initialWorld.vars.seed ?? 1);
  return claim.cipher === survey.cipherKey && claim.legs === survey.legs.length;
}

function misreadPlan(ctx: ObjectiveContext): Divergence {
  const said = planLines(ctx);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the plan line',
      expected: 'a line `plan <key> <legs>`',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return {
      where: 'the plan line',
      expected: 'one line',
      received: `${String(said.length)} lines`,
    };
  }
  const claim = readPlanNote(line);
  if (claim === null) {
    return {
      where: 'the plan line',
      expected: 'a line `plan <key> <legs>`',
      received: clipValue(line),
    };
  }
  const survey = surveyFor(ctx.initialWorld.vars.seed ?? 1);
  if (claim.cipher !== survey.cipherKey) {
    return {
      where: 'the key',
      expected: 'the key every real packet checks under',
      received: `key ${String(claim.cipher)} of 95`,
    };
  }
  if (claim.legs !== survey.legs.length) {
    return {
      where: 'the plan',
      expected: 'the leg count of the real packets',
      received: `${String(claim.legs)} legs`,
    };
  }
  return {
    where: 'KD-0001-T at the end of the run',
    expected: 'held by the bot',
    received: clipValue(formStanding(ctx)),
  };
}

const holdsForm = (ctx: ObjectiveContext): boolean => {
  const bot = ctx.world.bots[0];
  return bot !== undefined && inventoryCount(bot, ItemKind.Chip) > 0;
};

function formStanding(ctx: ObjectiveContext): string {
  for (const bot of ctx.world.bots) {
    if (inventoryCount(bot, ItemKind.Chip) > 0) return `held by ${bot.name}`;
  }
  const loose = ctx.world.items.find((stack) => stack.kind === ItemKind.Chip && stack.count > 0);
  if (loose === undefined) return 'nowhere on the site';
  const locker = surveyFor(ctx.initialWorld.vars.seed ?? 1).locker;
  if (!eq(loose.at, locker)) return `on the ground at ${point(loose.at)}`;
  return tilesEntered(ctx).has(key(locker))
    ? 'still in the locker; the bot stood on it'
    : 'still in the locker; nobody reached it';
}

function filedTiles(seed: number): Set<string> {
  const survey = surveyFor(seed);
  const filed = new Set<string>([key(LIFT)]);
  for (const leg of survey.legs) for (const at of legTiles(leg)) filed.add(key(at));
  for (const collapse of survey.collapsed) {
    const leg = survey.legs[collapse.leg] as Leg;
    for (const at of bypassPath(leg, collapse.side)) filed.add(key(at));
  }
  return filed;
}

interface Stray {
  at: Vec;
  t: number;
}

function strayTiles(ctx: ObjectiveContext): Stray[] {
  const filed = filedTiles(ctx.initialWorld.vars.seed ?? 1);
  const seen = new Set<string>();
  const out: Stray[] = [];
  for (const event of ctx.trace.events) {
    if (event.kind !== 'move' || !event.ok) continue;
    const at = key(event.to);
    if (filed.has(at) || seen.has(at)) continue;
    seen.add(at);
    out.push({ at: event.to, t: event.t });
  }
  return out;
}

function walkedTheRoute(ctx: ObjectiveContext): boolean {
  const locker = surveyFor(ctx.initialWorld.vars.seed ?? 1).locker;
  return tilesEntered(ctx).has(key(locker)) && strayTiles(ctx).length === 0;
}

function strayed(ctx: ObjectiveContext): Divergence {
  const stray = strayTiles(ctx);
  const first = stray[0];
  if (first === undefined) {
    return {
      where: 'the locker at the end of the route',
      expected: 'the bot standing on it',
      received: 'the run stopped short',
    };
  }
  return {
    where: `tick ${String(first.t)} · ${point(first.at)}`,
    expected: 'a tile on the route',
    received: clipValue(`${String(stray.length)} tiles off the route`),
  };
}

export const w8_04: LevelDef = {
  id: 'w8-04',
  world: 8,
  index: 4,
  title: 'Signal from 4470',
  hardware: [],
  brief: [
    '#4470 radioed this route a year ago. Keep to it, because the rest is unsafe, and tell me his key and the number of legs. — M. Vance',
    '',
    "**End the run holding form KD-0001-T. #4470's radio route leads to its locker.**",
  ].join('\n'),
  board: {
    redrawn: [
      'the route, and which of the 95 keys was used',
      'how many legs the route has',
      'how many legs are blocked',
      'how many fake packets are on the radio',
      'which locker id belongs to which tunnel',
      'where the side tunnels run and how long they are',
    ],
  },
  facts: [
    {
      label: 'Radio',
      value: 'The bot starts on the lift. `receive()` there returns the next packet, or `null`.',
    },
    {
      label: 'Packet',
      value:
        'Decoded, it reads `KD4470|SEC|<n>|<route>|<checksum>`. `<n>` is the section number. Packets come in any order.',
    },
    {
      label: 'Checksum',
      value:
        'On the decoded packet: sum of the character codes before the last `|`, modulo 1000. A wrong checksum means a fake packet.',
    },
    {
      label: 'Packet key',
      value:
        'All packets use one key, a number from 0 to 94. Each character moves that far through printable ASCII. `decode(text, key)` reverses it.',
    },
    {
      label: 'Route',
      value:
        'Legs, each a count then `N`, `E`, `S` or `W`. Section 0 starts at the lift; each section starts where the one before ended.',
    },
    {
      label: 'Lockers',
      value:
        '`locker-0` and up, shuffled per board. A probe finds any from anywhere. Scan or look reads its mark: the form number and whether it is signed.',
    },
    {
      label: 'Form',
      value:
        'KD-0001-T lies on the locker tile at the end of the route. `pickup()` takes it. That it is unsigned does not matter here.',
    },
    {
      label: 'Rock falls',
      value:
        'Rock blocks up to 5 legs, maybe none. The route does not show falls. The end tile of every leg is still right. Every fall has a way around it that leaves and rejoins the leg, 6 moves longer than the straight way.',
    },
    {
      label: 'Tunnels',
      value:
        'No two tunnels touch side by side. Apart from the ways around rock falls, there is one path to any tile. Side tunnels leave the route once, never meet each other, and each ends in a locker.',
    },
    { label: 'Rock', value: 'Moving into rock goes nowhere and still costs a tick.' },
    {
      label: 'Plan line',
      value:
        'Print one line `plan <key> <legs>`: the key, and the total number of legs in all real packets. It counts only if the bot ends holding KD-0001-T.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 116 },
  budget: { maxTicks: 3000 },
  build,
  objectives: [
    Objectives.custom('form-recovered', 'End the run holding KD-0001-T', holdsForm, {
      divergence: (ctx) => ({
        where: 'KD-0001-T at the end of the run',
        expected: 'in the bot',
        received: clipValue(formStanding(ctx)),
      }),
    }),
  ],
  bonus: [
    Objectives.custom('read-the-plan', 'Print the plan line: the key and the leg count', planRead, {
      divergence: misreadPlan,
    }),
    Objectives.custom(
      'walk-the-plan',
      'Reach the locker using only the route and the ways around rock falls',
      walkedTheRoute,
      { divergence: strayed },
    ),
  ],
  starter: [
    '// If you published these to lib.ts, you can import them:',
    "// import { findKey, unpack, reach } from 'lib';",
    '// NOTE(4470): the route was true when i sent it. some of it still is',
    '// TODO(4470): the form is in the locker. it is not signed. read the charter and you will see why',
    '',
    'let packet = receive();',
    'while (packet !== null) {',
    '  print(packet);',
    '  packet = receive();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Packets use a key and a checksum, as on earlier radio jobs.',
    'Look along each leg before you walk it. Looking costs nothing.',
    'When a leg is blocked, you still know its end tile. Find a short way around to it.',
    'Ignoring the route also works, but you walk far more of the tunnels.',
    'Only the checksum can tell you the key. There are only 95 keys to try.',
  ],
  docs: ['decode', 'receive', 'probe', 'look', 'canMove', 'pickup'],
};
