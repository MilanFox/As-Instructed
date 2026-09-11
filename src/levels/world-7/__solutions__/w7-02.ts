import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir, vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import type { Clocks } from './fleet.ts';
import { spend, walkTo } from './fleet.ts';

const WIDTH = 24;

function columnsOf(crops: readonly Vec[]): Vec[][] {
  const byX = new Map<number, Vec[]>();
  for (const crop of crops) {
    const bucket = byX.get(crop.x);
    if (bucket) bucket.push(crop);
    else byX.set(crop.x, [crop]);
  }
  return [...byX.keys()]
    .sort((a, b) => a - b)
    .map((x) => (byX.get(x) as Vec[]).slice().sort((a, b) => a.y - b.y));
}

function shareOut(columns: Vec[][], fleet: number): Vec[][][] {
  const shares: Vec[][][] = Array.from({ length: fleet }, () => []);
  let remaining = columns.reduce((sum, column) => sum + column.length, 0);
  let held = 0;
  let bot = 0;
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i] as Vec[];
    const columnsLeft = columns.length - i;
    const botsLeft = fleet - bot;
    const fairShare = Math.ceil((held + remaining) / botsLeft);
    const crowded = columnsLeft <= botsLeft - 1;
    if (bot < fleet - 1 && held > 0 && (crowded || held >= fairShare)) {
      bot++;
      held = 0;
    }
    (shares[bot] as Vec[][]).push(column);
    held += column.length;
    remaining -= column.length;
  }
  return shares;
}

export const solution: ReferenceSolution = {
  levelId: 'w7-02',
  run(sim: Sim, botId: number): void {
    const depot = sim.probe(botId, 'depot');
    if (!depot) return;
    const fleet = depot.vars['requisition'] ?? 1;
    const total = depot.vars['crops'] ?? 0;
    const crops: Vec[] = [];
    for (let i = 0; i < total; i++) {
      const packed = depot.vars[`c${i}`] ?? 0;
      crops.push(vec(packed % WIDTH, Math.floor(packed / WIDTH)));
    }

    const clocks: Clocks = { [botId]: 0 };
    const ids = [botId];
    let parent = botId;
    while (ids.length < fleet) {
      const child = sim.spawn(parent, Dir.East);
      spend(clocks, parent, 2);
      if (child < 0) break;
      clocks[child] = clocks[parent] as number;
      ids.push(child);
      parent = child;
    }

    const shares = shareOut(columnsOf(crops), ids.length);
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j] as number;
      const columns = shares[j] as Vec[][];
      columns.forEach((column, k) => {
        const route = k % 2 === 0 ? column : column.slice().reverse();
        for (const crop of route) {
          walkTo(sim, clocks, id, crop);
          sim.harvest(id);
          spend(clocks, id, 2);
        }
      });
    }
  },
  source: [
    'const depot = probe("depot");',
    'const crops = [];',
    'for (let i = 0; i < depot.vars.crops; i++) {',
    '  const p = depot.vars["c" + i];',
    '  crops.push({ x: p % 24, y: Math.floor(p / 24) });',
    '}',
    '',
    'const ids = [0];',
    'while (ids.length < depot.vars.requisition) {',
    '  const child = bot(ids[ids.length - 1]).spawn(Dir.East);',
    '  if (child < 0) break;',
    '  ids.push(child);',
    '}',
    '',
    'const byX = new Map();',
    'for (const c of crops) {',
    '  if (!byX.has(c.x)) byX.set(c.x, []);',
    '  byX.get(c.x).push(c);',
    '}',
    'const columns = [...byX.keys()].sort((a, b) => a - b).map((x) => byX.get(x).sort((a, b) => a.y - b.y));',
    '',
    'const shares = ids.map(() => []);',
    'let remaining = crops.length;',
    'let held = 0;',
    'let owner = 0;',
    'for (let i = 0; i < columns.length; i++) {',
    '  const botsLeft = ids.length - owner;',
    '  const fair = Math.ceil((held + remaining) / botsLeft);',
    '  const crowded = columns.length - i <= botsLeft - 1;',
    '  if (owner < ids.length - 1 && held > 0 && (crowded || held >= fair)) {',
    '    owner++;',
    '    held = 0;',
    '  }',
    '  shares[owner].push(columns[i]);',
    '  held += columns[i].length;',
    '  remaining -= columns[i].length;',
    '}',
    '',
    'function walkTo(id, target) {',
    '  while (bot(id).pos().x !== target.x || bot(id).pos().y !== target.y) {',
    '    const p = bot(id).pos();',
    '    const dirs = [];',
    '    if (target.y > p.y) dirs.push(Dir.South);',
    '    else if (target.y < p.y) dirs.push(Dir.North);',
    '    if (target.x > p.x) dirs.push(Dir.East);',
    '    else if (target.x < p.x) dirs.push(Dir.West);',
    '    const open = dirs.find((d) => bot(id).canMove(d));',
    '    if (open === undefined) bot(id).wait(1);',
    '    else bot(id).move(open);',
    '  }',
    '}',
    '',
    'ids.forEach((id, j) => {',
    '  shares[j].forEach((column, k) => {',
    '    for (const crop of k % 2 === 0 ? column : column.slice().reverse()) {',
    '      walkTo(id, crop);',
    '      bot(id).harvest();',
    '    }',
    '  });',
    '});',
  ].join('\n'),
};
