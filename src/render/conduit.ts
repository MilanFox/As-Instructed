import { LIVE, manhattan } from '../engine/index.ts';
import type { Machine, TraceEvent, Vec, World } from '../engine/index.ts';

const INDEXED_ID = /^(.+)-(\d+)$/;

const SHORTEST_RUN = 6;

const REPAIRED = 'patched';

const PREREQ = 'prereq:';
const LINKED = 'link:';

const CLAMP_SPAN = 0.62;
const CLAMP_DEPTH = 0.26;
const JAW = 0.16;

export interface RunStyle {
  rail: string;
  deck: string;
  core: string;
  dead: string;
  railWidth: number;
  deckWidth: number;
  coreWidth: number;
}

export interface PrereqCable {
  from: Vec;
  to: Vec;
  laid: boolean;
  live: boolean;
}

export interface RunCell {
  at: Vec;
  carrying: boolean | null;
}

interface Member {
  index: number;
  at: Vec;
  reading: number | null;
}

function family(id: string): { name: string; index: number } | null {
  const parsed = INDEXED_ID.exec(id);
  const name = parsed?.[1];
  const index = parsed?.[2];
  if (name === undefined || index === undefined) return null;
  return { name, index: Number(index) };
}

function readingOf(machine: Machine): number | null {
  const reading = machine.vars[LIVE];
  return typeof reading === 'number' ? reading : null;
}

function unbroken(members: readonly Member[]): boolean {
  for (let i = 1; i < members.length; i++) {
    const before = members[i - 1];
    const after = members[i];
    if (!before || !after) return false;
    if (after.index !== before.index + 1) return false;
    if (manhattan(before.at, after.at) !== 1) return false;
  }
  return true;
}

function feederFor(machines: readonly Machine[], end: Vec, inward: Vec, name: string): Vec | null {
  let found: Vec | null = null;
  for (const machine of machines) {
    if (family(machine.id)?.name === name) continue;
    const at = machine.at;
    if (manhattan(at, end) !== 1) continue;
    if (at.x === inward.x && at.y === inward.y) continue;
    if (found) return null;
    found = at;
  }
  return found;
}

export function machineRuns(world: World): RunCell[][] {
  const families = new Map<string, Member[]>();
  for (const machine of world.machines) {
    const parsed = family(machine.id);
    if (!parsed) continue;
    const members = families.get(parsed.name) ?? [];
    members.push({
      index: parsed.index,
      at: machine.at,
      reading: readingOf(machine),
    });
    families.set(parsed.name, members);
  }

  const runs: RunCell[][] = [];
  for (const [name, members] of families) {
    if (members.length < SHORTEST_RUN) continue;
    members.sort((a, b) => a.index - b.index);
    if (!unbroken(members)) continue;
    const path: RunCell[] = members.map((member) => ({
      at: member.at,
      carrying: member.reading === null ? null : member.reading === 1,
    }));
    const head = path[0];
    const second = path[1];
    const tail = path[path.length - 1];
    const penultimate = path[path.length - 2];
    if (head && second) {
      const fed = feederFor(world.machines, head.at, second.at, name);
      if (fed) path.unshift({ at: fed, carrying: head.carrying });
    }
    if (tail && penultimate) {
      const onward = feederFor(world.machines, tail.at, penultimate.at, name);
      if (onward) path.push({ at: onward, carrying: tail.carrying });
    }
    runs.push(path);
  }
  return runs;
}

function midpoint(a: Vec, b: Vec, tilePx: number): [number, number] {
  return [((a.x + b.x + 1) / 2) * tilePx, ((a.y + b.y + 1) / 2) * tilePx];
}

function traceCores(
  ctx: CanvasRenderingContext2D,
  runs: readonly RunCell[][],
  tilePx: number,
  dead: boolean,
): boolean {
  let any = false;
  ctx.beginPath();
  for (const run of runs) {
    for (let i = 0; i < run.length; i++) {
      const cell = run[i];
      if (!cell) continue;
      if ((cell.carrying === false) !== dead) continue;
      any = true;
      const before = run[i - 1];
      const after = run[i + 1];
      const px = (cell.at.x + 0.5) * tilePx;
      const py = (cell.at.y + 0.5) * tilePx;
      if (before) {
        const [bx, by] = midpoint(before.at, cell.at, tilePx);
        ctx.moveTo(bx, by);
        ctx.lineTo(px, py);
      } else {
        ctx.moveTo(px, py);
      }
      if (after) {
        const [ax, ay] = midpoint(cell.at, after.at, tilePx);
        ctx.lineTo(ax, ay);
      }
    }
  }
  return any;
}

