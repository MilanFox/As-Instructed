import type {
  ApiCall,
  BotView,
  EventOrigin,
  MachineView,
  TileView,
  Trace,
  Vec,
  World,
} from '../engine/index.ts';
import {
  botById,
  botView,
  machineById,
  machineView,
  replayThrough,
  replayTo,
  tileView,
} from '../engine/index.ts';
import type { GameState } from './store.ts';
import { resolveEventCursor } from './store.ts';

export type InspectTarget =
  { kind: 'tile'; at: Vec } | { kind: 'machine'; id: string } | { kind: 'bot'; id: number };

export type InspectedView<T extends InspectTarget> = T extends { kind: 'tile' }
  ? TileView
  : T extends { kind: 'machine' }
    ? MachineView
    : BotView;

export interface EntityViews<T extends InspectTarget = InspectTarget> {
  target: T;
  eventIndex: number | null;
  now: InspectedView<T> | null;
  before: InspectedView<T> | null;
}

type CursorView = Pick<GameState, 'trace' | 'tick' | 'eventCursor'>;

interface CallIndex {
  byEvent: Map<number, ApiCall[]>;
  byLine: Map<string, ApiCall[]>;
}

const NO_CALLS: readonly ApiCall[] = [];

const indexes = new WeakMap<Trace, CallIndex>();

function lineKey(file: EventOrigin['file'], line: number): string {
  return `${file}:${String(line)}`;
}

function callIndex(trace: Trace): CallIndex {
  const known = indexes.get(trace);
  if (known) return known;
  const index: CallIndex = { byEvent: new Map(), byLine: new Map() };
  for (const call of trace.calls?.calls ?? []) {
    for (const event of call.events) {
      const list = index.byEvent.get(event);
      if (list) list.push(call);
      else index.byEvent.set(event, [call]);
    }
    if (call.origin === undefined) continue;
    const key = lineKey(call.origin.file, call.origin.line);
    const list = index.byLine.get(key);
    if (list) list.push(call);
    else index.byLine.set(key, [call]);
  }
  indexes.set(trace, index);
  return index;
}

export function callsAtEvent(trace: Trace, eventIndex: number): readonly ApiCall[] {
  return callIndex(trace).byEvent.get(eventIndex) ?? NO_CALLS;
}

export function callsFromLine(
  trace: Trace,
  file: EventOrigin['file'],
  line: number,
): readonly ApiCall[] {
  return callIndex(trace).byLine.get(lineKey(file, line)) ?? NO_CALLS;
}

export function cursorCalls(state: CursorView): readonly ApiCall[] {
  if (state.trace === null) return NO_CALLS;
  const index = resolveEventCursor(state.trace, state.tick, state.eventCursor);
  return index === null ? NO_CALLS : callsAtEvent(state.trace, index);
}

function viewIn(
  world: World,
  target: InspectTarget,
  tick: number,
): TileView | MachineView | BotView | null {
  switch (target.kind) {
    case 'tile':
      return tileView(world, target.at, tick);
    case 'machine': {
      const machine = machineById(world, target.id);
      return machine ? machineView(machine) : null;
    }
    case 'bot': {
      const bot = botById(world, target.id);
      return bot ? botView(bot) : null;
    }
  }
}

function targetKey(target: InspectTarget): string {
  switch (target.kind) {
    case 'tile':
      return `tile:${String(target.at.x)},${String(target.at.y)}`;
    case 'machine':
      return `machine:${target.id}`;
    case 'bot':
      return `bot:${String(target.id)}`;
  }
}

interface HeldViews {
  eventIndex: number | null;
  tick: number;
  views: EntityViews;
}

const heldViews = new WeakMap<Trace, Map<string, HeldViews>>();

// `now` is the world after the event under the cursor and `before` the world just ahead of it,
// so stepping event by event diffs one event at a time even when several share a tick.
export function entityViewsAt<T extends InspectTarget>(
  state: CursorView,
  target: T,
): EntityViews<T> | null {
  const trace = state.trace;
  if (trace === null) return null;
  const eventIndex = resolveEventCursor(trace, state.tick, state.eventCursor);
  const key = targetKey(target);

  const perTrace = heldViews.get(trace) ?? new Map<string, HeldViews>();
  heldViews.set(trace, perTrace);
  const held = perTrace.get(key);
  if (held && held.eventIndex === eventIndex && held.tick === state.tick) {
    return held.views as EntityViews<T>;
  }

  const now =
    eventIndex === null ? replayTo(trace, state.tick) : replayThrough(trace, eventIndex + 1);
  const before = eventIndex === null ? null : replayThrough(trace, eventIndex);
  const views = {
    target,
    eventIndex,
    now: viewIn(now, target, state.tick),
    before: before === null ? null : viewIn(before, target, state.tick),
  } as EntityViews<T>;
  perTrace.set(key, { eventIndex, tick: state.tick, views });
  return views;
}
