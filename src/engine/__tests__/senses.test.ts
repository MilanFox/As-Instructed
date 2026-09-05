import { describe, expect, test } from 'vitest';
import type { SenseEvent, TraceEvent, World } from '../index.ts';
import {
  Dir,
  MAX_SENSE_EVENTS,
  Objectives,
  OpLimitError,
  Sim,
  Terrain,
  addMachine,
  buildVerdict,
  cloneWorld,
  replayTo,
  senseTotals,
  setTerrain,
  vec,
} from '../index.ts';
import { asciiWorld, bot, must, openWorld } from './helpers.ts';

function sensesIn(events: readonly TraceEvent[]): SenseEvent[] {
  return events.filter((e): e is SenseEvent => e.kind === 'sense');
}

/** Every sensing call the player can reach, driven once against a rig that satisfies all of them. */
const SENSING_CALLS: { name: string; call: (sim: Sim, botId: number) => void }[] = [
  { name: 'pos', call: (sim, id) => void sim.pos(id) },
  { name: 'facing', call: (sim, id) => void sim.facing(id) },
  { name: 'clock', call: (sim, id) => void sim.clock(id) },
  { name: 'canMove', call: (sim, id) => void sim.canMove(id, Dir.East) },
  { name: 'scan', call: (sim, id) => void sim.scan(id, Dir.East) },
  { name: 'look', call: (sim, id) => void sim.look(id, Dir.East, 3) },
  { name: 'inventory', call: (sim, id) => void sim.inventory(id) },
  { name: 'carrying', call: (sim, id) => void sim.carrying(id) },
  { name: 'capacity', call: (sim, id) => void sim.capacity(id) },
  { name: 'fuel', call: (sim, id) => void sim.fuel(id) },
  { name: 'fuelMax', call: (sim, id) => void sim.fuelMax(id) },
  { name: 'readMark', call: (sim, id) => void sim.readMark(id) },
  { name: 'probe', call: (sim, id) => void sim.probe(id, 'lever') },
];

function sensingRig(): { sim: Sim; world: World; initialWorld: World } {
  const world = openWorld(6, 3, 1);
  addMachine(world, {
    id: 'lever',
    kind: 'lever',
    at: vec(4, 2),
    state: 'off',
    inventory: [],
    vars: {},
  });
  const initialWorld = cloneWorld(world);
  return { sim: new Sim(world), world, initialWorld };
}

