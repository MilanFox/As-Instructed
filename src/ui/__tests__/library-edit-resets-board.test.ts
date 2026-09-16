import { afterEach, expect, test } from 'vitest';
import type { Trace } from '../../engine/index.ts';
import { useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/store.ts';
import type { RuntimeRunner } from '../adapters.ts';
import { mountLibrary } from '../library.ts';

const stubRunner = {
  prepare(): void {},
  ready: () => new Promise<never>(() => undefined),
  simulation: { run: () => Promise.reject(new Error('no worker')) },
} as unknown as RuntimeRunner;

const trace = { events: [], endTick: 12, initial: null } as unknown as Trace;

let detach: (() => void) | null = null;

afterEach(() => {
  detach?.();
  detach = null;
});

test('an edit to lib.ts clears the board so the next play re-runs', () => {
  detach = mountLibrary(stubRunner);
  useGame.setState({ trace, endTick: 12, tick: 5 });

  useLibrary.getState().setSource('export function reach(): void {}\n');

  expect(useGame.getState().trace).toBeNull();
  expect(useGame.getState().endTick).toBe(0);
});

test('a library change that leaves the source alone keeps the board', () => {
  detach = mountLibrary(stubRunner);
  useGame.setState({ trace, endTick: 12, tick: 5 });

  useLibrary.setState({ panelOpen: true });

  expect(useGame.getState().trace).toBe(trace);
});
