import { manhattan } from '../engine/index.ts';
import type { Machine, Vec, World } from '../engine/index.ts';

const INDEXED_ID = /^(.+)-(\d+)$/;

const SHORTEST_RUN = 6;

export interface RunStyle {
  rail: string;
  deck: string;
  core: string;
  railWidth: number;
  deckWidth: number;
  coreWidth: number;
}

interface Member {
  index: number;
  at: Vec;
}

function family(id: string): { name: string; index: number } | null {
  const parsed = INDEXED_ID.exec(id);
  const name = parsed?.[1];
  const index = parsed?.[2];
  if (name === undefined || index === undefined) return null;
  return { name, index: Number(index) };
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

export function machineRuns(world: World): Vec[][] {
  const families = new Map<string, Member[]>();
  for (const machine of world.machines) {
    const parsed = family(machine.id);
    if (!parsed) continue;
    const members = families.get(parsed.name) ?? [];
    members.push({ index: parsed.index, at: machine.at });
    families.set(parsed.name, members);
  }

  const runs: Vec[][] = [];
  for (const [name, members] of families) {
    if (members.length < SHORTEST_RUN) continue;
    members.sort((a, b) => a.index - b.index);
    if (!unbroken(members)) continue;
    const path = members.map((member) => member.at);
    const head = path[0];
    const second = path[1];
    const tail = path[path.length - 1];
    const penultimate = path[path.length - 2];
    if (head && second) {
      const fed = feederFor(world.machines, head, second, name);
      if (fed) path.unshift(fed);
    }
    if (tail && penultimate) {
      const onward = feederFor(world.machines, tail, penultimate, name);
      if (onward) path.push(onward);
    }
    runs.push(path);
  }
  return runs;
}

export function drawRuns(
  ctx: CanvasRenderingContext2D,
  runs: readonly Vec[][],
  tilePx: number,
  style: RunStyle,
): void {
  if (runs.length === 0) return;
  const trace = (): void => {
    ctx.beginPath();
    for (const run of runs) {
      for (let i = 0; i < run.length; i++) {
        const cell = run[i];
        if (!cell) continue;
        const px = (cell.x + 0.5) * tilePx;
        const py = (cell.y + 0.5) * tilePx;
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
    trace();
    ctx.stroke();
  };
  lay(style.rail, style.railWidth);
  lay(style.deck, style.deckWidth);
  lay(style.core, style.coreWidth);
  ctx.restore();
}
