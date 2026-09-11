import type { Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

const HEADING: Record<string, Dir> = {
  N: Dir.North,
  E: Dir.East,
  S: Dir.South,
  W: Dir.West,
};

export const solution: ReferenceSolution = {
  levelId: 'w6-05',
  run(sim: Sim, botId: number): void {
    const { probe, receive, decode, move, print } = playerApi(sim, botId, 'w6-05');
    const salt = probe('mast')?.vars['salt'] ?? 0;

    const sums = (text: string): [number, number] => {
      let plain = salt;
      let skew = salt;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        plain += code;
        skew += (i + 1) * code;
      }
      return [plain % 256, skew % 256];
    };
    const split = (packet: string): { body: string; claimed: number[] } => {
      const star = packet.lastIndexOf('*');
      return {
        body: packet.slice(0, star),
        claimed: packet
          .slice(star + 1)
          .split(',')
          .map(Number),
      };
    };
    const sound = (packet: string): boolean => {
      const { body, claimed } = split(packet);
      const [plain, skew] = sums(body);
      return plain === claimed[0] && skew === claimed[1];
    };

    const band: string[] = [];
    for (let packet = receive(); packet !== null; packet = receive()) band.push(packet);

    const blocks = new Map<string, string>();
    for (const packet of band) {
      let settled: string | null = sound(packet) ? packet : null;
      for (let key = 1; key < 95 && settled === null; key++) {
        const candidate = decode(packet, key);
        if (sound(candidate)) settled = candidate;
      }
      if (settled !== null) {
        const { body } = split(settled);
        const bar = body.indexOf('|');
        blocks.set(body.slice(0, bar), body.slice(bar + 1));
        continue;
      }
      const { body, claimed } = split(packet);
      const [plain, skew] = sums(body);
      const drift = (plain - (claimed[0] ?? 0) + 256) % 256;
      const skewed = (skew - (claimed[1] ?? 0) + 256) % 256;
      for (let i = 0; i < body.length; i++) {
        if (((i + 1) * drift) % 256 !== skewed) continue;
        const fixed = (body.charCodeAt(i) - drift + 256) % 256;
        print(`fix ${body.slice(0, i)}${String.fromCharCode(fixed)}${body.slice(i + 1)}`);
        break;
      }
    }

    const moves: string[] = [];
    const run = (name: string, depth: number): void => {
      if (depth > 8) return;
      const body = blocks.get(name);
      if (body === undefined) return;
      for (const entry of body.split(',')) {
        const star = entry.indexOf('*');
        if (star >= 0) {
          const times = Number(entry.slice(star + 1));
          for (let i = 0; i < times; i++) run(entry.slice(0, star), depth + 1);
          continue;
        }
        const letter = entry[entry.length - 1] as string;
        const count = Number(entry.slice(0, -1));
        for (let i = 0; i < count; i++) moves.push(letter);
      }
    };
    run('main', 0);

    for (const letter of moves) move(HEADING[letter] as Dir);
  },
  source: [
    "const salt = probe('mast').vars.salt;",
    'const sums = (text) => {',
    '  let plain = salt;',
    '  let skew = salt;',
    '  for (let i = 0; i < text.length; i++) {',
    '    plain += text.charCodeAt(i);',
    '    skew += (i + 1) * text.charCodeAt(i);',
    '  }',
    '  return [plain % 256, skew % 256];',
    '};',
    'const split = (p) => {',
    "  const star = p.lastIndexOf('*');",
    "  return { body: p.slice(0, star), claimed: p.slice(star + 1).split(',').map(Number) };",
    '};',
    'const sound = (p) => {',
    '  const { body, claimed } = split(p);',
    '  const [plain, skew] = sums(body);',
    '  return plain === claimed[0] && skew === claimed[1];',
    '};',
    'const band = [];',
    'for (let p = receive(); p !== null; p = receive()) band.push(p);',
    'const blocks = new Map();',
    'for (const packet of band) {',
    '  let settled = sound(packet) ? packet : null;',
    '  for (let key = 1; key < 95 && settled === null; key++) {',
    '    const candidate = decode(packet, key);',
    '    if (sound(candidate)) settled = candidate;',
    '  }',
    '  if (settled !== null) {',
    '    const { body } = split(settled);',
    "    const bar = body.indexOf('|');",
    '    blocks.set(body.slice(0, bar), body.slice(bar + 1));',
    '    continue;',
    '  }',
    '  const { body, claimed } = split(packet);',
    '  const [plain, skew] = sums(body);',
    '  const drift = (plain - claimed[0] + 256) % 256;',
    '  const skewed = (skew - claimed[1] + 256) % 256;',
    '  for (let i = 0; i < body.length; i++) {',
    '    if (((i + 1) * drift) % 256 !== skewed) continue;',
    '    const fixed = (body.charCodeAt(i) - drift + 256) % 256;',
    '    print(`fix ${body.slice(0, i)}${String.fromCharCode(fixed)}${body.slice(i + 1)}`);',
    '    break;',
    '  }',
    '}',
    'const moves = [];',
    'const heading = { N: Dir.North, E: Dir.East, S: Dir.South, W: Dir.West };',
    'const run = (name, depth) => {',
    '  if (depth > 8) return;',
    '  const body = blocks.get(name);',
    '  if (body === undefined) return;',
    "  for (const entry of body.split(',')) {",
    "    const star = entry.indexOf('*');",
    '    if (star >= 0) {',
    '      const times = Number(entry.slice(star + 1));',
    '      for (let i = 0; i < times; i++) run(entry.slice(0, star), depth + 1);',
    '      continue;',
    '    }',
    '    const count = Number(entry.slice(0, -1));',
    '    for (let i = 0; i < count; i++) moves.push(entry[entry.length - 1]);',
    '  }',
    '};',
    "run('main', 0);",
    'for (const letter of moves) move(heading[letter]);',
  ].join('\n'),
};
