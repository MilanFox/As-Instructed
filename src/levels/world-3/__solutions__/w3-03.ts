import type { ItemKind, Sim, TileView, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key } from './driver.ts';

const ORDER: ItemKind[] = ['crate', 'part', 'chip', 'cell', 'ore', 'stone', 'scrap', 'ice'];

/**
 * TEST FIXTURE. Never imported from src/main.tsx.
 *
 * Walk the two aisles once and read the racks sideways. The bot never stands on a bay and never
 * touches a crate; the whole count is paid for in free scans, and the only ticks spent are the
 * ones that carry the bot past each rack and on to the terminal.
 */
export const solution: ReferenceSolution = {
  levelId: 'w3-03',
  run(sim: Sim, botId: number): void {
    const counts = new Map<ItemKind, number>();
    const seen = new Set<string>();
    const terminal: Vec[] = [];

    const note = (tile: TileView): void => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.machineId) terminal.push(tile.at);
      for (const stack of tile.items) {
        counts.set(stack.kind, (counts.get(stack.kind) ?? 0) + stack.count);
      }
    };
    const read = (): void => {
      note(sim.scan(botId));
      note(sim.scan(botId, Dir.West));
      note(sim.scan(botId, Dir.East));
    };

    read();
    do {
      sim.move(botId, Dir.South);
      read();
    } while (sim.scan(botId).terrain !== 'pad');

    sim.move(botId, Dir.East);
    read();
    sim.move(botId, Dir.East);
    read();

    do {
      sim.move(botId, Dir.North);
      read();
    } while (sim.scan(botId).terrain !== 'pad');

    for (const kind of ORDER) {
      const total = counts.get(kind) ?? 0;
      if (total > 0) sim.print(botId, `${kind} ${total}`);
    }

    const at = terminal[0];
    if (at) goTo(sim, botId, at);
    sim.use(botId);
  },
  source: [
    "const ORDER: ItemKind[] = ['crate', 'part', 'chip', 'cell', 'ore', 'stone', 'scrap', 'ice'];",
    '',
    'const counts = new Map<ItemKind, number>();',
    'const seen = new Set<string>();',
    'const terminal: Vec[] = [];',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    '  if (tile.machineId) terminal.push(tile.at);',
    '  for (const stack of tile.items) {',
    '    counts.set(stack.kind, (counts.get(stack.kind) ?? 0) + stack.count);',
    '  }',
    '}',
    '',
    'function read(): void {',
    '  note(scan());',
    '  note(scan(Dir.West));',
    '  note(scan(Dir.East));',
    '}',
    '',
    'function goTo(target: Vec): void {',
    '  while (pos().x !== target.x) move(pos().x < target.x ? Dir.East : Dir.West);',
    '  while (pos().y !== target.y) move(pos().y < target.y ? Dir.South : Dir.North);',
    '}',
    '',
    'read();',
    'do {',
    '  move(Dir.South);',
    '  read();',
    "} while (scan().terrain !== 'pad');",
    '',
    'move(Dir.East);',
    'read();',
    'move(Dir.East);',
    'read();',
    '',
    'do {',
    '  move(Dir.North);',
    '  read();',
    "} while (scan().terrain !== 'pad');",
    '',
    'for (const kind of ORDER) {',
    '  const total = counts.get(kind) ?? 0;',
    '  if (total > 0) print(`${kind} ${total}`);',
    '}',
    '',
    'if (terminal[0]) goTo(terminal[0]);',
    'use();',
  ].join('\n'),
};
