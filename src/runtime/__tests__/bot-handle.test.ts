import { describe, expect, test } from 'vitest';
import type { Message, World } from '../../engine/index.ts';
import { Dir, Sim, addBot, createWorld, vec } from '../../engine/index.ts';
import { PLAYER_API, botHandleDeclaration, perBotApi } from '../api-spec.ts';
import { buildAmbientDts, unlockedApiNames } from '../ambient.ts';
import { buildPlayerScope } from '../api-bindings.ts';
import type { PlayerFunction } from '../api-bindings.ts';

const SWARM = unlockedApiNames('w7-02');

function site(bots = 3): { sim: Sim; world: World } {
  const world = createWorld({ w: 12, h: 6, seed: 1 });
  for (let i = 0; i < bots; i++) addBot(world, { at: vec(1, i + 1), facing: Dir.East });
  return { sim: new Sim(world), world };
}

function scopeFor(sim: Sim, hardware: readonly string[] = SWARM): Record<string, PlayerFunction> {
  return buildPlayerScope(sim, 0, hardware).api;
}

function handle(api: Record<string, PlayerFunction>, id: number): Record<string, PlayerFunction> {
  return (api['bot'] as PlayerFunction)(id) as Record<string, PlayerFunction>;
}

describe('the handle carries the fleet-safe half of the API', () => {
  test('every per-bot spec entry is a method, and the fleet-wide ones are not', () => {
    const { sim } = site();
    const api = scopeFor(sim);
    const members = Object.keys(handle(api, 0)).sort();

    expect(members).toEqual(
      perBotApi(PLAYER_API.functions.filter((fn) => SWARM.includes(fn.name)))
        .map((fn) => fn.name)
        .sort(),
    );
    for (const name of ['bot', 'bots', 'sync']) expect(members).not.toContain(name);
    for (const name of ['move', 'pos', 'wait', 'send', 'recv', 'scan', 'look', 'clock']) {
      expect(members, name).toContain(name);
    }
  });

  test('the same id gives back the same handle', () => {
    const { sim } = site();
    const api = scopeFor(sim);
    expect(handle(api, 1)).toBe(handle(api, 1));
    expect(handle(api, 1)).not.toBe(handle(api, 2));
  });

  test('hardware gates the handle exactly as it gates the free functions', () => {
    const { sim } = site();
    const early = handle(scopeFor(sim, unlockedApiNames('w7-01')), 0);
    const later = handle(scopeFor(sim, unlockedApiNames('w7-02')), 0);
    expect(Object.keys(early)).not.toContain('spawn');
    expect(Object.keys(later)).toContain('spawn');
  });

  test('the declaration the editor sees lists the same members the runtime binds', () => {
    const { sim } = site();
    for (const levelId of ['w7-01', 'w7-03', 'w8-05']) {
      const bound = Object.keys(handle(scopeFor(sim, unlockedApiNames(levelId)), 0)).sort();
      const declared = perBotApi(
        PLAYER_API.functions.filter((fn) => unlockedApiNames(levelId).includes(fn.name)),
      )
        .map((fn) => fn.name)
        .sort();
      expect(bound, levelId).toEqual(declared);
      expect(buildAmbientDts(unlockedApiNames(levelId)), levelId).toContain(
        botHandleDeclaration(
          perBotApi(
            PLAYER_API.functions.filter((fn) => unlockedApiNames(levelId).includes(fn.name)),
          ),
        ).split('\n')[0] as string,
      );
    }
  });

  test('no Bot interface exists before the fleet does', () => {
    expect(buildAmbientDts(unlockedApiNames('w6-05'))).not.toContain('interface Bot');
    expect(buildAmbientDts(unlockedApiNames('w7-01'))).toContain('interface Bot');
  });
});

describe('each handle drives its own bot on its own clock', () => {
  test('two bots issued back to back move in the same tick', () => {
    const { sim } = site(2);
    const api = scopeFor(sim);

    for (let i = 0; i < 4; i++) {
      handle(api, 0)['move']?.(Dir.East);
      handle(api, 1)['move']?.(Dir.East);
    }

    expect(handle(api, 0)['pos']?.()).toEqual({ x: 5, y: 1 });
    expect(handle(api, 1)['pos']?.()).toEqual({ x: 5, y: 2 });
    expect(sim.clock(0)).toBe(4);
    expect(sim.clock(1)).toBe(4);
    expect(sim.ticks).toBe(4);
  });

  test('work given to one bot does not advance the others', () => {
    const { sim } = site(3);
    const api = scopeFor(sim);

    handle(api, 2)['wait']?.(7);

    expect(sim.clock(0)).toBe(0);
    expect(sim.clock(1)).toBe(0);
    expect(sim.clock(2)).toBe(7);
    expect(handle(api, 2)['clock']?.()).toBe(7);
    expect(handle(api, 0)['clock']?.()).toBe(0);
  });

  test('sync lifts the whole fleet to the leader and reports the tick', () => {
    const { sim } = site(3);
    const api = scopeFor(sim);

    handle(api, 1)['wait']?.(5);
    expect(api['sync']?.()).toBe(5);

    for (const id of [0, 1, 2]) expect(handle(api, id)['clock']?.(), String(id)).toBe(5);
  });

  test('the bare functions still command the first bot on site', () => {
    const { sim } = site(2);
    const api = scopeFor(sim);

    api['move']?.(Dir.East);

    expect(api['pos']?.()).toEqual({ x: 2, y: 1 });
    expect(handle(api, 0)['pos']?.()).toEqual({ x: 2, y: 1 });
    expect(handle(api, 1)['pos']?.()).toEqual({ x: 1, y: 2 });
  });

  test('spawn from a handle costs the parent and returns a usable id', () => {
    const { sim } = site(1);
    const api = scopeFor(sim);

    const child = handle(api, 0)['spawn']?.(Dir.South) as number;

    expect(child).toBeGreaterThan(0);
    expect(api['bots']?.()).toEqual([0, child]);
    expect(handle(api, child)['pos']?.()).toEqual({ x: 1, y: 2 });
    expect(sim.clock(child)).toBe(sim.clock(0));
  });
});

describe('recv is causal, so the idiom is send then sync then recv', () => {
  test('a receiver behind in virtual time has an empty inbox', () => {
    const { sim } = site(2);
    const api = scopeFor(sim);

    handle(api, 0)['wait']?.(10);
    expect(handle(api, 0)['send']?.(1, 'go')).toBe(true);
    expect(handle(api, 1)['recv']?.()).toBeNull();

    api['sync']?.();
    const message = handle(api, 1)['recv']?.() as Message;
    expect(message.from).toBe(0);
    expect(message.body).toBe('go');
    expect(handle(api, 1)['recv']?.()).toBeNull();
  });

  test('a message sent from a bot that is already behind arrives without a sync', () => {
    const { sim } = site(2);
    const api = scopeFor(sim);

    handle(api, 1)['wait']?.(10);
    handle(api, 0)['send']?.(1, 42);

    expect((handle(api, 1)['recv']?.() as Message).body).toBe(42);
  });

  test('sending to a bot that is not there stops the run and names the id', () => {
    const { sim } = site(2);
    const api = scopeFor(sim);
    expect(() => handle(api, 0)['send']?.(99, 'go')).toThrow(/#99/);
  });

  test('a handle for an id that was never on site fails at the call, with the engine message', () => {
    const { sim } = site(2);
    const api = scopeFor(sim);
    expect(() => handle(api, 99)['pos']?.()).toThrow(/99/);
  });
});
