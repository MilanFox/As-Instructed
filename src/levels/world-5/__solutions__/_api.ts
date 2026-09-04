import type { Dir, MachineView, Sim, TileView, Vec } from '../../../engine/index.ts';
import { unlockedApiNames } from '../../../runtime/ambient.ts';
import { buildPlayerScope } from '../../../runtime/api-bindings.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * The exact surface a player has at `levelId`, bound to a live `Sim`.
 *
 * Reference solutions drive this rather than `Sim` directly for two reasons. `link`, `receive`,
 * `transmit` and `decode` have no `Sim` method — they are RUNTIME compositions over
 * `applyMachineChange` / `applyTileChange` — so a solution that called `Sim` would be testing
 * something the player cannot write. And `unlockedApiNames` throws the level's own hardware gate
 * across the fixture: a solution that reaches for a verb the level has not unlocked fails loudly
 * here instead of shipping as an unsolvable level.
 */
export interface PlayerApi {
  move(dir: Dir): boolean;
  pos(): Vec;
  print(text: string): void;
  canMove(dir: Dir): boolean;
  wait(n?: number): void;
  scan(dir?: Dir): TileView;
  use(dir?: Dir): boolean;
  look(dir: Dir, range?: number): TileView[];
  probe(machineId?: string): MachineView | null;
  power(machineId: string, state: string): boolean;
  link(fromId: string, toId: string): boolean;
  receive(): string | null;
  transmit(text: string): boolean;
  decode(text: string, key: number): string;
}

export function playerApi(sim: Sim, botId: number, levelId: string): PlayerApi {
  const { api } = buildPlayerScope(sim, botId, unlockedApiNames(levelId));

  function call<T>(name: string, args: readonly unknown[]): T {
    const fn = api[name];
    if (!fn) {
      throw new Error(
        `Reference solution for ${levelId} called "${name}", which that level has not unlocked.`,
      );
    }
    return fn(...args) as T;
  }

  return {
    move: (dir) => call<boolean>('move', [dir]),
    pos: () => call<Vec>('pos', []),
    print: (text) => call<void>('print', [text]),
    canMove: (dir) => call<boolean>('canMove', [dir]),
    wait: (n) => call<void>('wait', [n]),
    scan: (dir) => call<TileView>('scan', [dir]),
    use: (dir) => call<boolean>('use', [dir]),
    look: (dir, range) => call<TileView[]>('look', [dir, range]),
    probe: (machineId) => call<MachineView | null>('probe', [machineId]),
    power: (machineId, state) => call<boolean>('power', [machineId, state]),
    link: (fromId, toId) => call<boolean>('link', [fromId, toId]),
    receive: () => call<string | null>('receive', []),
    transmit: (text) => call<boolean>('transmit', [text]),
    decode: (text, key) => call<string>('decode', [text, key]),
  };
}
