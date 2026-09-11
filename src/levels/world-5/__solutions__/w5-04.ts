import type { MachineView, Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

export const solution: ReferenceSolution = {
  levelId: 'w5-04',
  run(sim: Sim, botId: number): void {
    const { probe, link } = playerApi(sim, botId, 'w5-04');

    const readAll = (prefix: string): MachineView[] => {
      const out: MachineView[] = [];
      for (let i = 1; ; i++) {
        const machine = probe(`${prefix}-${String(i)}`);
        if (machine === null) break;
        out.push(machine);
      }
      return out;
    };

    const feeders = readAll('feeder');
    const consumers = readAll('consumer');

    let spare = feeders[0] as MachineView;
    for (const feeder of feeders) {
      if ((feeder.vars['capacity'] ?? 0) > (spare.vars['capacity'] ?? 0)) spare = feeder;
    }

    const bins = feeders
      .filter((feeder) => feeder.id !== spare.id)
      .map((feeder) => ({ id: feeder.id, room: feeder.vars['capacity'] ?? 0 }));
    bins.push({ id: spare.id, room: spare.vars['capacity'] ?? 0 });

    const order = consumers.slice().sort((a, b) => (b.vars['draw'] ?? 0) - (a.vars['draw'] ?? 0));

    for (const consumer of order) {
      const draw = consumer.vars['draw'] ?? 0;
      const bin = bins.find((candidate) => candidate.room >= draw);
      if (!bin) continue;
      bin.room -= draw;
      link(bin.id, consumer.id);
    }
  },
  source: [
    'const all = (p) => {',
    '  const o = [];',
    '  for (let m; (m = probe(`${p}-${o.length + 1}`)); ) o.push(m);',
    '  return o;',
    '};',
    "const feeds = all('feeder');",
    "const draws = all('consumer');",
    'let big = feeds[0];',
    'for (const f of feeds) if (f.vars.capacity > big.vars.capacity) big = f;',
    'const rank = (f) => (f.id === big.id ? 1 : 0);',
    'const bins = feeds',
    '  .sort((a, b) => rank(a) - rank(b))',
    '  .map((f) => ({ id: f.id, room: f.vars.capacity }));',
    'for (const c of draws.sort((a, b) => b.vars.draw - a.vars.draw)) {',
    '  const bin = bins.find((b) => b.room >= c.vars.draw);',
    '  if (bin) {',
    '    bin.room -= c.vars.draw;',
    '    link(bin.id, c.id);',
    '  }',
    '}',
  ].join('\n'),
};
