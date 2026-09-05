import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind, step } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { KEY_SPACE, KnownMap, drainAntenna, follow, readPacket } from '../shared.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Trust the plan, check every step of it, and re-plan only where it turns out to be wrong.
 *
 * The shift is recovered the World 6 way: ninety-five candidates, and the checksum says which one
 * landed. After that the run is driven literally — until a move the plan wants is into rock.
 * A group of moves says two things, where to walk and where you end up, and only the first has
 * stopped being true, so the recovery is a short local search for a way to the group's own
 * endpoint. Everywhere the plan still holds costs nothing extra.
 */

const SIZE = 30;
const HEADING: Record<string, Dir> = {
  N: Dir.North,
  E: Dir.East,
  S: Dir.South,
  W: Dir.West,
};

interface Run {
  count: number;
  dir: Dir;
}

function parseRuns(text: string): Run[] {
  const runs: Run[] = [];
  let digits = '';
  for (const character of text) {
    if (character >= '0' && character <= '9') {
      digits += character;
      continue;
    }
    const dir = HEADING[character];
    if (dir === undefined || digits === '') return [];
    runs.push({ count: Number(digits), dir });
    digits = '';
  }
  return digits === '' ? runs : [];
}

export const solution: ReferenceSolution = {
  levelId: 'w8-04',
  run(sim: Sim, botId: number): void {
    const map = new KnownMap({ w: SIZE, h: SIZE });
    const raw = drainAntenna(sim, botId);
    const shift = (text: string, cipherKey: number): string => {
      const by = ((-cipherKey % KEY_SPACE) + KEY_SPACE) % KEY_SPACE;
      let out = '';
      for (const character of text) {
        const code = character.charCodeAt(0);
        out +=
          code < 32 || code > 126
            ? character
            : String.fromCharCode(((code - 32 + by) % KEY_SPACE) + 32);
      }
      return out;
    };

    let bestKey = 0;
    let bestCount = -1;
    for (let candidate = 0; candidate < KEY_SPACE; candidate++) {
      let count = 0;
      for (const packet of raw) {
        if (readPacket(shift(packet, candidate)).valid) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestKey = candidate;
      }
    }

    const sections = new Map<number, Run[]>();
    for (const packet of raw) {
      const { fields, valid } = readPacket(shift(packet, bestKey));
      if (!valid || fields[0] !== 'SEC') continue;
      const index = Number(fields[1]);
      const runs = parseRuns(fields[2] ?? '');
      if (runs.length > 0) sections.set(index, runs);
    }

    const plan: Run[] = [];
    for (const index of [...sections.keys()].sort((a, b) => a - b)) {
      plan.push(...(sections.get(index) as Run[]));
    }

    map.observe(sim, botId, SIZE);

    /** Gets to `to` over what has been seen, buying more of the map when that is not enough. */
    const reach = (to: Vec): boolean => {
      for (let attempt = 0; attempt < 80; attempt++) {
        map.observe(sim, botId, SIZE);
        if (map.passable(to) && follow(sim, botId, map, to, { onStep: () => map.observe(sim, botId, SIZE) })) {
          return true;
        }
        // Not the nearest edge of the known map — the one that is nearest *and* pointed the
        // right way. A way round a fallen stretch is always beside it, never back up the tunnel.
        let outward: Dir[] | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        const from = sim.pos(botId);
        for (const view of map.where((candidate) => map.isFrontier(candidate.at))) {
          const path = map.pathTo(from, view.at);
          if (path === null) continue;
          const score =
            path.length + Math.abs(view.at.x - to.x) + Math.abs(view.at.y - to.y);
          if (score < bestScore) {
            bestScore = score;
            outward = path;
          }
        }
        if (outward === null || outward.length === 0) return false;
        for (const dir of outward) {
          if (!sim.canMove(botId, dir)) break;
          sim.move(botId, dir);
          map.observe(sim, botId, SIZE);
        }
      }
      return false;
    };

    for (const run of plan) {
      let planned = sim.pos(botId);
      for (let i = 0; i < run.count; i++) planned = step(planned, run.dir);
      let walked = 0;
      while (walked < run.count && sim.canMove(botId, run.dir)) {
        sim.move(botId, run.dir);
        map.observe(sim, botId, SIZE);
        walked++;
      }
      if (walked < run.count) reach(planned);
    }

    if (sim.inventory(botId, ItemKind.Chip) === 0) {
      const locker = map.where((view) => view.items.some((stack) => stack.kind === ItemKind.Chip));
      const at = locker[0]?.at;
      if (at) reach(at);
    }
    sim.pickup(botId, ItemKind.Chip);
  },
  source: [
    'const raw = [];',
    'for (let p = receive(); p !== null; p = receive()) raw.push(p);',
    'const sum = (t) => {',
    '  let n = 0;',
    '  for (const c of t) n += c.charCodeAt(0);',
    '  return n % 1000;',
    '};',
    'const holds = (t) => {',
    "  const parts = t.split('|');",
    '  if (parts.length < 3) return null;',
    "  const body = parts.slice(0, -1).join('|');",
    "  if (parts[0] !== 'KD4470') return null;",
    '  if (String(sum(body)) !== parts[parts.length - 1]) return null;',
    '  return parts.slice(1, -1);',
    '};',
    'let key = 0;',
    'let best = -1;',
    'for (let c = 0; c < 95; c++) {',
    '  const n = raw.filter((p) => holds(decode(p, c))).length;',
    '  if (n > best) { best = n; key = c; }',
    '}',
    'const heading = { N: Dir.North, E: Dir.East, S: Dir.South, W: Dir.West };',
    'const sections = new Map();',
    'for (const p of raw) {',
    '  const fields = holds(decode(p, key));',
    "  if (!fields || fields[0] !== 'SEC') continue;",
    '  const runs = [];',
    "  let digits = '';",
    '  for (const ch of fields[2]) {',
    "    if (ch >= '0' && ch <= '9') { digits += ch; continue; }",
    '    runs.push({ count: Number(digits), dir: heading[ch] });',
    "    digits = '';",
    '  }',
    '  sections.set(Number(fields[1]), runs);',
    '}',
    'const plan = [];',
    'for (const i of [...sections.keys()].sort((a, b) => a - b)) plan.push(...sections.get(i));',
    '',
    '// Everything seen so far, and nothing else.',
    'const seen = new Map();',
    'const k = (p) => `${p.x},${p.y}`;',
    'const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    'const shift = (p, d) => ({',
    '  x: p.x + (d === Dir.East ? 1 : d === Dir.West ? -1 : 0),',
    '  y: p.y + (d === Dir.South ? 1 : d === Dir.North ? -1 : 0),',
    '});',
    'const observe = () => {',
    '  seen.set(k(pos()), scan());',
    '  for (const d of dirs) for (const v of look(d, 30)) seen.set(k(v.at), v);',
    '};',
    'const path = (from, to) => {',
    '  const via = new Map([[k(from), null]]);',
    '  const q = [from];',
    '  for (let i = 0; i < q.length; i++) {',
    '    const at = q[i];',
    '    if (at.x === to.x && at.y === to.y) break;',
    '    for (const d of dirs) {',
    '      const n = shift(at, d);',
    '      if (via.has(k(n)) || !seen.get(k(n))?.walkable) continue;',
    '      via.set(k(n), { at, dir: d });',
    '      q.push(n);',
    '    }',
    '  }',
    '  if (!via.has(k(to))) return null;',
    '  const out = [];',
    '  let at = to;',
    '  while (!(at.x === from.x && at.y === from.y)) {',
    '    const back = via.get(k(at));',
    '    if (!back) return null;',
    '    out.push(back.dir);',
    '    at = back.at;',
    '  }',
    '  return out.reverse();',
    '};',
    'const frontier = (to) => {',
    '  let best = null;',
    '  let n = Infinity;',
    '  for (const [, v] of seen) {',
    '    if (!v.walkable) continue;',
    '    if (!dirs.some((d) => !seen.has(k(shift(v.at, d))))) continue;',
    '    const route = path(pos(), v.at);',
    '    if (!route) continue;',
    '    const score = route.length + Math.abs(v.at.x - to.x) + Math.abs(v.at.y - to.y);',
    '    if (score < n) { n = score; best = route; }',
    '  }',
    '  return best;',
    '};',
    'const reach = (to) => {',
    '  for (let attempt = 0; attempt < 80; attempt++) {',
    '    observe();',
    '    const route = path(pos(), to);',
    '    if (route) {',
    '      for (const d of route) { move(d); observe(); }',
    '      return true;',
    '    }',
    '    const outward = frontier(to);',
    '    if (!outward || outward.length === 0) return false;',
    '    for (const d of outward) { move(d); observe(); }',
    '  }',
    '  return false;',
    '};',
    'observe();',
    'for (const run of plan) {',
    '  let planned = pos();',
    '  for (let i = 0; i < run.count; i++) planned = shift(planned, run.dir);',
    '  let walked = 0;',
    '  while (walked < run.count && canMove(run.dir)) { move(run.dir); observe(); walked++; }',
    '  if (walked < run.count) reach(planned);',
    '}',
    'pickup(ItemKind.Chip);',
  ].join('\n'),
};
