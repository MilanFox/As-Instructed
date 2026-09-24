import type { CostOverrides } from '../../engine/index.ts';
import type { ApiFunctionSpec } from '../../runtime/protocol.ts';
import { ApiCategory } from '../../runtime/index.ts';

export const CATEGORIES: { id: ApiCategory; label: string }[] = [
  { id: ApiCategory.Movement, label: 'Movement' },
  { id: ApiCategory.Sensing, label: 'Sensing' },
  { id: ApiCategory.Inventory, label: 'Inventory' },
  { id: ApiCategory.Terraforming, label: 'Mining and farming' },
  { id: ApiCategory.Machines, label: 'Machines' },
  { id: ApiCategory.Navigation, label: 'Marks' },
  { id: ApiCategory.Signal, label: 'Radio' },
  { id: ApiCategory.Swarm, label: 'Several bots' },
  { id: ApiCategory.Output, label: 'Output' },
];

export interface GuidePage {
  id: string;
  aliases: string[];
  title: string;
  body: string;
  example?: string;
  caption?: string;
  commands?: { name: string; line: string }[];
}

export const MEMORY: GuidePage = {
  id: 'memory',
  aliases: ['state', 'set', 'map', 'variables', 'remember'],
  title: 'Memory',
  body: [
    'Your program runs once, from top to bottom. It finishes before the replay starts.',
    '',
    'Variables, arrays, `Map` and `Set` **keep their values for the whole run**. Nothing is',
    'cleared between moves or ticks.',
    '',
    '- To remember something yourself: use normal JavaScript values.',
    '- To leave a note on a tile: use `mark` and `readMark`.',
    '  Writing a mark costs 1 tick.',
    '',
    'Each board is a separate run. Nothing carries over from one board to the next.',
  ].join('\n'),
  example: `const visited = new Set<string>();

function key(): string {
  const here = pos();
  return \`\${here.x},\${here.y}\`;
}

visited.add(key());
for (let step = 0; step < 20; step++) {
  if (move(Dir.East)) visited.add(key());
}
print(\`\${visited.size} different tiles\`);`,
  caption: 'The Set keeps every position added to it until the program ends.',
};

export const GUIDES: GuidePage[] = [
  {
    id: 'coordinates',
    aliases: ['coords', 'grid', 'position', 'vec', 'north'],
    title: 'Coordinates',
    body: [
      'A position is `{ x, y }`. Tile `(0, 0)` is the top-left (North-West) corner.',
      '',
      '- `Dir.North` moves to `y - 1`',
      '- `Dir.East` moves to `x + 1`',
      '- `Dir.South` moves to `y + 1`',
      '- `Dir.West` moves to `x - 1`',
      '',
      'Asking about a tile outside the grid is not an error. `scan` and `look` return',
      '`inBounds: false` and `terrain: "void"` for it.',
    ].join('\n'),
    example: `const here = pos();
const north = { x: here.x, y: here.y - 1 };
print(\`\${here.x},\${here.y} -> \${north.x},\${north.y}\`);`,
  },
  {
    id: 'ticks',
    aliases: ['par', 'ticks and par', 'score', 'medal', 'clock', 'cost'],
    title: 'Ticks and par',
    body: [
      'Sensing is free. Actions cost ticks. Your score is the number of ticks the run takes.',
      '',
      'A failed action costs the same. A `move` into a wall still costs 1 tick.',
      '',
      'Par is the tick target for the level:',
      '',
      '- Gold: at or under par.',
      '- Silver: at most par × 1.25, or par + 1, whichever is more.',
      '- Bronze: all objectives met.',
      '',
      'The level card shows par as **For gold**, and a hard stop as **Tick limit**.',
    ].join('\n'),
    commands: [
      {
        name: 'bots',
        line: '\nEach bot has its own clock. Your score is the highest clock of all bots.',
      },
    ],
  },
  {
    id: 'readings',
    aliases: ['reading', 'sensing', 'sense', 'senses', 'allowance', 'survey', 'beam', 'compare'],
    title: 'Senses',
    body: [
      'Senses cost no ticks. One call is one reading, whatever it returns.',
      '',
      'Some levels limit readings. The level rules then say how many and which calls count.',
      '',
      'What each sense you have returns:',
    ].join('\n'),
    commands: [
      { name: 'pos', line: '- `pos()`: your position.' },
      {
        name: 'canMove',
        line: '- `canMove(dir)`: true if a move to the next tile would work now.',
      },
      { name: 'scan', line: '- `scan(dir?)`: one tile, yours or the next one in `dir`.' },
      {
        name: 'look',
        line: '- `look(dir, range?)`: a line of tiles in `dir`, up to the first tile that blocks the view.',
      },
      { name: 'readMark', line: '- `readMark()`: the mark on your tile, or null.' },
      {
        name: 'probe',
        line: '- `probe(id?)`: one machine: on your tile, on the tile you face, or any machine by id.',
      },
      { name: 'inventory', line: '- `inventory(kind?)`: how many items you hold.' },
      { name: 'carrying', line: '- `carrying()`: which kinds of item you hold.' },
      { name: 'fuel', line: '- `fuel()`: the fuel you have left.' },
      { name: 'clock', line: "- `clock()`: this bot's clock, in ticks." },
    ],
  },
  {
    id: 'output',
    aliases: ['console', 'console.log', 'log', 'debug', 'print'],
    title: 'Printing and debugging',
    body: [
      '`print(text)` writes one line to the output log. It is free. In the replay, the line',
      'appears at the tick it was written.',
      '',
      '`console.log` does the same thing and works in every level.',
      '',
      'The log has a size limit. Extra lines are dropped, and the log says how many.',
    ].join('\n'),
    example: `print('starting');
console.log('same log, same tick');`,
  },
];

export function levelCost(fn: ApiFunctionSpec, costs: CostOverrides | undefined): number | string {
  if (typeof fn.cost !== 'number') return fn.cost;
  return costs?.[fn.name as keyof CostOverrides] ?? fn.cost;
}

export function costLabel(cost: number | string): string {
  if (cost === 0) return 'free';
  if (typeof cost === 'number') return `${cost} tick${cost === 1 ? '' : 's'}`;
  return `${cost} ticks`;
}

export interface TypePart {
  text: string;
  type: string | null;
}

export function typeParts(text: string, names: readonly string[]): TypePart[] {
  if (names.length === 0) return [{ text, type: null }];
  const pattern = new RegExp(`\\b(?:${names.join('|')})\\b`, 'g');
  const parts: TypePart[] = [];
  let last = 0;
  for (let hit = pattern.exec(text); hit !== null; hit = pattern.exec(text)) {
    if (hit.index > last) parts.push({ text: text.slice(last, hit.index), type: null });
    parts.push({ text: hit[0], type: hit[0] });
    last = hit.index + hit[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), type: null });
  return parts;
}

export function matches(haystack: string, needle: string): boolean {
  return needle === '' || haystack.includes(needle);
}
