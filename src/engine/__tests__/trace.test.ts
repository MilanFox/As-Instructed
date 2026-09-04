import { describe, expect, test } from 'vitest';
import type { Trace, TraceEvent, World } from '../index.ts';
import {
  Dir,
  ItemKind,
  KEYFRAME_INTERVAL,
  Rng,
  Sim,
  applyEvent,
  cloneWorld,
  eventIndexAt,
  printsUpTo,
  replayTo,
  reviveTrace,
  vec,
} from '../index.ts';
import { asciiWorld, must } from './helpers.ts';

/**
 * Long enough to cross a keyframe boundary, wide enough to exercise every event kind that edits
 * the world: crops, terrain, ground items, marks, inboxes, machines-by-proxy and a spawn.
 */
const ROWS = ['SG......', '........', '...R....'];

function buildWorld(): World {
  return asciiWorld(ROWS, {
    bots: [vec(0, 0), vec(0, 1), vec(0, 2)],
    inventory: [{ kind: ItemKind.Seed, count: 2 }],
  });
}

function drive(sim: Sim): void {
  sim.plant(0);
  sim.print(0, 'planted');
  sim.wait(0, 1300);
  sim.harvest(0);

  sim.move(1, Dir.East);
  sim.mark(1, 'waypoint');
  sim.wait(1, 300);
  sim.turn(1, Dir.South);

  sim.move(2, Dir.East);
  sim.move(2, Dir.East);
  sim.mine(2, Dir.East);
  sim.drop(2, ItemKind.Stone, 1);
  sim.pickup(2, ItemKind.Stone, 1);

  // Deliberately receives while bot #1 still lags bot #0 by a thousand ticks: the live run and
  // the replay have to agree that the message has not arrived yet.
  sim.send(0, 1, 'ready');
  sim.recv(1);
  sim.sync();
  sim.recv(1);
  sim.move(1, Dir.East);
  sim.spawn(0, Dir.South);
  sim.wait(0, 200);
  sim.print(0, 'done');
}

interface Run {
  sim: Sim;
  trace: Trace;
}

function run(): Run {
  const sim = new Sim(buildWorld());
  drive(sim);
  return { sim, trace: sim.finish() };
}

/** The reference implementation `replayTo` has to match: no keyframes, no shortcuts. */
function replayNaively(trace: Trace, tick: number): World {
  const world = cloneWorld(trace.initialWorld);
  for (const event of trace.events) {
    if (event.t > tick) break;
    applyEvent(world, event);
  }
  return world;
}

describe('replayTo', () => {
  test('the run under test actually crosses a keyframe boundary', () => {
    const { trace } = run();
    expect(trace.endTick).toBeGreaterThan(KEYFRAME_INTERVAL);
    expect(trace.keyframes.length).toBeGreaterThan(0);
    for (const keyframe of trace.keyframes) {
      expect(keyframe.t % KEYFRAME_INTERVAL).toBe(0);
    }
  });

  test('reconstructs the same world as a straight replay, at every interesting tick', () => {
    const { trace } = run();
    const boundaries = trace.keyframes.flatMap((k) => [k.t - 1, k.t, k.t + 1]);
    const ticks = [
      0,
      1,
      2,
      5,
      300,
      ...boundaries,
      trace.endTick - 1,
      trace.endTick,
      trace.endTick + 100,
    ];

    for (const tick of ticks) {
      expect(replayTo(trace, tick), `at tick ${tick}`).toStrictEqual(replayNaively(trace, tick));
    }
  });

  test('replaying to endTick reproduces the live final world exactly', () => {
    const { sim, trace } = run();
    expect(replayTo(trace, trace.endTick)).toStrictEqual(sim.snapshot());
  });

  test('keyframes are a pure optimisation and are safe to strip', () => {
    const { trace } = run();
    const stripped: Trace = { ...trace, keyframes: [] };
    for (let tick = 0; tick <= trace.endTick; tick += 97) {
      expect(replayTo(stripped, tick), `at tick ${tick}`).toStrictEqual(replayTo(trace, tick));
    }
  });

  test('each keyframe is the world with exactly its own prefix of events applied', () => {
    const { trace } = run();
    for (const keyframe of trace.keyframes) {
      const world = cloneWorld(trace.initialWorld);
      for (let i = 0; i < keyframe.eventIndex; i++) {
        applyEvent(world, trace.events[i] as TraceEvent);
      }
      expect(keyframe.world, `keyframe at ${keyframe.t}`).toStrictEqual(world);
    }
  });

  test('stepping one event at a time lands in the same place as replayTo', () => {
    const { trace } = run();
    const world = cloneWorld(trace.initialWorld);
    let cursor = 0;
    for (let tick = 0; tick <= trace.endTick; tick += 250) {
      while (cursor < trace.events.length && (trace.events[cursor] as TraceEvent).t <= tick) {
        applyEvent(world, trace.events[cursor] as TraceEvent);
        cursor++;
      }
      expect(world, `at tick ${tick}`).toStrictEqual(replayTo(trace, tick));
    }
  });

  test('replaying does not mutate the trace it replays from', () => {
    const { trace } = run();
    const before = cloneWorld(trace.initialWorld);
    replayTo(trace, trace.endTick);
    replayTo(trace, 0);
    expect(trace.initialWorld).toStrictEqual(before);
  });

  test('a tick before anything happened is the initial world', () => {
    const { trace } = run();
    expect(replayTo(trace, -1)).toStrictEqual(cloneWorld(trace.initialWorld));
  });
});

