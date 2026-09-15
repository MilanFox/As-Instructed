import type { CostOverrides } from '../../engine/index.ts';
import type { ApiFunctionSpec } from '../../runtime/protocol.ts';
import { ApiCategory } from '../../runtime/index.ts';

export const CATEGORIES: { id: ApiCategory; label: string }[] = [
  { id: ApiCategory.Movement, label: 'Movement' },
  { id: ApiCategory.Sensing, label: 'Sensing' },
  { id: ApiCategory.Inventory, label: 'Inventory' },
  { id: ApiCategory.Terraforming, label: 'Terraforming' },
  { id: ApiCategory.Machines, label: 'Machines' },
  { id: ApiCategory.Navigation, label: 'Navigation' },
  { id: ApiCategory.Signal, label: 'Signal' },
  { id: ApiCategory.Swarm, label: 'Swarm' },
  { id: ApiCategory.Output, label: 'Output' },
];

export interface GuidePage {
  id: string;
  aliases: string[];
  title: string;
  body: string;
  example?: string;
  caption?: string;
}

export const MEMORY: GuidePage = {
  id: 'memory',
  aliases: ['state', 'set', 'map', 'variables', 'remember'],
  title: 'Memory',
  body: [
    'Your program runs once, from the first line to the last, and it finishes before a single',
    'frame of the replay is drawn. Everything it declares is still there the whole way through.',
    '',
    'Objects, arrays, `Map`, `Set`, closures and module-level variables **persist for the entire',
    'run**. Nothing is cleared between moves, between ticks, or between API calls. A `Set` you',
    'fill on the way out is still full on the way back.',
    '',
    '`mark` and `readMark` are not how a program remembers things. They write a string onto a',
    'tile — into the world — so that a later pass, or a different bot, can read it back. That is',
    'the only job they have, and they cost a tick to write.',
    '',
    '- State your own program needs: ordinary JavaScript values.',
    '- State that must live in the world, or be visible to another bot: `mark` and `readMark`.',
    '',
    'Each seed is a separate run. Values do not carry across from one seed to the next; every run',
    'starts from your source exactly as written.',
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
print(\`\${visited.size} distinct tiles\`);`,
  caption:
    'The Set is declared once and holds every coordinate added to it until the program ends.',
};

export const GUIDES: GuidePage[] = [
  {
    id: 'coordinates',
    aliases: ['coords', 'grid', 'position', 'vec', 'north'],
    title: 'Coordinates',
    body: [
      'A position is `{ x, y }`. `x` grows East. `y` grows South. North is `y - 1`.',
      '',
      'Tile `(0, 0)` is the North-West corner of the site. `pos()` hands back a fresh object, so',
      'writing to it changes nothing.',
      '',
      '- `Dir.North` moves to `y - 1`',
      '- `Dir.East` moves to `x + 1`',
      '- `Dir.South` moves to `y + 1`',
      '- `Dir.West` moves to `x - 1`',
      '',
      'Tiles outside the grid are not an error. `scan` and `look` return a view with',
      '`inBounds: false` and `terrain: "void"`, so the same check works at the edge and in the',
      'middle.',
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
      'Sensing is free. Acting costs ticks.',
      '',
      "Every bot carries its own clock. An action advances that bot's clock by the action's cost.",
      'The score for a work order is `max(bot.clock)` across every living bot, so with one bot the',
      'score is simply that bot’s clock.',
      '',
      'A failed action still costs. A `move` into a wall spends its full tick and the bot ends up',
      'facing the wall.',
      '',
      'Par is the tick budget for the order. Medals come straight off it:',
      '',
      '- Gold: ticks at or under par.',
      '- Silver: up to a quarter over par, and never less than one tick of room.',
      '- Bronze: every objective met.',
    ].join('\n'),
  },
  {
    id: 'output',
    aliases: ['console', 'console.log', 'log', 'debug', 'print'],
    title: 'Printing and debugging',
    body: [
      '`print(text)` writes one line to the OUTPUT log under the program. It is free and it is',
      'recorded in the trace, so the line reappears at the exact tick it was written when you',
      'scrub the replay.',
      '',
      '`console.log` is bound to the same function. It accepts the same argument, writes the same',
      'trace event, and works on every work order — including the ones issued before `print` is',
      'installed. Use whichever you prefer.',
      '',
      'The log is capped. A program that prints inside a tight loop will have the overflow',
      'suppressed rather than freezing the page, and the log says how many lines it dropped.',
    ].join('\n'),
    example: `print('starting');
console.log('same channel, same tick');`,
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