describe('sensing is free in ticks but counted', () => {
  test.each(SENSING_CALLS)('$name costs one op, zero ticks, and one event', ({ name, call }) => {
    const { sim } = sensingRig();
    call(sim, 0);

    expect(sim.ops).toBe(1);
    expect(sim.ticks).toBe(0);
    expect(bot(sim.world).clock).toBe(0);

    const senses = sensesIn(sim.finish().events);
    expect(senses).toHaveLength(1);
    expect(must(senses[0]).name).toBe(name);
    expect(must(senses[0]).dt).toBe(0);
    expect(must(senses[0]).botId).toBe(0);
    expect(must(senses[0]).count).toBe(1);
  });

  test.each(SENSING_CALLS)('$name tallies exactly one sense', ({ name, call }) => {
    const { sim } = sensingRig();
    call(sim, 0);
    expect(sim.senseTotals()).toEqual({ [name]: 1 });
  });

  test('no sensing call advances a bot clock or burns fuel', () => {
    const world = openWorld(6, 3, 1, { fuel: 10 });
    addMachine(world, {
      id: 'lever',
      kind: 'lever',
      at: vec(4, 2),
      state: 'off',
      inventory: [],
      vars: {},
    });
    const sim = new Sim(world);
    for (const { call } of SENSING_CALLS) call(sim, 0);

    expect(sim.ticks).toBe(0);
    expect(bot(sim.world).clock).toBe(0);
    expect(bot(sim.world).fuel).toBe(10);
    expect(sim.ops).toBe(SENSING_CALLS.length);
  });

  test('acting commands are not counted as senses', () => {
    const { sim } = sensingRig();
    sim.move(0, Dir.East);
    sim.turn(0, Dir.South);
    sim.wait(0, 2);
    expect(sim.senseTotals()).toEqual({});
    expect(sensesIn(sim.finish().events)).toHaveLength(0);
  });

  test('recv keeps its own event and stays out of the sense ledger', () => {
    const world = openWorld(4, 2, 2);
    const sim = new Sim(world);
    sim.send(0, 1, 'hello');
    sim.sync();
    expect(sim.recv(1)?.body).toBe('hello');
    expect(sim.senseTotals()).toEqual({});
  });

  test('sense counters are per command name, not a single total', () => {
    const { sim } = sensingRig();
    for (let i = 0; i < 7; i++) sim.probe(0, 'lever');
    for (let i = 0; i < 3; i++) sim.scan(0, Dir.East);
    sim.pos(0);
    expect(sim.senseTotals()).toEqual({ probe: 7, scan: 3, pos: 1 });
  });

  test('a failed read is still counted, and reports ok: false', () => {
    const { sim } = sensingRig();
    expect(sim.probe(0, 'no-such-machine')).toBeNull();
    expect(sim.readMark(0)).toBeNull();
    expect(sim.senseTotals()).toEqual({ probe: 1, readMark: 1 });
    expect(sensesIn(sim.finish().events).map((e) => [e.name, e.ok])).toEqual([
      ['probe', false],
      ['readMark', false],
    ]);
  });

  test('detail records what was read', () => {
    const world = asciiWorld(['....', '....'], { bots: [vec(1, 1)] });
    const sim = new Sim(world);
    sim.mark(0, 'here');
    sim.pos(0);
    sim.readMark(0);
    sim.scan(0, Dir.North);
    const details = sensesIn(sim.finish().events).map((e) => [e.name, e.detail]);
    expect(details).toEqual([
      ['pos', '1,1'],
      ['readMark', 'here'],
      ['scan', '1,0'],
    ]);
  });

  test('sensing counts against maxOps like any other command', () => {
    const sim = new Sim(openWorld(3, 3, 1), { maxOps: 4 });
    for (let i = 0; i < 4; i++) sim.pos(0);
    expect(() => sim.pos(0)).toThrow(OpLimitError);
    /* The op budget is checked before the read happens, so the refused call is not tallied. */
    expect(sim.senseTotals()['pos']).toBe(4);
  });
});

describe('sense events and replay', () => {
  const drive = (sim: Sim): void => {
    for (let i = 0; i < 3; i++) {
      sim.scan(0, Dir.East);
      sim.canMove(0, Dir.East);
      sim.move(0, Dir.East);
      sim.pos(0);
    }
    sim.mark(0, 'end');
    sim.readMark(0);
  };

  test('replayTo(endTick) still deep-equals the live world', () => {
    const world = openWorld(8, 3, 1);
    const sim = new Sim(world);
    drive(sim);
    const trace = sim.finish();
    expect(replayTo(trace, trace.endTick)).toEqual(sim.world);
  });

  test('replay is identical with the keyframes stripped', () => {
    const world = openWorld(8, 3, 1);
    const sim = new Sim(world, { keyframeInterval: 1 });
    drive(sim);
    const trace = sim.finish();
    const stripped = { ...trace, keyframes: [] };
    for (let t = 0; t <= trace.endTick + 1; t++) {
      expect(replayTo(trace, t), `tick ${t}`).toEqual(replayTo(stripped, t));
    }
  });

  test('a trace carrying sense events replays the same as one without them', () => {
    const build = (withSenses: boolean): World => {
      const sim = new Sim(openWorld(8, 3, 1));
      for (let i = 0; i < 4; i++) {
        if (withSenses) {
          sim.scan(0, Dir.East);
          sim.pos(0);
          sim.canMove(0, Dir.East);
        }
        sim.move(0, Dir.East);
      }
      const trace = sim.finish();
      return replayTo(trace, trace.endTick);
    };
    const sensed = build(true);
    const blind = build(false);
    expect(sensed.bots).toEqual(blind.bots);
    expect(sensed.tick).toBe(blind.tick);
  });

  test('senseTotals(trace) matches the Sim ledger exactly', () => {
    const world = openWorld(8, 3, 1);
    const sim = new Sim(world);
    drive(sim);
    expect(senseTotals(sim.finish())).toEqual(sim.senseTotals());
  });
});

