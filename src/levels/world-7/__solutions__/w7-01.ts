import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

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
