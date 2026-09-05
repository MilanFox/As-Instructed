import type { Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Read digits until a letter arrives, then repeat that letter. Driving the expansion straight
 * out of the parser costs nothing extra, and re-encoding the moves afterwards merges the groups
 * the wire split, which is where the shorter stream comes from.
 */
const HEADING: Record<string, Dir> = {
  N: Dir.North,
  E: Dir.East,
  S: Dir.South,
  W: Dir.West,
};

export const solution: ReferenceSolution = {
  levelId: 'w6-03',
  run(sim: Sim, botId: number): void {
    const { probe, receive, decode, move, transmit } = playerApi(sim, botId, 'w6-03');
    const key = probe('mast')?.vars['key'] ?? 0;
    const raw = receive();
    if (raw === null) return;

    const moves: string[] = [];
    let digits = '';
    for (const character of decode(raw, key)) {
      if (character >= '0' && character <= '9') {
        digits += character;
        continue;
      }
      for (let i = 0; i < Number(digits); i++) moves.push(character);
      digits = '';
    }

    for (const letter of moves) move(HEADING[letter] as Dir);

    let out = '';
    let run = 0;
    for (let i = 0; i < moves.length; i++) {
      run++;
      if (moves[i] !== moves[i + 1]) {
        out += `${String(run)}${String(moves[i])}`;
        run = 0;
      }
    }
    transmit(out);
  },
  source: [
    "const key = probe('mast').vars.key;",
    'const raw = receive();',
    'const moves = [];',
    "let digits = '';",
    'for (const ch of decode(raw, key)) {',
    "  if (ch >= '0' && ch <= '9') { digits += ch; continue; }",
    '  for (let i = 0; i < Number(digits); i++) moves.push(ch);',
    "  digits = '';",
    '}',
    'const heading = { N: Dir.North, E: Dir.East, S: Dir.South, W: Dir.West };',
    'for (const letter of moves) move(heading[letter]);',
    "let out = '';",
    'let run = 0;',
    'for (let i = 0; i < moves.length; i++) {',
    '  run++;',
    '  if (moves[i] !== moves[i + 1]) { out += `${run}${moves[i]}`; run = 0; }',
    '}',
    'transmit(out);',
  ].join('\n'),
};
