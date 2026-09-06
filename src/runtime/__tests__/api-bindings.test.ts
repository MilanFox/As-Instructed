import { describe, expect, test } from 'vitest';
import type { World } from '../../engine/index.ts';
import {
  IllegalActionError,
  Sim,
  addBot,
  addMachine,
  createWorld,
  setTile,
  tileAt,
  vec,
} from '../../engine/index.ts';
import { PLAYER_API } from '../api-spec.ts';
import { assertApiComplete, buildPlayerScope, implementedApiNames } from '../api-bindings.ts';

/**
 * The four commands `Sim` deliberately leaves open — `link`, `receive`, `transmit`, `decode`.
 *
 * `api-spec.ts` hands World 5 and 6 semantics to RUNTIME to define on top of the engine's
 * extension points, so these tests are the contract CONTENT authors levels against. Everything
 * they touch goes through `applyMachineChange` / `applyTileChange`, which is what keeps a run and
 * its replay in agreement.
 */

const ANTENNA = vec(3, 1);

function listeningPost(packets: string[] = [], state = 'on'): { sim: Sim; world: World } {
  const world = createWorld({ w: 8, h: 4, seed: 1 });
  addBot(world, { at: vec(3, 2) });
  addMachine(world, {
    id: 'ant-1',
    kind: 'antenna',
    at: ANTENNA,
    state,
    inventory: [],
    vars: {},
  });
  setTile(world, ANTENNA, {
    terrain: 'floor',
    ...(packets.length > 0 ? { meta: { rx: packets.join('\n') } } : {}),
  });
  return { sim: new Sim(world), world };
}

function api(sim: Sim, names: string[]) {
  return buildPlayerScope(sim, 0, names).api;
}

describe('the spec and the bindings cannot drift', () => {
  test('assertApiComplete passes, and would name anything missing', () => {
    expect(() => assertApiComplete()).not.toThrow();
    expect(implementedApiNames().length).toBeGreaterThanOrEqual(PLAYER_API.functions.length);
  });

  test('a name that is not in the spec is ignored rather than bound', () => {
    const { sim } = listeningPost();
    expect(Object.keys(buildPlayerScope(sim, 0, ['move', 'teleport']).api)).toEqual(['move']);
  });

  test('the scope holds exactly the unlocked functions', () => {
    const { sim } = listeningPost();
    const scope = buildPlayerScope(sim, 0, ['move', 'pos']);
    expect(Object.keys(scope.api).sort()).toEqual(['move', 'pos']);
    expect(Object.keys(scope.values).sort()).toEqual(['Dir', 'console']);
  });

  test('ambient values follow the unlocked types, not the whole engine', () => {
    const { sim } = listeningPost();
    expect(Object.keys(buildPlayerScope(sim, 0, ['harvest']).values).sort()).toEqual([
      'ItemKind',
      'console',
    ]);
  });
});

describe('receive', () => {
  test('drains the antenna queue in order, then returns null', () => {
    const { sim } = listeningPost(['alpha', 'beta']);
    const { receive } = api(sim, ['receive']);
    expect(receive?.()).toBe('alpha');
    expect(receive?.()).toBe('beta');
    expect(receive?.()).toBeNull();
  });

  test('costs no ticks but is recorded, so a replay sees the same packets', () => {
    const { sim } = listeningPost(['alpha']);
    const { receive } = api(sim, ['receive']);
    receive?.();
    expect(sim.ticks).toBe(0);
    expect(sim.ops).toBeGreaterThan(0);
    expect(sim.finish().events.some((event) => event.kind === 'tileChange')).toBe(true);
  });

  test('an empty post returns null rather than throwing', () => {
    const { sim } = listeningPost();
    expect(api(sim, ['receive']).receive?.()).toBeNull();
  });
});

