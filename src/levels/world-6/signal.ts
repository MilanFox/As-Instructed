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

/**
 * Shared plumbing for the listening post.
 *
 * `receive`, `transmit` and `decode` are runtime compositions over the antenna machine and the
 * tile beneath it (src/runtime/api-bindings.ts), not `Sim` methods. Every World 6 level therefore
 * installs its band exactly the same way — one antenna, `rx` queued on its tile, `tx` read back
 * out by the objectives — because the runtime finds the antenna by kind and there must be one.
 */

/** Printable ASCII 32..126. `decode` takes its key mod this, so the keyspace is 95 wide. */
export const KEYSPACE = 95;

/** The one machine id every World 6 brief tells the player to probe. */
export const MAST = 'mast';

/** The inverse of `decode`: shifts up, so `decode(encipher(text, k), k) === text`. */
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

/** What the player's `decode` does, available to `build` and to objectives. */
export function decipher(text: string, key: number): string {
  return encipher(text, -key);
}

/** The salted additive mod-256 sum. Shared by w6-02 and w6-05 on purpose. */
export function additive(values: readonly number[], salt: number): number {
  let sum = salt;
  for (const value of values) sum += value;
  return ((sum % 256) + 256) % 256;
}

/** The weighted companion: value `i` counts `i + 1` times. */
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

/** Installs the level's single antenna and queues `packets` on the tile beneath it. */
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

/** A machine var, or 0 when the antenna is missing. Objectives read the salt and key this way. */
export function postVar(world: World, name: string): number {
  return postOf(world)?.vars[name] ?? 0;
}

/** The packets `build` queued, in order. */
export function queued(world: World): string[] {
  return band(world, 'rx');
}

/** What the program sent, in order. Empty when it sent nothing. */
export function transmitted(world: World): string[] {
  return band(world, 'tx');
}

function band(world: World, key: string): string[] {
  const post = postOf(world);
  if (!post) return [];
  const value = tileAt(world, post.at)?.meta?.[key];
  return typeof value === 'string' && value !== '' ? value.split('\n') : [];
}

/** How many leading entries of `actual` match `expected`. Every World 6 progress bar wants this. */
export function matchingPrefix(actual: readonly string[], expected: readonly string[]): number {
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  return i;
}

/**
 * The route is the only floor there is; everything else is a pit, so leaving it is fatal.
 *
 * Shared by `w6-03` and `w6-05` because the divergence is the point: "Keep the bot out of the
 * pits — not met" was the whole report, and the tick and the cell it happened on are the two
 * numbers that turn a re-read of the brief into a look at one move.
 */
export function stayOnRoute(): Objective {
  return Objectives.custom(
    'stay-on-route',
    'Keep the bot out of the pits',
    (ctx) => botById(ctx.world, 0)?.alive === true,
    undefined,
    (ctx) => {
      const fall = ctx.trace.events.find(
        (event): event is DieEvent => event.kind === 'die' && event.botId === 0,
      );
      if (!fall) return undefined;
      const terrain = tileAt(ctx.initialWorld, fall.at)?.terrain ?? Terrain.Pit;
      return {
        where: `tick ${String(fall.t)} · (${String(fall.at.x)}, ${String(fall.at.y)})`,
        expected: Terrain.Floor,
        received: terrain,
      };
    },
  );
}
