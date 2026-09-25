import type { Dir, EventOrigin, ItemKind, Machine, Sim, Tile, Vec } from '../engine/index.ts';
import {
  Dir as DirValue,
  IllegalActionError,
  ItemKind as ItemKindValue,
  Terrain as TerrainValue,
  machineById,
  manhattan,
  tileAt,
} from '../engine/index.ts';
import type { ApiFunctionSpec } from './protocol.ts';
import { PLAYER_API, perBotApi } from './api-spec.ts';
import { apiFunctionsFor } from './ambient.ts';

export type PlayerFunction = (...args: unknown[]) => unknown;

type Attribute = (fn: PlayerFunction, name: string, botId: number) => PlayerFunction;

type Binder = (
  sim: Sim,
  botId: number,
  unlocked: readonly ApiFunctionSpec[],
  attribute: Attribute,
) => PlayerFunction;

const PLAIN: Attribute = (fn) => fn;

function locked(fn: ApiFunctionSpec): PlayerFunction {
  return () => {
    throw new Error(`\`${fn.name}()\` is not available yet. You get it in level ${fn.unlockedBy}.`);
  };
}

function attributing(sim: Sim, locate: () => EventOrigin | undefined): Attribute {
  return (fn, name, botId) =>
    (...args): unknown => {
      let origin: EventOrigin | undefined;
      try {
        origin = locate();
      } catch {
        origin = undefined;
      }
      sim.attributeTo(origin);
      sim.beginCall(name, botId, args);
      try {
        const returned = fn(...args);
        sim.endCall(botId, { returned });
        return returned;
      } catch (error) {
        sim.endCall(botId, { threw: error });
        throw error;
      } finally {
        sim.attributeTo(undefined);
      }
    };
}

function botHandles(
  sim: Sim,
  unlocked: readonly ApiFunctionSpec[],
  attribute: Attribute,
): (id: number) => Record<string, PlayerFunction> {
  const installed = new Set(unlocked);
  const cache = new Map<number, Record<string, PlayerFunction>>();

  return (id: number) => {
    const existing = cache.get(id);
    if (existing) return existing;

    const handle: Record<string, PlayerFunction> = {};
    for (const fn of perBotApi()) {
      const binder = BINDERS[fn.name];
      if (!installed.has(fn)) handle[fn.name] = locked(fn);
      else if (binder)
        handle[fn.name] = attribute(binder(sim, id, unlocked, attribute), fn.name, id);
    }
    cache.set(id, handle);
    return handle;
  };
}

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

function receivePacket(sim: Sim, botId: number): string | null {
  const antenna = antennaFor(sim, botId);
  sim.recordSense(botId, 'receive', antenna !== undefined, antenna?.id);
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

function bufferedPackets(sim: Sim, botId: number): number {
  const antenna = antennaFor(sim, botId);
  sim.recordSense(botId, 'buffered', antenna !== undefined, antenna?.id);
  if (!antenna) return 0;

  const tile = tileAt(sim.world, antenna.at);
  const queued = metaString(tile, 'rx');
  if (queued === '') return 0;

  const unread = queued.split('\n').length - metaNumber(tile, 'rxNext');
  return unread > 0 ? unread : 0;
}

function transmitPayload(sim: Sim, botId: number, text: string, cost: number): boolean {
  const antenna = antennaFor(sim, botId);
  if (!antenna) {
    sim.refuseMachineAct(botId, '', cost);
    throw new IllegalActionError('transmit(): this level has no antenna. Remove the call.', {
      botId,
    });
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
    const missing = from ? toId : fromId;
    sim.refuseMachineAct(botId, missing, cost);
    throw new IllegalActionError(
      `link("${fromId}", "${toId}"): no machine here has the id "${missing}". ` +
        `probe("${missing}") checks an id for free.`,
      { botId },
    );
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
    (...values): void => {
      sim.print(
        botId,
        values.map(printable).join(' '),
        undefined,
        sim.recordsCalls ? values : undefined,
      );
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
      sim.look(botId, dir as Dir, range === undefined ? Number.POSITIVE_INFINITY : Number(range)),
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
  buffered: (sim, botId) => (): number => bufferedPackets(sim, botId),
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
  bot: (sim, _botId, unlocked, attribute) => {
    const handleFor = botHandles(sim, unlocked, attribute);
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

const NON_FINITE = '\u{F8FF}';

function printable(value: unknown): string {
  if (typeof value !== 'object' || value === null) return stringify(value);
  try {
    const text =
      JSON.stringify(value, (_key, entry: unknown) =>
        typeof entry === 'number' && !Number.isFinite(entry) ? `${NON_FINITE}${entry}` : entry,
      ) ?? String(value);
    return text.replace(new RegExp(`"${NON_FINITE}(-?Infinity|NaN)"`, 'g'), '$1');
  } catch {
    return String(value);
  }
}

const VALUES: Record<string, unknown> = {
  Dir: DirValue,
  Terrain: TerrainValue,
  ItemKind: ItemKindValue,
};

export function assertApiComplete(): void {
  const missing = PLAYER_API.functions.filter((fn) => BINDERS[fn.name] === undefined);
  if (missing.length === 0) return;
  throw new Error(
    `RUNTIME: ${missing.length} function(s) in api-spec.ts have no implementation: ` +
      `${missing.map((fn) => fn.name).join(', ')}. Every spec entry must be bound in api-bindings.ts.`,
  );
}

export function implementedApiNames(): string[] {
  return Object.keys(BINDERS);
}

export interface PlayerScope {
  api: Record<string, PlayerFunction>;
  values: Record<string, unknown>;
}

export function buildPlayerScope(
  sim: Sim,
  botId: number,
  unlockedHardware: readonly string[],
  locate?: () => EventOrigin | undefined,
): PlayerScope {
  const functions = apiFunctionsFor(unlockedHardware);
  const installed = new Set(functions);
  const api: Record<string, PlayerFunction> = {};
  const attribute = locate === undefined ? PLAIN : attributing(sim, locate);

  for (const fn of PLAYER_API.functions) {
    if (!installed.has(fn)) {
      api[fn.name] = locked(fn);
      continue;
    }
    const binder = BINDERS[fn.name];
    if (!binder) {
      throw new Error(
        `RUNTIME: no implementation bound for "${fn.name}", which this level unlocks. ` +
          'api-spec.ts and api-bindings.ts have drifted apart.',
      );
    }
    api[fn.name] = attribute(binder(sim, botId, functions, attribute), fn.name, botId);
  }

  const values: Record<string, unknown> = { ...VALUES };
  values['console'] = consoleFor(sim, botId, attribute);

  return { api, values };
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

function consoleFor(sim: Sim, botId: number, attribute: Attribute): unknown {
  const write = (...args: unknown[]): void => {
    sim.print(botId, args.map(printable).join(' '), undefined, sim.recordsCalls ? args : undefined);
  };
  return Object.fromEntries(
    CONSOLE_METHODS.map((method) => [method, attribute(write, `console.${method}`, botId)]),
  );
}
