import type { Dir, ItemKind, Machine, Sim, Tile, Vec } from '../engine/index.ts';
import {
  Dir as DirValue,
  ItemKind as ItemKindValue,
  Terrain as TerrainValue,
  machineById,
  manhattan,
  tileAt,
} from '../engine/index.ts';
import type { ApiFunctionSpec } from './protocol.ts';
import { PLAYER_API, perBotApi } from './api-spec.ts';
import { apiFunctionsFor, requiredTypesFor } from './ambient.ts';

/**
 * Binds one real implementation to every function in `api-spec.ts`.
 *
 * The spec is the single source of truth for the API surface: the ambient `.d.ts`, the docs panel
 * and this file all read it, so a function cannot exist in the editor and be missing at runtime.
 * `assertApiComplete()` enforces the other direction at worker startup — a spec entry with no
 * implementation is a loud crash on boot, never a `undefined is not a function` in a player's face
 * halfway through World 5.
 *
 * The bot id is bound away here; the player never passes one (DESIGN.md §3). From World 7 on,
 * `bot(id)` hands it back: the handle it returns carries the same implementations re-bound to a
 * different bot, taken from this very table, so a fleet call and a bare call can never disagree.
 */

export type PlayerFunction = (...args: unknown[]) => unknown;

/**
 * `unlocked` is only read by `bot`, which needs it to give the handle exactly the methods this
 * level has installed and no more. Every other binder ignores it.
 */
type Binder = (
  sim: Sim,
  botId: number,
  unlocked: readonly ApiFunctionSpec[],
) => PlayerFunction;

/**
 * The `Bot` handle for one id: every per-bot entry of `unlocked`, bound to `id` instead of to the
 * bot the bare functions command. Handles are memoized because World 7 solutions call `bot(id)`
 * inside their hot loops, and a fresh object per call would be pure garbage.
 */
function botHandles(
  sim: Sim,
  unlocked: readonly ApiFunctionSpec[],
): (id: number) => Record<string, PlayerFunction> {
  const members = perBotApi(unlocked);
  const cache = new Map<number, Record<string, PlayerFunction>>();

  return (id: number) => {
    const existing = cache.get(id);
    if (existing) return existing;

    const handle: Record<string, PlayerFunction> = {};
    for (const fn of members) {
      const binder = BINDERS[fn.name];
      if (binder) handle[fn.name] = binder(sim, id, unlocked);
    }
    cache.set(id, handle);
    return handle;
  };
}

/**
 * `link`, `receive`, `transmit` and `decode` have no `Sim` method: DESIGN.md leaves World 5 and 6
 * semantics open and `api-spec.ts` hands them to RUNTIME to satisfy on top of the engine's
 * extension points. The defaults below are deliberately generic and fully replay-safe — every
 * world mutation goes through `applyMachineChange` / `applyTileChange`, so a trace still replays
 * exactly. CONTENT should treat them as the contract to author levels against.
 */

const ANTENNA_KINDS = new Set(['antenna', 'router']);

function antennaFor(sim: Sim, botId: number): Machine | undefined {
  const view = sim.probe(botId);
  if (view && ANTENNA_KINDS.has(view.kind)) return machineById(sim.world, view.id);
  return sim.world.machines.find((machine) => ANTENNA_KINDS.has(machine.kind));
}

function metaString(tile: Tile | undefined, key: string): string {
  const value = tile?.meta?.[key];
  return typeof value === 'string' ? value : '';
}

