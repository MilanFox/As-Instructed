import type {
  DieEvent,
  Divergence,
  ObjectiveContext,
  Rng,
  Vec,
  World,
} from '../../engine/index.ts';
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
/** The route is kept inside this box so a collapse always has room for a way round it. */
const EDGE = 3;
/** How far a false trunk is driven, and the shortest one worth leaving in the ground. */
const TRUNK_LENGTH = 30;
const TRUNK_MINIMUM = 9;
const LETTER: Readonly<Record<Dir, string>> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };
export interface Leg {
  from: Vec;
  dir: Dir;
  length: number;
}

/** A leg whose middle has come down, and the perpendicular the way round bulges into. */
export interface Collapse {
  leg: number;
  side: Dir;
}

export interface Survey {
  legs: Leg[];
  collapsed: Collapse[];
  /** Section n holds `legs[sections[n] .. sections[n + 1] - 1]`. */
  sections: number[];
  cipherKey: number;
  decoys: number;
  /** Dead-end workings driven off the route. Not on the plan, and not in the packets either. */
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

/**
 * Seed 1 is the zero-drift instance: the plan is perfect and following it literally works, which
 * is the only way a player ever gets to believe the plan. Seed 4 is heavy drift — five legs of
 * twelve have come down — so anything that trusts the plan without checking walks into rock.
 * Neither blind trust nor blind distrust survives the set (CURRICULUM.md §10).
 */
const DRIFTS: Readonly<Record<number, Drift>> = Object.freeze({
  1: { legs: 11, stale: 0, cipherKey: 0, decoys: 2, trunks: 7 },
  2: { legs: 12, stale: 2, cipherKey: 41, decoys: 3, trunks: 7 },
  3: { legs: 12, stale: 3, cipherKey: 77, decoys: 3, trunks: 7 },
  4: { legs: 12, stale: 5, cipherKey: 13, decoys: 4, trunks: 7 },
  5: { legs: 11, stale: 3, cipherKey: 94, decoys: 3, trunks: 7 },
});

function driftFor(seed: number): Drift {
  return DRIFTS[seed] ?? { legs: 12, stale: 3, cipherKey: 29, decoys: 3, trunks: 5 };
}

const inBox = (at: Vec): boolean =>
  at.x >= EDGE + 1 && at.y >= EDGE + 1 && at.x <= SIZE - EDGE - 2 && at.y <= SIZE - EDGE - 2;

/** The filed route is held inside the box; the old workings may run anywhere on the site. */
const onSite = (at: Vec): boolean =>
  at.x >= 1 && at.y >= 1 && at.x <= SIZE - 2 && at.y <= SIZE - 2;

const cell = (at: Vec): number => at.y * SIZE + at.x;

function stepBy(from: Vec, dir: Dir, count: number): Vec {
  let at = from;
  for (let i = 0; i < count; i++) at = step(at, dir);
  return at;
}

const acrossFrom = (dir: Dir): Dir[] =>
  dir === Dir.North || dir === Dir.South ? [Dir.East, Dir.West] : [Dir.North, Dir.South];

/** The tiles a leg carves, excluding the one it starts on. */
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

/**
 * Whether a stretch can be carved without coming alongside anything already carved.
 *
 * Every corridor here is an induced path: two floor tiles are neighbours only where they are
 * consecutive on the same corridor. That is what makes the filed plan worth having. The workings
 * are a tree, so the route the plan describes is the *only* way to the locker, and a wrong turn
 * is a walk back rather than a longer way round.
 */
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

/** Around the fallen stretch: out three, along four, back three. Six moves more than the plan. */
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

/** The two tiles of this leg that are under the fall. */
function fallenOf(leg: Leg): Vec[] {
  return [stepBy(leg.from, leg.dir, 3), stepBy(leg.from, leg.dir, 4)];
}

/** The perpendicular the way round fits into, or null when neither side is clear. */
function sideFor(leg: Leg, taken: Set<number>): Dir | null {
  const joins = [stepBy(leg.from, leg.dir, 2), stepBy(leg.from, leg.dir, 6)];
  for (const side of acrossFrom(leg.dir)) {
    const path = bypassPath(leg, side);
    // The last tile is the leg's own, where the way round rejoins it.
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

/** The plan as it was filed: one run per leg, run-length encoded, grouped into sections. */
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

/** Whether a corridor may be extended onto `at`, having arrived from `from`. */
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

/**
 * One dead-end working, driven off the route until the rock runs out.
 *
 * It turns every few tiles, and that is the whole of its function. A straight stub is dismissed
 * for nothing by a single `look` down it, so only a corridor that bends can charge a search the
 * walk to its end and the walk back. Reverted rather than left where it came out too short to
 * cost anybody anything.
 */
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

  // Old workings. They are not on the plan and they do not go anywhere, which is the point.
  // Driven off the near half of the route first, so the first fork arrives early enough that a
  // search has to choose before it has any grounds to choose on.
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

  // Every working ends in a locker, and the ids say nothing about which one the memo means.
  // `probe(id)` reaches any machine on the site for nothing, so one locker with a guessable name
  // would have handed the whole level away at tick zero.
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
    if (tile) tile.mark = `KD-${String(rng.int(1000, 9999))}-${LETTER[rng.pick(ALL_DIRS)]} (signed)`;
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
    const body = ['KD4470', 'SEC', String(rng.int(0, survey.sections.length - 1)),
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
  // The point of the level, asserted rather than hoped for: the filed route is the shortest walk
  // to the locker there is, and a way round a fall is six moves dearer than the leg it replaces.
  // Anything cheaper means a working joined two legs and handed the search a short cut.
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

/** The lines the run filed as its reading of the plan, in the order it printed them. */
function planLines(ctx: ObjectiveContext): string[] {
  const prefix = `${PLAN_KEYWORD} `;
  return ctx.trace.events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

/** `plan <cipher> <legs>` split back into its two halves, or null when it is not that shape. */
function readPlanNote(line: string): { cipher: number; legs: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const cipher = Number(parts[1]);
  const legs = Number(parts[2]);
  if (!Number.isInteger(cipher) || !Number.isInteger(legs)) return null;
  return { cipher, legs };
}

function planRead(ctx: ObjectiveContext): boolean {
  const said = planLines(ctx);
  if (said.length !== 1) return false;
  const claim = readPlanNote(said[0] as string);
  if (claim === null) return false;
  const survey = surveyFor(ctx.initialWorld.vars.seed ?? 1);
  return claim.cipher === survey.cipherKey && claim.legs === survey.legs.length;
}

/**
 * Where the reading and the filed plan part company, without handing either number over.
 *
 * Both figures are the whole bonus: the shift is only recoverable by trying all ninety-five
 * against the checksum, and the leg count is only recoverable by throwing the traffic that does
 * not add up away and reading what is left in section order. A wrong claim comes back as the
 * claim, so it rules one answer out and leaves the work that finds the right one where it was.
 */
function misreadPlan(ctx: ObjectiveContext): Divergence {
  const said = planLines(ctx);
  const line = said[0];
  if (line === undefined) {
    return {
      where: 'the reading',
      expected: 'a line reading `plan <cipher> <legs>`',
      received: NOTHING,
    };
  }
  if (said.length > 1) {
    return { where: 'the reading', expected: 'one line', received: `${String(said.length)} lines` };
  }
  const claim = readPlanNote(line);
  if (claim === null) {
    return {
      where: 'the reading',
      expected: 'a line reading `plan <cipher> <legs>`',
      received: clipValue(line),
    };
  }
  const survey = surveyFor(ctx.initialWorld.vars.seed ?? 1);
  if (claim.cipher !== survey.cipherKey) {
    return {
      where: 'the cipher',
      expected: 'the shift every filed packet adds up under',
      received: `shift ${String(claim.cipher)} of the ninety-five`,
    };
  }
  return {
    where: 'the plan',
    expected: 'the legs the filed sections describe',
    received: `${String(claim.legs)} legs`,
  };
}

const holdsForm = (ctx: ObjectiveContext): boolean => {
  const bot = ctx.world.bots[0];
  return bot !== undefined && inventoryCount(bot, ItemKind.Chip) > 0;
};

/**
 * Where KD-0001-T ended the shift, in words the run has already earned.
 *
 * The locker's tile is the last thing the filed plan resolves to, so a form still sitting in it
 * is described and never located. What the report does add is whether anybody stood there: a
 * route that arrived and did not pick up and a route that never arrived are the same `not met`
 * and completely different bugs.
 */
function formStanding(ctx: ObjectiveContext): string {
  for (const bot of ctx.world.bots) {
    if (inventoryCount(bot, ItemKind.Chip) > 0) return `in the hold of ${bot.name}`;
  }
  const loose = ctx.world.items.find((stack) => stack.kind === ItemKind.Chip && stack.count > 0);
  if (loose === undefined) return 'nowhere on the site';
  const locker = surveyFor(ctx.initialWorld.vars.seed ?? 1).locker;
  if (!eq(loose.at, locker)) return `on the ground at ${point(loose.at)}`;
  return tilesEntered(ctx).has(key(locker))
    ? 'still in the locker; the bot stood on it'
    : 'still in the locker; nobody reached it';
}

/** The tick and tile the run ended on, and what the sim said stopped it. */
function died(ctx: ObjectiveContext): Divergence {
  const death = ctx.trace.events.find((event): event is DieEvent => event.kind === 'die');
  if (death === undefined) {
    return { where: 'end of run', expected: 'a bot on the site', received: NOTHING };
  }
  return {
    where: `tick ${String(death.t)} · ${point(death.at)}`,
    expected: 'the bot still running',
    received: clipValue(death.reason),
  };
}

/**
 * Par: measured from the reference, which drives the filed plan and only re-surveys where the
 * plan turns out to be wrong. That lands between 83 and 116 ticks across the five seeds and par
 * is the worst of them, because every seed has to clear it.
 *
 * The number only means anything because the workings are a tree (`clearOf`). The filed route is
 * the shortest walk to the locker there is, so a program that throws the plan away cannot walk
 * less than one that keeps it — it can only walk the same ground plus whichever dead ends it
 * tried first. Measured, the two best off-plan programs cost 261–290 and 121–358 against par 116.
 * docs/FIX-PAR-REPAIRS.md §1.
 */
export const w8_04: LevelDef = {
  id: 'w8-04',
  world: 8,
  index: 4,
  title: 'Signal from 4470',
  hardware: [],
  brief: [
    '**MEMO KD-2840**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**CC:** Contractor #4470',
    '**RE:** Countersignature',
    '',
    'There is a locker in the workings with a printed form in it and a spare chair caster. The',
    'form is KD-0001-T and it has never been signed. There are lockers at the end of every other',
    'working too, and every one of those is signed, filed and empty. The route to the one that is',
    'not was filed eleven months ago by the contractor who put it there. Most of it is still true.',
    '',
    'Bring the form back up. The run ends with the form in the bot.',
  ].join('\n'),
  facts: [
    {
      label: 'The band',
      value: '`antenna` is live at the lift. `receive()` returns the next packet, or `null`.',
    },
    { label: 'Packet', value: '`KD4470|SEC|<n>|<route>|<checksum>`' },
    {
      label: 'Checksum',
      value:
        'The character codes of everything before the final `|`, added up, modulo 1000. Traffic that does not add up is not the plan.',
    },
    {
      label: 'The cipher',
      value:
        'The whole packet is Caesar-shifted over printable ASCII by one number from 0 to 94. `decode(text, key)` undoes it.',
    },
    {
      label: '`<route>`',
      value:
        'A count then `N`, `E`, `S` or `W`, groups run together. Section 0 starts at the lift; each section starts where the last one ended.',
    },
    {
      label: 'The lockers',
      value:
        '`locker-0` upwards, one per working. `probe(id)` finds any of them from anywhere, and the numbering is shuffled every shift.',
    },
    {
      label: 'The workings',
      value:
        'No two corridors ever run side by side, so there is exactly one way from the lift to any tile on the site.',
    },
    {
      label: 'What changed',
      value:
        'Between a sixth and a third of the sections cross tunnel that has since come down. There is always a way round, and the plan does not know about it.',
    },
    {
      label: 'Still true',
      value: 'Everywhere else, including where each group of moves was meant to finish.',
    },
    { label: 'A move into rock', value: 'Goes nowhere and still costs a tick.' },
    {
      label: 'The reading',
      value:
        'One line, `plan <cipher> <legs>`: the shift the filed traffic decodes under, and how many groups of moves the plan describes once the decoys are thrown away. Neither is anywhere in the workings.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 116 },
  budget: { maxTicks: 3000 },
  build,
  objectives: [
    Objectives.custom('form-recovered', 'Finish the shift holding KD-0001-T', holdsForm, {
      divergence: (ctx) => ({
        where: 'KD-0001-T at the end of the run',
        expected: 'in the bot',
        received: clipValue(formStanding(ctx)),
      }),
    }),
    Objectives.custom(
      'bot-intact',
      'Bring the bot back in one piece',
      (ctx) => ctx.world.bots[0]?.alive === true,
      { divergence: died },
    ),
  ],
  bonus: [
    /* No `progress()`. Neither figure is a running total of anything the trace counts, so
       `budgetFor` would have had to guess a meter for the bar and would have drawn the wrong
       one. `docs/FIX-BONUSES-7-8.md` states the rule. */
    Objectives.custom(
      'read-the-plan',
      'Report the shift the plan was filed under, and how many legs it describes',
      planRead,
      { divergence: misreadPlan },
    ),
  ],
  starter: [
    "// import { findKey, unpack, reach } from 'lib';",
    '// NOTE(4470): the route below was true when i filed it. some of it still is',
    '// TODO(4470): whoever gets this. the form is in the locker. it is not signed',
    '// TODO(4470): i could not sign it. read the charter and you will see why',
    '',
    'let packet = receive();',
    'while (packet !== null) {',
    '  print(packet);',
    '  packet = receive();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'The band is not the puzzle. You have decoded a shifted, checksummed stream before, and this one is in the same format.',
    'The plan is a description of the tunnel as it was. Every claim it makes can be checked before you act on it, and checking costs nothing.',
    'A group of moves says two things: how to get somewhere, and where you end up. Only one of those has stopped being true.',
    'When the way is shut, you already know where you were trying to get to. That turns a lost run into a short local problem.',
    'Throwing the plan away is a correct program. Count how much of the workings it makes you walk.',
    'Nothing in the tunnel will ever tell you what shift the traffic came in under. The only thing that knows is the checksum, and there are only ninety-five things to ask it.',
  ],
  docs: ['decode', 'receive', 'look', 'canMove', 'pickup'],
};