describe('trace size under heavy sensing', () => {
  test('identical consecutive reads fold into one event with a count', () => {
    const sim = new Sim(openWorld(4, 3, 1));
    for (let i = 0; i < 5000; i++) sim.pos(0);
    const senses = sensesIn(sim.finish().events);
    expect(senses).toHaveLength(1);
    expect(must(senses[0]).count).toBe(5000);
    expect(sim.senseTotals()).toEqual({ pos: 5000 });
  });

  test('a read that differs breaks the fold, so ordering survives', () => {
    const sim = new Sim(openWorld(4, 3, 1));
    sim.pos(0);
    sim.pos(0);
    sim.scan(0, Dir.East);
    sim.pos(0);
    expect(sensesIn(sim.finish().events).map((e) => [e.name, e.count])).toEqual([
      ['pos', 2],
      ['scan', 1],
      ['pos', 1],
    ]);
  });

  test('unfoldable reads stop being stored past the cap, but stay counted exactly', () => {
    const sim = new Sim(openWorld(64, 3, 1), { maxSenseEvents: 100 });
    const total = 5000;
    for (let i = 0; i < total; i++) sim.scan(0, i % 2 === 0 ? Dir.East : Dir.West);
    const trace = sim.finish();
    const senses = sensesIn(trace.events);

    expect(senses.length).toBeLessThanOrEqual(101);
    expect(senses.reduce((sum, e) => sum + e.count, 0)).toBe(total);
    expect(senseTotals(trace)).toEqual({ scan: total });
    expect(sim.senseTotals()).toEqual({ scan: total });
  });

  test('100k senses stay small and quick, and keep an exact count', () => {
    const started = Date.now();
    const sim = new Sim(openWorld(64, 3, 1));
    const total = 100_000;
    for (let i = 0; i < total; i++) {
      sim.scan(0, i % 2 === 0 ? Dir.East : Dir.West);
      sim.probe(0, `m${String(i % 3)}`);
    }
    const trace = sim.finish();
    const elapsed = Date.now() - started;

    expect(senseTotals(trace)).toEqual({ scan: total, probe: total });
    expect(trace.events.length).toBeLessThanOrEqual(MAX_SENSE_EVENTS + 16);
    expect(JSON.stringify(trace.events).length).toBeLessThan(4_000_000);
    expect(elapsed).toBeLessThan(5000);
    expect(replayTo(trace, trace.endTick).bots).toEqual(sim.world.bots);
  });
});

