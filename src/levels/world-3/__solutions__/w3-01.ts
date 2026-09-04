import type { Sim, Vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key, surveyYard } from './driver.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Survey the shed once, then run one crate per trip. The clamp holds one item, so the trips
 * cannot be merged; the only thing worth getting right is not asking a full bot to pick up.
 */
export const solution: ReferenceSolution = {
  levelId: 'w3-01',
  run(sim: Sim, botId: number): void {
    const crates: Vec[] = [];
    const pads: Vec[] = [];
    const seen = new Set<string>();

    surveyYard(sim, botId, (tile) => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.items.some((stack) => stack.kind === 'crate')) crates.push(tile.at);
      if (tile.terrain === 'pad') pads.push(tile.at);
    });

    for (let i = 0; i < crates.length; i++) {
      const crate = crates[i];
      const pad = pads[i];
      if (!crate || !pad) break;
      goTo(sim, botId, crate);
      sim.pickup(botId, 'crate', 1);
      goTo(sim, botId, pad);
      sim.drop(botId, 'crate', 1);
    }
  },
  source: [
    'const crates: Vec[] = [];',
    'const pads: Vec[] = [];',
    'const seen = new Set<string>();',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    "  if (tile.items.some((stack) => stack.kind === 'crate')) crates.push(tile.at);",
    "  if (tile.terrain === 'pad') pads.push(tile.at);",
    '}',
    '',
    'function read(): void {',
    '  note(scan());',
    '  note(scan(Dir.North));',
    '  note(scan(Dir.South));',
    '}',
    '',
    'function goTo(target: Vec): void {',
    '  while (pos().x !== target.x) move(pos().x < target.x ? Dir.East : Dir.West);',
    '  while (pos().y !== target.y) move(pos().y < target.y ? Dir.South : Dir.North);',
    '}',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    'let along = Dir.East;',
    'for (;;) {',
    '  read();',
    '  while (canMove(along)) {',
    '    move(along);',
    '    read();',
    '  }',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (canMove(Dir.South)) move(Dir.South);',
    '  along = along === Dir.East ? Dir.West : Dir.East;',
    '}',
    '',
    'for (let i = 0; i < crates.length; i++) {',
    '  goTo(crates[i]);',
    "  pickup('crate');",
    '  goTo(pads[i]);',
    "  drop('crate');",
    '}',
  ].join('\n'),
};