describe('determinism', () => {
  test('the same program on the same seed produces a byte-identical trace', () => {
    const a = run();
    const b = run();

    expect(b.trace).toStrictEqual(a.trace);
    expect(JSON.stringify(b.trace)).toBe(JSON.stringify(a.trace));
    expect(b.sim.snapshot()).toStrictEqual(a.sim.snapshot());
    expect(b.sim.ticks).toBe(a.sim.ticks);
    expect(b.sim.ops).toBe(a.sim.ops);
  });

  test('two worlds built from the same seed start byte-identical', () => {
    expect(JSON.stringify(buildWorld())).toBe(JSON.stringify(buildWorld()));
  });

  test('the Sim never consumes the world Rng, so replay never has to re-run sim logic', () => {
    const { sim, trace } = run();
    const before = new Rng(1).snapshot();
    expect(sim.world.rng.snapshot()).toEqual(before);
    expect(trace.initialWorld.rng.snapshot()).toEqual(before);
  });
});

describe('trace readers', () => {
  test('eventIndexAt finds the first event at or after a tick', () => {
    const { trace } = run();
    for (const tick of [0, 1, 300, KEYFRAME_INTERVAL, trace.endTick, trace.endTick + 1]) {
      const index = eventIndexAt(trace, tick);
      const previous = trace.events[index - 1];
      const next = trace.events[index];
      if (previous) expect(previous.t, `before ${tick}`).toBeLessThan(tick);
      if (next) expect(next.t, `at ${tick}`).toBeGreaterThanOrEqual(tick);
    }
  });

  test('printsUpTo returns console output in order and clipped to the tick', () => {
    const { trace } = run();
    const [planted, done] = printsUpTo(trace);
    expect([planted?.text, done?.text]).toEqual(['planted', 'done']);
    expect(printsUpTo(trace, must(planted).t).map((p) => p.text)).toEqual(['planted']);
    expect(printsUpTo(trace, must(planted).t - 1)).toEqual([]);
  });

  test('reviveTrace restores the Rng prototype a postMessage round-trip strips', () => {
    const { trace } = run();
    const transferred = JSON.parse(JSON.stringify(trace)) as Trace;
    expect(transferred.initialWorld.rng.next).toBeUndefined();

    reviveTrace(transferred);
    expect(typeof transferred.initialWorld.rng.next).toBe('function');
    expect(transferred.initialWorld.rng.snapshot()).toEqual(trace.initialWorld.rng.snapshot());
    for (const keyframe of transferred.keyframes) {
      expect(typeof keyframe.world.rng.next).toBe('function');
    }
  });

  test('every bot-scoped event carries the dt replay needs to restore the clock', () => {
    const { sim, trace } = run();
    // A spawned bot's clock arrives on the `bot` payload of its spawn event instead, since that
    // event is scoped to the parent that paid for it.
    const original = new Set(trace.initialWorld.bots.map((b) => b.id));
    const clocks = new Map<number, number>();
    for (const event of trace.events) {
      if (!('botId' in event) || !('dt' in event) || event.botId === undefined) continue;
      clocks.set(event.botId, Math.max(clocks.get(event.botId) ?? 0, event.t + event.dt));
    }
    for (const bot of sim.world.bots) {
      if (!original.has(bot.id)) continue;
      expect(must(clocks.get(bot.id), `clock for bot #${bot.id}`)).toBe(bot.clock);
    }
    expect(sim.world.bots.length).toBeGreaterThan(original.size);
  });
});
