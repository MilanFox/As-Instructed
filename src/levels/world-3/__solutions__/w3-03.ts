import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key, surveyYard } from './driver.ts';

export const solution: ReferenceSolution = {
  levelId: 'w3-03',
  run(sim: Sim, botId: number): void {
    const slots = new Map<number, Vec>();
    const seen = new Set<string>();
    const bay: Vec[] = [];

    surveyYard(sim, botId, (tile) => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.terrain === 'pad') bay.push(tile.at);
      const index = tile.mark === null ? Number.NaN : Number(tile.mark);
      if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {
        slots.set(index, tile.at);
      }
    });

    const target = bay[0];
    if (!target) return;
    for (const index of [...slots.keys()].sort((a, b) => a - b)) {
      const slot = slots.get(index);
      if (!slot) continue;
      goTo(sim, botId, slot);
      sim.pickup(botId, 'crate', 1);
      goTo(sim, botId, target);
      sim.drop(botId, 'crate', 1);
    }
  },
  source: [
    'const slots = new Map<number, Vec>();',
    'const seen = new Set<string>();',
    'const bay: Vec[] = [];',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    "  if (tile.terrain === 'pad') bay.push(tile.at);",
    '  const index = tile.mark === null ? Number.NaN : Number(tile.mark);',
    "  if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {",
    '    slots.set(index, tile.at);',
    '  }',
    '}',
    '',
    'function read(): void {',
    '  note(scan());',
    '  note(scan(Dir.North));',
    '  note(scan(Dir.South));',
    '}',
    '',
    'function goTo(target: Vec): void {',
    '  while (pos().x !== target.x) move(pos().x < target.x ? Dir.East : Dir.West);',
    '  while (pos().y !== target.y) move(pos().y < target.y ? Dir.South : Dir.North);',
    '}',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    'let along = Dir.East;',
    'for (;;) {',
    '  read();',
    '  while (canMove(along)) {',
    '    move(along);',
    '    read();',
    '  }',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (canMove(Dir.South)) move(Dir.South);',
    '  along = along === Dir.East ? Dir.West : Dir.East;',
    '}',
    '',
    'for (const index of [...slots.keys()].sort((a, b) => a - b)) {',
    '  goTo(slots.get(index));',
    "  pickup('crate');",
    '  goTo(bay[0]);',
    "  drop('crate');",
    '}',
  ].join('\n'),
};

const RACK_ROWS = [2, 3, 6, 7];
const AISLE_COLS = [1, 6, 11, 16];
const YARD_EAST = 16;
const YARD_SOUTH = 8;
const DETOUR = 1000;

interface Yard {
  bay: Vec | null;
  arrivals: Map<number, Vec>;
  stocked: Set<string>;
}

function readAround(sim: Sim, botId: number, found: Yard): void {
  const tiles = [
    sim.scan(botId),
    sim.scan(botId, Dir.North),
    sim.scan(botId, Dir.East),
    sim.scan(botId, Dir.South),
    sim.scan(botId, Dir.West),
  ];
  for (const tile of tiles) {
    if (!tile.inBounds) continue;
    if (tile.terrain === 'pad') found.bay = tile.at;
    const index = tile.mark === null ? Number.NaN : Number(tile.mark);
    if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {
      found.arrivals.set(index, tile.at);
      found.stocked.add(key(tile.at));
    }
  }
}

const treadCost = (found: Yard, at: Vec): number =>
  RACK_ROWS.includes(at.y) && !AISLE_COLS.includes(at.x) && !found.stocked.has(key(at)) ? 1 : 0;

function routeThroughAisles(found: Yard, from: Vec, to: Vec): Vec[] {
  const index = (at: Vec): number => at.y * (YARD_EAST + 2) + at.x;
  const cost = new Map<number, number>([[index(from), 0]]);
  const prev = new Map<number, Vec>();
  const open: Vec[] = [from];
  while (open.length > 0) {
    let pick = 0;
    for (let i = 1; i < open.length; i++) {
      const rival = cost.get(index(open[i] as Vec)) ?? 0;
      if (rival < (cost.get(index(open[pick] as Vec)) ?? 0)) pick = i;
    }
    const at = open.splice(pick, 1)[0] as Vec;
    const base = cost.get(index(at)) ?? 0;
    const steps = [
      { x: at.x, y: at.y - 1 },
      { x: at.x + 1, y: at.y },
      { x: at.x, y: at.y + 1 },
      { x: at.x - 1, y: at.y },
    ];
    for (const next of steps) {
      if (next.x < 1 || next.x > YARD_EAST || next.y < 1 || next.y > YARD_SOUTH) continue;
      const candidate = base + treadCost(found, next) * DETOUR + 1;
      if (candidate < (cost.get(index(next)) ?? Number.POSITIVE_INFINITY)) {
        cost.set(index(next), candidate);
        prev.set(index(next), at);
        open.push(next);
      }
    }
  }
  const path: Vec[] = [];
  let at: Vec | undefined = to;
  while (at && !(at.x === from.x && at.y === from.y)) {
    path.push(at);
    at = prev.get(index(at));
  }
  return path.reverse();
}

function driveTo(sim: Sim, botId: number, found: Yard, to: Vec): void {
  for (const next of routeThroughAisles(found, sim.pos(botId), to)) {
    const at = sim.pos(botId);
    const dir =
      next.y < at.y ? Dir.North : next.x > at.x ? Dir.East : next.y > at.y ? Dir.South : Dir.West;
    sim.move(botId, dir);
    readAround(sim, botId, found);
  }
}

