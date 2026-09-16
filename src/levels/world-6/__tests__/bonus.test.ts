import { describe, expect, test } from 'vitest';
import type { Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { KEYSPACE, decipher, postVar, queued } from '../signal.ts';
import { w6_01 } from '../w6-01.ts';
import { w6_02 } from '../w6-02.ts';
import { expand, shortestEncoding, w6_03 } from '../w6-03.ts';
import { MAGIC, w6_04 } from '../w6-04.ts';
import { w6_05 } from '../w6-05.ts';

function starOf(level: LevelDef, id: string, result: ReturnType<typeof runLevel>): boolean {
  const stars = evaluateObjectives(level.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: result.trace,
    ops: result.ops,
  });
  return must(
    stars.find((star) => star.id === id),
    id,
  ).met;
}

function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
    expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(level.par.ticks);
    expect(starOf(level, id, result), `seed ${String(seed)}`).toBe(true);
  }
}

const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, '.');
};

describe('w6-01 name-the-ping', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_01, 'name-the-ping');
  });

  test('the same run without its ping line keeps the log and loses the star on every seed', () => {
    const solution = SOLUTIONS[w6_01.id] as ReferenceSolution;
    for (const seed of w6_01.seeds) {
      const result = runReference(w6_01, seed, solution);
      const events = result.trace.events.filter(
        (event) => !(event.kind === 'print' && event.text.startsWith('ping ')),
      );
      const ctx = {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events },
        ops: result.ops,
      };
      const logged = evaluateObjectives(w6_01.objectives, ctx);
      const stars = evaluateObjectives(w6_01.bonus ?? [], ctx);
      expect(must(logged[0], 'the log').met, `seed ${String(seed)}`).toBe(true);
      expect(must(stars[0], 'the star').met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a run that names the wrong arrival number loses it on the seeds that carry a ping', () => {
    for (const seed of [1, 2]) {
      const band = queued(w6_01.build(seed));
      const result = runLevel(w6_01, seed, (sim, botId) => {
        const { receive, print } = playerApi(sim, botId, 'w6-01');
        for (let packet = receive(); packet !== null; packet = receive()) print(packet);
        print(`ping ${String(band.length)}`);
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(starOf(w6_01, 'name-the-ping', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w6-02 name-the-fault', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_02, 'name-the-fault');
  });

  test('the same run without its fault lines is refused on every seed, clean shifts too', () => {
    const solution = SOLUTIONS[w6_02.id] as ReferenceSolution;
    const met: Record<number, boolean> = {};
    for (const seed of w6_02.seeds) {
      const result = runReference(w6_02, seed, solution);
      const events = result.trace.events.filter(
        (event) => !(event.kind === 'print' && event.text.startsWith('bad ')),
      );
      const stars = evaluateObjectives(w6_02.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events },
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      met[seed] = must(stars[0], 'the star').met;
    }
    expect(met).toEqual({ 1: false, 2: false, 3: false, 4: false });
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_02.seeds) {
      const result = runLevel(w6_02, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_02, 'name-the-fault', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

const HEADING: Record<string, Dir> = {
  N: Dir.North,
  E: Dir.East,
  S: Dir.South,
  W: Dir.West,
};

function arrivedAt(seed: number): string {
  const world = w6_03.build(seed);
  return decipher(queued(world)[0] ?? '', postVar(world, 'key'));
}

function driveAndReturn(encode: (moves: string[]) => string) {
  return (sim: Sim, botId: number): void => {
    const { probe, receive, decode, move, transmit } = playerApi(sim, botId, 'w6-03');
    const key = probe('mast')?.vars.key ?? 0;
    const raw = receive();
    if (raw === null) return;
    const moves = expand(decode(raw, key));
    for (const letter of moves) move(must(HEADING[letter], letter));
    transmit(encode(moves));
  };
}

const oneMergeShort = (moves: string[]): string =>
  shortestEncoding(moves).replace(
    /(\d\d)([NESW])/,
    (_whole, count: string, letter: string) => `9${letter}${String(Number(count) - 9)}${letter}`,
  );

describe('w6-03 shorter-encoding', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_03, 'shorter-encoding');
  });

  test('the shortest encoding is 27 characters on every seed, and the packet arrives longer', () => {
    for (const seed of w6_03.seeds) {
      const arrived = arrivedAt(seed);
      expect(shortestEncoding(expand(arrived)).length, `seed ${String(seed)}`).toBe(27);
      expect(arrived.length, `seed ${String(seed)}`).toBeGreaterThan(27);
    }
  });

  test('a route driven and sent back uncompressed is refused on every seed', () => {
    for (const seed of w6_03.seeds) {
      const arrived = arrivedAt(seed);
      const result = runLevel(
        w6_03,
        seed,
        driveAndReturn(() => arrived),
      );
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(starOf(w6_03, 'shorter-encoding', result), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('an encoding shorter than the one that arrived, but one merge short, is refused', () => {
    for (const seed of w6_03.seeds) {
      const arrived = arrivedAt(seed);
      const moves = expand(arrived);
      const sent = oneMergeShort(moves);
      expect(sent.length, `seed ${String(seed)}`).toBeLessThan(arrived.length);
      expect(sent.length, `seed ${String(seed)}`).toBeGreaterThan(shortestEncoding(moves).length);
      expect(expand(sent).join(''), `seed ${String(seed)}`).toBe(moves.join(''));

      const result = runLevel(w6_03, seed, driveAndReturn(oneMergeShort));
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(starOf(w6_03, 'shorter-encoding', result), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_03.seeds) {
      const result = runLevel(w6_03, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_03, 'shorter-encoding', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w6-04 straggler', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_04, 'straggler');
  });

  test('a run that relays the headed packets and stops keeps the relay and loses the star', () => {
    for (const seed of w6_04.seeds) {
      const result = runLevel(w6_04, seed, (sim, botId) => {
        const { receive, transmit, decode } = playerApi(sim, botId, 'w6-04');
        const band: string[] = [];
        for (let packet = receive(); packet !== null; packet = receive()) band.push(packet);
        const headed = band.slice(0, -1);
        const first = headed[0] ?? '';
        let key = 0;
        for (let candidate = 0; candidate < KEYSPACE; candidate++) {
          if (decode(first, candidate).startsWith(MAGIC)) {
            key = candidate;
            break;
          }
        }
        for (const packet of headed) transmit(decode(packet, key));
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(starOf(w6_04, 'straggler', result), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_04.seeds) {
      const result = runLevel(w6_04, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_04, 'straggler', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w6-05 repair-blocks', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_05, 'repair-blocks');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_05.seeds) {
      const result = runLevel(w6_05, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_05, 'repair-blocks', result), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a run that drives the route and discards the corrupt copies loses it on every seed', () => {
    const solution = SOLUTIONS[w6_05.id] as ReferenceSolution;
    for (const seed of w6_05.seeds) {
      const result = runReference(w6_05, seed, solution);
      const events = result.trace.events.filter(
        (event) => !(event.kind === 'print' && event.text.startsWith('fix ')),
      );
      const stars = evaluateObjectives(w6_05.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events },
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(must(stars[0], 'the star').met, `seed ${String(seed)}`).toBe(false);
    }
  });
});