describe('transmit', () => {
  test('accepts a payload, records it on the antenna, and charges the tick', () => {
    const { sim, world } = listeningPost();
    const { transmit } = api(sim, ['transmit']);
    expect(transmit?.('ping')).toBe(true);
    expect(transmit?.('pong')).toBe(true);
    expect(tileAt(world, ANTENNA)?.meta?.['tx']).toBe('ping\npong');
    expect(world.machines[0]?.vars['sent']).toBe(2);
    expect(sim.ticks).toBe(2);
  });

  test('an antenna that is off rejects the payload and still charges', () => {
    const { sim, world } = listeningPost([], 'off');
    expect(api(sim, ['transmit']).transmit?.('ping')).toBe(false);
    expect(tileAt(world, ANTENNA)?.meta?.['tx']).toBeUndefined();
    expect(sim.ticks).toBe(1);
  });

  test('an off antenna is a state, so the same call succeeds once it is powered', () => {
    const { sim } = listeningPost([], 'off');
    const { transmit, power } = api(sim, ['transmit', 'power']);
    expect(transmit?.('ping')).toBe(false);
    power?.('ant-1', 'on');
    expect(transmit?.('ping')).toBe(true);
  });

  test('a work order with no antenna stops the run instead, and still charges', () => {
    const world = createWorld({ w: 4, h: 4, seed: 1 });
    addBot(world, { at: vec(1, 1) });
    const sim = new Sim(world);
    let message = '';
    try {
      api(sim, ['transmit']).transmit?.('ping');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('no antenna');
    expect(message).toContain('Drop the call');
    expect(sim.ticks).toBe(1);
  });
});

describe('decode', () => {
  test('is its own inverse over the printable range for a matching key', () => {
    const world = createWorld({ w: 4, h: 4, seed: 1 });
    addBot(world, { at: vec(1, 1) });
    const sim = new Sim(world);
    const { decode } = api(sim, ['decode']);

    const shifted = 'Kzz'; /* arbitrary ciphertext; the round trip is what matters */
    const plain = decode?.(shifted, 7) as string;
    expect(typeof plain).toBe('string');
    expect(decode?.(plain, -7)).toBe(shifted);
  });

  test('is free in ticks but not free in instructions, so it cannot loop forever', () => {
    const world = createWorld({ w: 4, h: 4, seed: 1 });
    addBot(world, { at: vec(1, 1) });
    const sim = new Sim(world, { maxOps: 5 });
    const { decode } = api(sim, ['decode']);
    expect(() => {
      for (let i = 0; i < 100; i++) decode?.('x', 1);
    }).toThrow();
    expect(sim.ticks).toBe(0);
  });
});

describe('link', () => {
  function grid(): { sim: Sim; world: World } {
    const world = createWorld({ w: 10, h: 6, seed: 1 });
    addBot(world, { at: vec(1, 1) });
    for (const [id, at] of [
      ['node-1', vec(2, 1)],
      ['node-2', vec(6, 4)],
    ] as const) {
      addMachine(world, { id, kind: 'node', at, state: 'off', inventory: [], vars: {} });
    }
    return { sim: new Sim(world), world };
  }

  test('records the connection and reports the cable spent (DESIGN.md §11 A5)', () => {
    const { sim, world } = grid();
    expect(api(sim, ['link']).link?.('node-1', 'node-2')).toBe(true);
    expect(world.machines[0]?.vars['link:node-2']).toBe(1);
    expect(sim.spendTotals()).toEqual({ cable: 7 });
    expect(sim.ticks).toBe(2);
  });

  test('an unknown machine stops the run, and still costs the full price', () => {
    const { sim } = grid();
    expect(() => api(sim, ['link']).link?.('node-1', 'node-9')).toThrow(IllegalActionError);
    expect(sim.spendTotals()).toEqual({});
    expect(sim.ticks).toBe(2);
  });

  test('the refusal names the id that was wrong, not the pair', () => {
    const { sim } = grid();
    let message = '';
    try {
      api(sim, ['link']).link?.('node-9', 'node-2');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('link("node-9", "node-2")');
    expect(message).toContain('the id "node-9"');
    expect(message).toContain('probe("node-9")');
  });
});
