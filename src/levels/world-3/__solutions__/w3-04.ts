import type { Sim, Vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key, surveyYard } from './driver.ts';

export const solution: ReferenceSolution = {
  levelId: 'w3-04',
  run(sim: Sim, botId: number): void {
    const slots = new Map<number, Vec>();
    const seen = new Set<string>();
    const bay: Vec[] = [];

    surveyYard(sim, botId, (tile) => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.terrain === 'pad') bay.push(tile.at);
      const index = tile.mark === null ? Number.NaN : Number(tile.mark);
      if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {
        slots.set(index, tile.at);
      }
    });

    const target = bay[0];
    if (!target) return;
    for (const index of [...slots.keys()].sort((a, b) => a - b)) {
      const slot = slots.get(index);
      if (!slot) continue;
      goTo(sim, botId, slot);
      sim.pickup(botId, 'crate', 1);
      goTo(sim, botId, target);
      sim.drop(botId, 'crate', 1);
    }
  },
  source: [
    'const slots = new Map<number, Vec>();',
    'const seen = new Set<string>();',
    'const bay: Vec[] = [];',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    "  if (tile.terrain === 'pad') bay.push(tile.at);",
    '  const index = tile.mark === null ? Number.NaN : Number(tile.mark);',
    "  if (Number.isInteger(index) && tile.items.some((stack) => stack.kind === 'crate')) {",
    '    slots.set(index, tile.at);',
    '  }',
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
    'for (const index of [...slots.keys()].sort((a, b) => a - b)) {',
    '  goTo(slots.get(index));',
    "  pickup('crate');",
    '  goTo(bay[0]);',
    "  drop('crate');",
    '}',
  ].join('\n'),
};