function metaNumber(tile: Tile | undefined, key: string): number {
  const value = tile?.meta?.[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * The listening post's inbound queue lives in the antenna tile's `meta`: `rx` holds the packets
 * newline-separated and `rxNext` is the read cursor. `probe` charges the op; moving the cursor
 * through `applyTileChange` keeps the read in the trace, so a replay shows the same packets.
 */
function receivePacket(sim: Sim, botId: number): string | null {
  const antenna = antennaFor(sim, botId);
  void sim.probe(botId, antenna?.id);
  if (!antenna) return null;

  const tile = tileAt(sim.world, antenna.at);
  const queued = metaString(tile, 'rx');
  if (queued === '') return null;

  const packets = queued.split('\n');
  const next = metaNumber(tile, 'rxNext');
  if (next >= packets.length) return null;

  sim.applyTileChange(antenna.at, (target) => {
    target.meta = { ...(target.meta ?? {}), rxNext: next + 1 };
  });
  return packets[next] as string;
}

/**
 * Outbound payloads accumulate on the antenna machine: `vars.sent` counts them and the tile's
 * `tx` meta keeps them in order, which is what an objective reads. Rejected when the antenna is
 * missing or not `on`, and the tick is charged either way.
 */
function transmitPayload(sim: Sim, botId: number, text: string, cost: number): boolean {
  const antenna = antennaFor(sim, botId);
  if (!antenna) {
    sim.applyMachineChange(botId, '', () => {}, cost);
    return false;
  }

  const accepted = antenna.state !== 'off';
  sim.applyMachineChange(
    botId,
    antenna.id,
    (machine) => {
      if (accepted) machine.vars['sent'] = (machine.vars['sent'] ?? 0) + 1;
    },
    cost,
  );
  if (!accepted) return false;

  sim.applyTileChange(antenna.at, (tile) => {
    const previous = metaString(tile, 'tx');
    tile.meta = { ...(tile.meta ?? {}), tx: previous === '' ? text : `${previous}\n${text}` };
  });
  return true;
}

/**
 * The default cipher is a Caesar shift over the printable ASCII range, which is what every World 6
 * brief will describe. A level that wants something else states it in its brief and supplies the
 * packets already encoded for that scheme.
 */
function decodeText(text: string, key: number): string {
  const shift = ((Math.trunc(key) % 95) + 95) % 95;
  let out = '';
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || code > 126) {
      out += character;
      continue;
    }
    out += String.fromCharCode(((code - 32 - shift + 95) % 95) + 32);
  }
  return out;
}

/**
 * A connection is recorded on the source machine as `vars['link:<toId>'] = 1`, and the cable it
 * consumes is the Manhattan distance between the two, reported through `Verdict.stats.spend`
 * (DESIGN.md §11 A5). Unknown ids cost the full price and return false.
 */
function linkMachines(
  sim: Sim,
  botId: number,
  fromId: string,
  toId: string,
  cost: number,
): boolean {
  const from = machineById(sim.world, fromId);
  const to = machineById(sim.world, toId);
  if (!from || !to) {
    sim.applyMachineChange(botId, from ? toId : fromId, () => {}, cost);
    return false;
  }

  const distance = manhattan(from.at, to.at);
  sim.applyMachineChange(
    botId,
    fromId,
    (machine) => {
      machine.vars[`link:${toId}`] = 1;
    },
    cost,
  );
  sim.spend('cable', distance, botId);
  return true;
}

const BINDERS: Record<string, Binder> = {
  move:
    (sim, botId) =>
    (dir): boolean =>
      sim.move(botId, dir as Dir),
  pos: (sim, botId) => (): Vec => sim.pos(botId),
  print:
    (sim, botId) =>
    (text): void => {
      sim.print(botId, stringify(text));
    },
  canMove:
    (sim, botId) =>
    (dir): boolean =>
      sim.canMove(botId, dir as Dir),
  wait:
    (sim, botId) =>
    (n): void => {
      sim.wait(botId, n === undefined ? 1 : Number(n));
    },
  scan:
    (sim, botId) =>
    (dir): unknown =>
      sim.scan(botId, dir as Dir | undefined),
  harvest: (sim, botId) => (): ItemKind | null => sim.harvest(botId),
  mine:
    (sim, botId) =>
    (dir): ItemKind | null =>
      sim.mine(botId, dir as Dir | undefined),
  plant:
    (sim, botId) =>
    (kind): boolean =>
      sim.plant(botId, (kind ?? 'seed') as ItemKind),
  inventory:
    (sim, botId) =>
    (kind): number =>
      sim.inventory(botId, kind as ItemKind | undefined),
  pickup:
    (sim, botId) =>
    (kind, count): number =>
      sim.pickup(botId, kind as ItemKind | undefined, count === undefined ? 1 : Number(count)),
  drop:
    (sim, botId) =>
    (kind, count): number =>
      sim.drop(botId, kind as ItemKind | undefined, count === undefined ? 1 : Number(count)),
  carrying: (sim, botId) => (): ItemKind[] => sim.carrying(botId),
  use:
    (sim, botId) =>
    (dir): boolean =>
      sim.use(botId, dir as Dir | undefined),
  look:
    (sim, botId) =>
    (dir, range): unknown =>
      sim.look(botId, dir as Dir, range === undefined ? 8 : Number(range)),
  mark:
    (sim, botId) =>
    (text): void => {
      sim.mark(botId, text === null || text === undefined ? null : stringify(text));
    },
  readMark: (sim, botId) => (): string | null => sim.readMark(botId),
  fuel: (sim, botId) => (): number => sim.fuel(botId),
  refuel: (sim, botId) => (): boolean => sim.refuel(botId),
  probe:
    (sim, botId) =>
    (machineId): unknown =>
      sim.probe(botId, machineId === undefined ? undefined : String(machineId)),
  power:
    (sim, botId) =>
    (machineId, state): boolean =>
      sim.power(botId, String(machineId), String(state)),
  link:
    (sim, botId) =>
    (fromId, toId): boolean =>
      linkMachines(sim, botId, String(fromId), String(toId), sim.costs.link),
  receive: (sim, botId) => (): string | null => receivePacket(sim, botId),
  transmit:
    (sim, botId) =>
    (text): boolean =>
      transmitPayload(sim, botId, stringify(text), sim.costs.transmit),
  decode:
    (sim, botId) =>
    (text, key): string => {
      void sim.clock(botId);
      return decodeText(stringify(text), Number(key));
    },
  bots: (sim) => (): number[] => sim.botIds(),
  clock: (sim, botId) => (): number => sim.clock(botId),
  bot: (sim, _botId, unlocked) => {
    const handleFor = botHandles(sim, unlocked);
    return (id): unknown => handleFor(Number(id));
  },
  sync: (sim) => (): number => sim.sync(),
  send:
    (sim, botId) =>
    (to, body): boolean =>
      sim.send(botId, Number(to), typeof body === 'number' ? body : stringify(body)),
  recv: (sim, botId) => (): unknown => sim.recv(botId),
  spawn:
    (sim, botId) =>
    (dir, options): number =>
      sim.spawn(botId, dir as Dir, (options ?? {}) as { name?: string; capacity?: number }),
};

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Ambient runtime values, by the name the player writes. Only value-carrying types appear. */
const VALUES: Record<string, unknown> = {
  Dir: DirValue,
  Terrain: TerrainValue,
  ItemKind: ItemKindValue,
};