describe('information budget objectives', () => {
  function verdictFor(
    drive: (sim: Sim) => void,
    objectives = [Objectives.withinSenses('probe', 10)],
  ) {
    const world = openWorld(6, 3, 1);
    setTerrain(world, vec(5, 0), Terrain.Pad);
    addMachine(world, {
      id: 'lever',
      kind: 'lever',
      at: vec(3, 2),
      state: 'off',
      inventory: [],
      vars: {},
    });
    const initialWorld = cloneWorld(world);
    const sim = new Sim(world);
    drive(sim);
    const trace = sim.finish();
    return buildVerdict({
      objectives,
      world: sim.world,
      trace,
      initialWorld,
      ops: sim.ops,
      seeds: 1,
      senses: sim.senseTotals(),
    });
  }

  test('Verdict.stats.senses reports the per-command totals', () => {
    const verdict = verdictFor((sim) => {
      for (let i = 0; i < 4; i++) sim.probe(0, 'lever');
      sim.pos(0);
    });
    expect(verdict.stats.senses).toEqual({ probe: 4, pos: 1 });
  });

  test('buildVerdict recovers senses from the trace when none are supplied', () => {
    const world = openWorld(4, 2, 1);
    const initialWorld = cloneWorld(world);
    const sim = new Sim(world);
    for (let i = 0; i < 6; i++) sim.pos(0);
    const trace = sim.finish();
    const verdict = buildVerdict({
      objectives: [],
      world: sim.world,
      trace,
      initialWorld,
      ops: sim.ops,
      seeds: 1,
    });
    expect(verdict.stats.senses).toEqual({ pos: 6 });
  });

  test('withinSenses passes on budget and reports progress', () => {
    const verdict = verdictFor((sim) => {
      for (let i = 0; i < 7; i++) sim.probe(0, 'lever');
    });
    expect(verdict.objectives).toEqual([
      {
        id: 'within-10-probe',
        label: 'Use probe at most 10 times',
        met: true,
        progress: [7, 10],
      },
    ]);
  });

  test('withinSenses fails over budget and pins progress at the cap', () => {
    const verdict = verdictFor((sim) => {
      for (let i = 0; i < 11; i++) sim.probe(0, 'lever');
    });
    expect(must(verdict.objectives[0]).met).toBe(false);
    expect(must(verdict.objectives[0]).progress).toEqual([10, 10]);
    expect(verdict.passed).toBe(false);
  });

  test('withinSenses is met by a program that never senses at all', () => {
    const verdict = verdictFor((sim) => {
      sim.move(0, Dir.East);
    });
    expect(must(verdict.objectives[0]).met).toBe(true);
    expect(must(verdict.objectives[0]).progress).toEqual([0, 10]);
  });

  test('withinSenses only counts the command it names', () => {
    const verdict = verdictFor((sim) => {
      for (let i = 0; i < 40; i++) sim.scan(0, Dir.East);
      sim.probe(0, 'lever');
    });
    expect(must(verdict.objectives[0]).progress).toEqual([1, 10]);
    expect(must(verdict.objectives[0]).met).toBe(true);
  });

  test('withinSenses accepts an id and label override', () => {
    const objective = Objectives.withinSenses('scan', 4, {
      id: 'frugal',
      label: 'Map the cave on four readings',
    });
    expect([objective.id, objective.label]).toEqual(['frugal', 'Map the cave on four readings']);
  });

  test('withinOps counts every command, sensing included', () => {
    const verdict = verdictFor(
      (sim) => {
        for (let i = 0; i < 5; i++) sim.pos(0);
        sim.move(0, Dir.East);
      },
      [Objectives.withinOps(20), Objectives.withinOps(3)],
    );
    expect(must(verdict.objectives[0]).met).toBe(true);
    expect(must(verdict.objectives[0]).progress).toEqual([6, 20]);
    expect(must(verdict.objectives[1]).met).toBe(false);
    expect(verdict.stats.ops).toBe(6);
  });

  test('withinSenses reads the trace when the context carries no ledger', () => {
    const world = openWorld(4, 2, 1);
    const initialWorld = cloneWorld(world);
    const sim = new Sim(world);
    for (let i = 0; i < 3; i++) sim.pos(0);
    const ctx = { world: sim.world, trace: sim.finish(), initialWorld };
    const objective = Objectives.withinSenses('pos', 5);
    expect(objective.evaluate(ctx)).toBe(true);
    expect(objective.progress?.(ctx)).toEqual([3, 5]);
  });

  test('a ten-probe binary search fits the budget it is written against', () => {
    const world = openWorld(64, 3, 1);
    for (let x = 0; x < 64; x++) {
      addMachine(world, {
        id: `node-${String(x)}`,
        kind: 'node',
        at: vec(x, 2),
        state: x >= 41 ? 'off' : 'on',
        inventory: [],
        vars: {},
      });
    }
    const initialWorld = cloneWorld(world);
    const sim = new Sim(world);

    let low = 0;
    let high = 63;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (sim.probe(0, `node-${String(mid)}`)?.state === 'off') high = mid;
      else low = mid + 1;
    }

    const verdict = buildVerdict({
      objectives: [
        Objectives.withinSenses('probe', 10),
        Objectives.checkbox('found', 'Name the broken node', () => low === 41),
      ],
      world: sim.world,
      trace: sim.finish(),
      initialWorld,
      ops: sim.ops,
      seeds: 1,
      senses: sim.senseTotals(),
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.stats.senses).toEqual({ probe: 6 });
  });
});
