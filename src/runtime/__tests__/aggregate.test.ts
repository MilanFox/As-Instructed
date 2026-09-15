import { describe, expect, test } from 'vitest';
import type { Trace, Verdict } from '../../engine/index.ts';
import { FailureCode } from '../../engine/index.ts';
import { aggregate } from '../aggregate.ts';
import { traceShape } from '../protocol.ts';
import type { SeedRun } from '../run-level.ts';

function seedRun(options: {
  seed: number;
  passed: boolean;
  ticks?: number;
  ops?: number;
  spend?: Record<string, number>;
  message?: string;
}): SeedRun {
  const { seed, passed } = options;
  const trace = { endTick: options.ticks ?? 10, events: [], keyframes: [] } as unknown as Trace;

  const verdict: Verdict = {
    passed,
    objectives: [{ id: 'reach-pad', label: `seed ${seed}`, met: passed }],
    stats: {
      ticks: options.ticks ?? 10,
      ops: options.ops ?? 5,
      seeds: 1,
      spend: options.spend ?? {},
      senses: {},
    },
  };
  if (!passed) {
    verdict.failure = {
      code: FailureCode.ObjectivesUnmet,
      message: options.message ?? 'Contract not fulfilled.',
    };
  }

  const result = {
    seed,
    passed,
    ticks: verdict.stats.ticks,
    ops: verdict.stats.ops,
    objectives: verdict.objectives,
    shape: traceShape(trace),
  };

  return { result, trace, verdict };
}

describe('aggregate', () => {
  test('all seeds passing is a pass, scored by the worst seed', () => {
    const response = aggregate([
      seedRun({ seed: 1, passed: true, ticks: 12, ops: 30 }),
      seedRun({ seed: 2, passed: true, ticks: 19, ops: 44 }),
      seedRun({ seed: 3, passed: true, ticks: 15, ops: 31 }),
    ]);

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.verdict.passed).toBe(true);
    expect(response.verdict.stats.ticks).toBe(19);
    expect(response.verdict.stats.ops).toBe(44);
    expect(response.verdict.stats.seeds).toBe(3);
    expect(response.verdict.failure).toBeUndefined();
    expect(response.traceSeed).toBe(1);
    expect(response.failedSeed).toBeUndefined();
  });

  test("seed 3 of 5 failing reports that seed, and hands back that seed's trace", () => {
    const runs = [
      seedRun({ seed: 11, passed: true, ticks: 12 }),
      seedRun({ seed: 22, passed: true, ticks: 13 }),
      seedRun({ seed: 33, passed: false, ticks: 99, message: 'The bot never reached the pad.' }),
      seedRun({ seed: 44, passed: false, ticks: 14 }),
      seedRun({ seed: 55, passed: true, ticks: 15 }),
    ];
    const response = aggregate(runs);

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.verdict.passed).toBe(false);
    expect(response.failedSeed).toBe(33);
    expect(response.traceSeed).toBe(33);
    expect(response.trace).toBe(runs[2]?.trace);
    expect(response.trace).not.toBe(runs[0]?.trace);
    expect(response.verdict.failure?.message).toContain('Seed 3 of 5 (seed 33) failed.');
    expect(response.verdict.failure?.message).toContain('The bot never reached the pad.');
    expect(response.verdict.objectives[0]?.label).toBe('seed 33');
  });

  test('per-seed results are all reported, in seed order', () => {
    const response = aggregate([
      seedRun({ seed: 1, passed: true }),
      seedRun({ seed: 2, passed: false }),
      seedRun({ seed: 3, passed: true }),
    ]);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.results.map((r) => [r.seed, r.passed])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });

  test('a single seed is not given a seed prefix it does not need', () => {
    const response = aggregate([seedRun({ seed: 7, passed: false, message: 'Nope.' })]);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.verdict.failure?.message).toBe('Nope.');
    expect(response.traceSeed).toBe(7);
  });

  test('a failure on the first seed is still reported as seed 1', () => {
    const response = aggregate([
      seedRun({ seed: 5, passed: false, message: 'Nope.' }),
      seedRun({ seed: 6, passed: true }),
    ]);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.failedSeed).toBe(5);
    expect(response.verdict.failure?.message).toContain('Seed 1 of 2 (seed 5) failed.');
  });

  test('spend is merged worst-case per resource', () => {
    const response = aggregate([
      seedRun({ seed: 1, passed: true, spend: { cable: 12, cell: 1 } }),
      seedRun({ seed: 2, passed: true, spend: { cable: 20 } }),
    ]);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.verdict.stats.spend).toEqual({ cable: 20, cell: 1 });
  });

  test('a passing run that still carries a failure keeps it unprefixed', () => {
    const run = seedRun({ seed: 1, passed: true });
    run.verdict.failure = { code: FailureCode.BotLost, message: 'A bot was lost.' };
    const response = aggregate([run]);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.verdict.failure?.message).toBe('A bot was lost.');
  });

  test('no seeds at all is an error, not a silent pass', () => {
    const response = aggregate([]);
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.message).toContain('no seeds');
  });
});