/**
 * Throws unless every function in the spec has an implementation. Called at worker startup so a
 * drifted spec fails on boot rather than mid-level. DESIGN.md §3.
 */
export function assertApiComplete(): void {
  const missing = PLAYER_API.functions.filter((fn) => BINDERS[fn.name] === undefined);
  if (missing.length === 0) return;
  throw new Error(
    `RUNTIME: ${missing.length} function(s) in api-spec.ts have no implementation: ` +
      `${missing.map((fn) => fn.name).join(', ')}. Every spec entry must be bound in api-bindings.ts.`,
  );
}

/** Every name the runtime can bind, for tests and tooling. */
export function implementedApiNames(): string[] {
  return Object.keys(BINDERS);
}

export interface PlayerScope {
  api: Record<string, PlayerFunction>;
  values: Record<string, unknown>;
}

/**
 * The exact scope the player's program runs in at this level: the unlocked functions, plus the
 * ambient values their signatures reference and nothing else. A locked function is absent from
 * both the `.d.ts` and this object, so calling it is a type error first and a clear runtime
 * message second.
 */
export function buildPlayerScope(
  sim: Sim,
  botId: number,
  unlockedHardware: readonly string[],
): PlayerScope {
  const functions = apiFunctionsFor(unlockedHardware);
  const api: Record<string, PlayerFunction> = {};

  for (const fn of functions) {
    const binder = BINDERS[fn.name];
    if (!binder) {
      throw new Error(
        `RUNTIME: no implementation bound for "${fn.name}", which this level unlocks. ` +
          'api-spec.ts and api-bindings.ts have drifted apart.',
      );
    }
    api[fn.name] = binder(sim, botId, functions);
  }

  const values: Record<string, unknown> = {};
  for (const type of requiredTypesFor(functions)) {
    if (type.name in VALUES) values[type.name] = VALUES[type.name];
  }
  values['console'] = consoleFor(sim, botId, api);

  return { api, values };
}

/**
 * `console.log` is an alias for `print`, not an escape hatch: it writes into the same trace and
 * the same console panel. Beginners reach for it reflexively, and silently doing nothing would be
 * the worst of the available answers.
 */
function consoleFor(sim: Sim, botId: number, api: Record<string, PlayerFunction>): unknown {
  const write = (...args: unknown[]): void => {
    const text = args.map(stringify).join(' ');
    if (api['print']) api['print'](text);
    else sim.print(botId, text);
  };
  return { log: write, info: write, warn: write, error: write, debug: write, trace: write };
}