export function drawRuns(
  ctx: CanvasRenderingContext2D,
  runs: readonly RunCell[][],
  tilePx: number,
  style: RunStyle,
): void {
  if (runs.length === 0) return;
  const casing = (): void => {
    ctx.beginPath();
    for (const run of runs) {
      for (let i = 0; i < run.length; i++) {
        const cell = run[i];
        if (!cell) continue;
        const px = (cell.at.x + 0.5) * tilePx;
        const py = (cell.at.y + 0.5) * tilePx;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lay = (color: string, fraction: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, tilePx * fraction);
    casing();
    ctx.stroke();
  };
  lay(style.rail, style.railWidth);
  lay(style.deck, style.deckWidth);

  ctx.lineWidth = Math.max(1, tilePx * style.coreWidth);
  for (const dead of [false, true]) {
    ctx.strokeStyle = dead ? style.dead : style.core;
    if (traceCores(ctx, runs, tilePx, dead)) ctx.stroke();
  }
  ctx.restore();
}

export function runRevision(world: World): number {
  let revision = 0;
  for (const machine of world.machines) {
    const reading = readingOf(machine);
    if (reading === null) continue;
    revision = (revision * 31 + reading + 1) | 0;
  }
  return revision;
}

export function isRepaired(state: string): boolean {
  return state === REPAIRED;
}

export function drawRepair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  color: string,
): void {
  const span = Math.max(3, Math.round(tilePx * CLAMP_SPAN));
  const depth = Math.max(2, Math.round(tilePx * CLAMP_DEPTH));
  const jaw = Math.max(1, Math.round(tilePx * JAW));
  const left = Math.round((x + 0.5) * tilePx - span / 2);
  const top = Math.round((y + 0.5) * tilePx - depth / 2);
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(left, top, span, jaw);
  ctx.fillRect(left, top + depth - jaw, span, jaw);
  ctx.fillRect(left, top, jaw, depth);
  ctx.fillRect(left + span - jaw, top, jaw, depth);
  ctx.restore();
}

function prereqsOf(machine: Machine): string[] {
  const found: string[] = [];
  for (const [name, value] of Object.entries(machine.vars)) {
    if (value === 1 && name.startsWith(PREREQ)) found.push(name.slice(PREREQ.length));
  }
  return found;
}

export function latchedUp(
  initial: World,
  events: readonly TraceEvent[],
  tick: number,
): Set<string> {
  const up = new Set<string>();
  const byCell = new Map<string, Machine>();
  for (const machine of initial.machines) {
    byCell.set(`${String(machine.at.x)},${String(machine.at.y)}`, machine);
    if (machine.state === 'on' && prereqsOf(machine).length === 0) up.add(machine.id);
  }
  for (const event of events) {
    if (event.t > tick) break;
    if (event.kind !== 'act' || event.name !== 'power' || !event.ok || event.at === undefined) {
      continue;
    }
    const machine = byCell.get(`${String(event.at.x)},${String(event.at.y)}`);
    if (!machine) continue;
    if (event.detail !== 'on') up.delete(machine.id);
    else if (prereqsOf(machine).every((id) => up.has(id))) up.add(machine.id);
  }
  return up;
}

export function prereqCables(world: World, latched: ReadonlySet<string>): PrereqCable[] {
  const cables: PrereqCable[] = [];
  const byId = new Map<string, Machine>();
  for (const machine of world.machines) byId.set(machine.id, machine);
  const isUp = (machine: Machine): boolean => machine.state === 'on' && latched.has(machine.id);
  for (const station of world.machines) {
    for (const id of prereqsOf(station)) {
      const feeder = byId.get(id);
      if (!feeder) continue;
      const laid = feeder.vars[`${LINKED}${station.id}`] === 1;
      cables.push({
        from: feeder.at,
        to: station.at,
        laid,
        live: laid && isUp(feeder) && isUp(station),
      });
    }
  }
  return cables;
}

export function switchedEarly(machine: Machine, latched: ReadonlySet<string>): boolean {
  return machine.state === 'on' && !latched.has(machine.id) && prereqsOf(machine).length > 0;
}
