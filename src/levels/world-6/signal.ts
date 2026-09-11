import type { DieEvent, Machine, Objective, Vec, World } from '../../engine/index.ts';
import {
  MachineKind,
  Objectives,
  Terrain,
  addMachine,
  botById,
  setTile,
  tileAt,
} from '../../engine/index.ts';

export const KEYSPACE = 95;

export const MAST = 'mast';

export function encipher(text: string, key: number): string {
  const shift = ((Math.trunc(key) % KEYSPACE) + KEYSPACE) % KEYSPACE;
  let out = '';
  for (const character of text) {
    const code = character.charCodeAt(0);
    out +=
      code < 32 || code > 126
        ? character
        : String.fromCharCode(((code - 32 + shift) % KEYSPACE) + 32);
  }
  return out;
}

export function decipher(text: string, key: number): string {
  return encipher(text, -key);
}

export function additive(values: readonly number[], salt: number): number {
  let sum = salt;
  for (const value of values) sum += value;
  return ((sum % 256) + 256) % 256;
}

export function weighted(values: readonly number[], salt: number): number {
  let sum = salt;
  for (let i = 0; i < values.length; i++) sum += (i + 1) * (values[i] ?? 0);
  return ((sum % 256) + 256) % 256;
}

export function charCodes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  return out;
}

export interface PostOptions {
  at: Vec;
  packets: readonly string[];
  vars?: Record<string, number>;
}

export function installPost(world: World, options: PostOptions): Machine {
  const terrain = tileAt(world, options.at)?.terrain ?? Terrain.Floor;
  setTile(world, options.at, {
    terrain,
    meta: { rx: options.packets.join('\n'), rxNext: 0 },
  });
  return addMachine(world, {
    id: MAST,
    kind: MachineKind.Antenna,
    at: { x: options.at.x, y: options.at.y },
    state: 'on',
    inventory: [],
    vars: { sent: 0, ...(options.vars ?? {}) },
  });
}

export function postOf(world: World): Machine | undefined {
  return world.machines.find((machine) => machine.id === MAST);
}

export function postVar(world: World, name: string): number {
  return postOf(world)?.vars[name] ?? 0;
}

export function queued(world: World): string[] {
  return band(world, 'rx');
}

export function transmitted(world: World): string[] {
  return band(world, 'tx');
}

function band(world: World, key: string): string[] {
  const post = postOf(world);
  if (!post) return [];
  const value = tileAt(world, post.at)?.meta?.[key];
  return typeof value === 'string' && value !== '' ? value.split('\n') : [];
}

export function matchingPrefix(actual: readonly string[], expected: readonly string[]): number {
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  return i;
}

export function point(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

export function stayOnRoute(): Objective {
  return Objectives.custom(
    'stay-on-route',
    'Keep the bot out of the pits',
    (ctx) => botById(ctx.world, 0)?.alive === true,
    {
      divergence: (ctx) => {
        const fall = ctx.trace.events.find(
          (event): event is DieEvent => event.kind === 'die' && event.botId === 0,
        );
        if (!fall) return undefined;
        const terrain = tileAt(ctx.initialWorld, fall.at)?.terrain ?? Terrain.Pit;
        return {
          where: `tick ${String(fall.t)} · ${point(fall.at)}`,
          expected: Terrain.Floor,
          received: terrain,
        };
      },
    },
  );
}