function walkAisle(sim: Sim, botId: number, found: Yard, y: number): void {
  const from = sim.pos(botId);
  driveTo(sim, botId, found, { x: from.x <= YARD_EAST / 2 ? 1 : YARD_EAST, y });
  const along = sim.pos(botId).x === 1 ? Dir.East : Dir.West;
  while (sim.canMove(botId, along)) {
    sim.move(botId, along);
    readAround(sim, botId, found);
  }
}

function shipInOrder(sim: Sim, botId: number, found: Yard): void {
  const bay = found.bay;
  if (!bay) return;
  for (const index of [...found.arrivals.keys()].sort((a, b) => a - b)) {
    const slot = found.arrivals.get(index);
    if (!slot) continue;
    driveTo(sim, botId, found, slot);
    sim.pickup(botId, 'crate', 1);
    driveTo(sim, botId, found, bay);
    sim.drop(botId, 'crate', 1);
  }
}

export function aisleRound(sim: Sim, botId: number, rows: readonly number[]): void {
  const found: Yard = { bay: null, arrivals: new Map(), stocked: new Set() };
  readAround(sim, botId, found);
  for (const y of rows) walkAisle(sim, botId, found, y);
  shipInOrder(sim, botId, found);
}

export const starSolution: ReferenceSolution = {
  levelId: 'w3-03',
  run(sim: Sim, botId: number): void {
    const start = sim.pos(botId).y;
    aisleRound(
      sim,
      botId,
      start === 1 ? [1, 4, 5, 8] : start === YARD_SOUTH ? [8, 5, 4, 1] : [4, 5, 8, 1],
    );
  },
  source: [
    'const RACK_ROWS = [2, 3, 6, 7];',
    'const AISLE_COLS = [1, 6, 11, 16];',
    'const bay = { at: null };',
    'const arrivals = new Map<number, Vec>();',
    'const stocked = new Set<string>();',
    'const k = (at: Vec) => `${at.x},${at.y}`;',
    '',
    '// Racking never moves, so a slot that read empty on the way past stays a detour all shift.',
    'function tread(at: Vec): number {',
    '  const racked = RACK_ROWS.includes(at.y) && !AISLE_COLS.includes(at.x);',
    '  return racked && !stocked.has(k(at)) ? 1000 : 0;',
    '}',
    '',
    'function readAround(): void {',
    '  const tiles = [scan(), scan(Dir.North), scan(Dir.East), scan(Dir.South), scan(Dir.West)];',
    '  for (const tile of tiles) {',
    '    if (!tile.inBounds) continue;',
    "    if (tile.terrain === 'pad') bay.at = tile.at;",
    '    const index = tile.mark === null ? NaN : Number(tile.mark);',
    "    if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {",
    '      arrivals.set(index, tile.at);',
    '      stocked.add(k(tile.at));',
    '    }',
    '  }',
    '}',
    '',
    'function route(from: Vec, to: Vec): Vec[] {',
    '  const id = (at: Vec) => at.y * 18 + at.x;',
    '  const cost = new Map([[id(from), 0]]);',
    '  const prev = new Map<number, Vec>();',
    '  const open = [from];',
    '  while (open.length > 0) {',
    '    let pick = 0;',
    '    for (let i = 1; i < open.length; i++) {',
    '      if (cost.get(id(open[i])) < cost.get(id(open[pick]))) pick = i;',
    '    }',
    '    const at = open.splice(pick, 1)[0];',
    '    const steps = [',
    '      { x: at.x, y: at.y - 1 },',
    '      { x: at.x + 1, y: at.y },',
    '      { x: at.x, y: at.y + 1 },',
    '      { x: at.x - 1, y: at.y },',
    '    ];',
    '    for (const next of steps) {',
    '      if (next.x < 1 || next.x > 16 || next.y < 1 || next.y > 8) continue;',
    '      const candidate = cost.get(id(at)) + tread(next) + 1;',
    '      if (candidate < (cost.get(id(next)) ?? Infinity)) {',
    '        cost.set(id(next), candidate);',
    '        prev.set(id(next), at);',
    '        open.push(next);',
    '      }',
    '    }',
    '  }',
    '  const path: Vec[] = [];',
    '  let at = to;',
    '  while (at && !(at.x === from.x && at.y === from.y)) {',
    '    path.push(at);',
    '    at = prev.get(id(at));',
    '  }',
    '  return path.reverse();',
    '}',
    '',
    'function driveTo(to: Vec): void {',
    '  for (const next of route(pos(), to)) {',
    '    const at = pos();',
    '    if (next.y < at.y) move(Dir.North);',
    '    else if (next.x > at.x) move(Dir.East);',
    '    else if (next.y > at.y) move(Dir.South);',
    '    else move(Dir.West);',
    '    readAround();',
    '  }',
    '}',
    '',
    'function walkAisle(y: number): void {',
    '  driveTo({ x: pos().x <= 8 ? 1 : 16, y });',
    '  const along = pos().x === 1 ? Dir.East : Dir.West;',
    '  while (canMove(along)) {',
    '    move(along);',
    '    readAround();',
    '  }',
    '}',
    '',
    '// The four aisle rows read every rack row from the side, so the whole yard is known',
    '// without a wheel ever touching an empty slot.',
    'readAround();',
    'const start = pos().y;',
    'const order = start === 1 ? [1, 4, 5, 8] : start === 8 ? [8, 5, 4, 1] : [4, 5, 8, 1];',
    'for (const y of order) walkAisle(y);',
    '',
    'for (const index of [...arrivals.keys()].sort((a, b) => a - b)) {',
    '  driveTo(arrivals.get(index));',
    "  pickup('crate');",
    '  driveTo(bay.at);',
    "  drop('crate');",
    '}',
  ].join('\n'),
};
