import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Both walks are issued back to back, which already runs them in the same ticks. The single
 * sync() lands after every move, so the fleet pays max(len) + 1 rather than len1 + len2 + 1.
 *
 * The idle report is read off the clocks either side of that sync(): the only standing still this
 * program does is the catch-up the short corridor's bot is dragged through, so the difference the
 * sync() opens up is the whole of each bot's idle time.
 */
export const solution: ReferenceSolution = {
  levelId: 'w7-01',
  run(sim: Sim): void {
    const ids = sim.botIds();
    for (const id of ids) {
      while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
    }
    for (const id of ids) {
      const other = ids[(ids.indexOf(id) + 1) % ids.length] as number;
      sim.send(id, other, id);
    }
    const before = ids.map((id) => sim.clock(id));
    const aligned = sim.sync();
    for (const id of ids) sim.recv(id);
    ids.forEach((id, i) => {
      sim.print(id, `idle ${String(id)} ${String(aligned - (before[i] as number))}`);
    });
  },
  source: [
    'const ids = bots();',
    'for (const id of ids) {',
    '  while (bot(id).canMove(Dir.East)) bot(id).move(Dir.East);',
    '}',
    'for (const id of ids) {',
    '  const other = ids[(ids.indexOf(id) + 1) % ids.length];',
    '  bot(id).send(other, id);',
    '}',
    'const before = ids.map((id) => bot(id).clock());',
    'const aligned = sync();',
    'for (const id of ids) bot(id).recv();',
    'ids.forEach((id, i) => {',
    '  bot(id).print("idle " + id + " " + (aligned - before[i]));',
    '});',
  ].join('\n'),
};
