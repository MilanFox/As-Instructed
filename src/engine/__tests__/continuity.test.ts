import { describe, expect, test } from 'vitest';

import { BROKEN, LIVE, settleContinuity } from '../continuity.ts';
import { Sim } from '../sim.ts';
import { replayTo } from '../trace.ts';
import { Dir, FED_BY, MachineKind } from '../types.ts';
import type { Machine, World } from '../types.ts';
import { addBot, addMachine, createWorld, machineById, vec } from '../world.ts';

const CHAIN = 6;

function chain(broken: number, carries = true): World {
  const world = createWorld({ w: CHAIN + 2, h: 3, seed: 1 });
  addMachine(world, {
    id: 'source',
    kind: MachineKind.Source,
    at: vec(1, 2),
    state: 'on',
    inventory: [],
    vars: {},
  });
  for (let index = 0; index < CHAIN; index++) {
    addMachine(world, {
      id: `link-${String(index)}`,
      kind: MachineKind.Node,
      at: vec(index + 1, 1),
      state: index === broken ? BROKEN : 'open',
      inventory: [],
      vars: {
        ...(carries ? { [LIVE]: 1 } : {}),
        ...(index > 0 ? { [`${FED_BY}link-${String(index - 1)}`]: 1 } : {}),
      },
    });
  }
  addBot(world, { at: vec(1, 2), facing: Dir.East, name: 'RIG' });
  settleContinuity(world);
  return world;
}

const readings = (world: World): (number | undefined)[] =>
  world.machines.filter((m) => m.id.startsWith('link-')).map((m) => m.vars[LIVE]);

describe('continuity along a declared feed', () => {
  test('stops at the broken machine and stays down for everything it feeds', () => {
    expect(readings(chain(3))).toEqual([1, 1, 1, 0, 0, 0]);
    expect(readings(chain(0))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(readings(chain(CHAIN))).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test('is only computed for machines that publish a reading', () => {
    expect(readings(chain(3, false))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('a feeder that publishes nothing makes no claim on what it feeds', () => {
    const world = chain(CHAIN);
    const head = machineById(world, 'link-0') as Machine;
    head.vars[`${FED_BY}source`] = 1;
    head.state = BROKEN;
    settleContinuity(world);
    expect(readings(world)).toEqual([0, 0, 0, 0, 0, 0]);
    head.state = 'open';
    settleContinuity(world);
    expect(readings(world)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test('a loop carries nothing', () => {
    const world = chain(CHAIN);
    (machineById(world, 'link-0') as Machine).vars[`${FED_BY}link-5`] = 1;
    settleContinuity(world);
    expect(readings(world)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('the sim relights the run when the break is moved out of broken', () => {
    const world = chain(3);
    const sim = new Sim(world);
    const botId = world.bots[0]?.id ?? 0;
    expect(sim.probe(botId, 'link-5')?.vars[LIVE]).toBe(0);
    sim.power(botId, 'link-3', 'patched');
    expect(sim.probe(botId, 'link-5')?.vars[LIVE]).toBe(1);
  });

  test('the sim leaves the run dark when something else is powered', () => {
    const world = chain(3);
    const sim = new Sim(world);
    const botId = world.bots[0]?.id ?? 0;
    sim.power(botId, 'link-4', 'patched');
    expect(sim.probe(botId, 'link-5')?.vars[LIVE]).toBe(0);
    expect(sim.probe(botId, 'link-2')?.vars[LIVE]).toBe(1);
  });

  test('a replay of the trace reads the same as the live run', () => {
    const world = chain(3);
    const sim = new Sim(world);
    const botId = world.bots[0]?.id ?? 0;
    sim.power(botId, 'link-3', 'patched');
    const trace = sim.finish();
    expect(readings(sim.world)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(readings(replayTo(trace, trace.endTick))).toEqual(readings(sim.world));
  });
});
