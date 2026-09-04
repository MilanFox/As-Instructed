import type { ItemKind, Sim, Vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key, surveyYard } from './driver.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx.
 *
 * Survey the whole yard once, building a class -> depot table out of the stencils, then run the
 * crates in the order they were found. Ordering the round by proximity instead is what the bonus
 * is for; this reference deliberately does not, so par leaves that improvement on the table.
 */
export const solution: ReferenceSolution = {
  levelId: 'w3-02',
  run(sim: Sim, botId: number): void {
    const depots = new Map<string, Vec>();
    const crates: { at: Vec; kind: ItemKind }[] = [];
    const seen = new Set<string>();

    surveyYard(sim, botId, (tile) => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.mark) depots.set(tile.mark, tile.at);
      for (const stack of tile.items) {
        for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });
      }
    });

    for (const crate of crates) {
      const depot = depots.get(crate.kind);
      if (!depot) continue;
      goTo(sim, botId, crate.at);
      sim.pickup(botId, crate.kind, 1);
      goTo(sim, botId, depot);
      sim.drop(botId, crate.kind, 1);
    }
  },
  source: [
    'const depots = new Map<string, Vec>();',
    'const crates: { at: Vec; kind: ItemKind }[] = [];',
    'const seen = new Set<string>();',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    '  if (tile.mark) depots.set(tile.mark, tile.at);',
    '  for (const stack of tile.items) {',
    '    for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });',
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
    'for (const crate of crates) {',
    '  const depot = depots.get(crate.kind);',
    '  if (!depot) continue;',
    '  goTo(crate.at);',
    '  pickup(crate.kind);',
    '  goTo(depot);',
    '  drop(crate.kind);',
    '}',
  ].join('\n'),
};
