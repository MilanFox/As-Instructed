import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Ninety-five candidates, one test. Take the first packet, try every shift, and keep the one
 * that puts the promised header at position 0; the rest of the band follows for free. The
 * straggler carries no header, so it is scored instead: of ninety-five readings, English is the
 * one that is mostly lowercase letters and spaces.
 */
const MAGIC = 'KD//';
const SPACE = 95;

export const solution: ReferenceSolution = {
  levelId: 'w6-04',
  run(sim: Sim, botId: number): void {
    const { receive, transmit, decode } = playerApi(sim, botId, 'w6-04');

    const band: string[] = [];
    for (let packet = receive(); packet !== null; packet = receive()) band.push(packet);
    if (band.length === 0) return;

    const headed = band.slice(0, -1);
    const tail = band[band.length - 1] as string;

    let key = 0;
    for (let candidate = 0; candidate < SPACE; candidate++) {
      if (decode(headed[0] as string, candidate).startsWith(MAGIC)) {
        key = candidate;
        break;
      }
    }
    for (const packet of headed) transmit(decode(packet, key));

    const score = (text: string): number => {
      let points = 0;
      for (const character of text) {
        if (character === ' ') points += 2;
        else if (character >= 'a' && character <= 'z') points += 3;
        else if (character >= '0' && character <= '9') points += 1;
        else points -= 2;
      }
      return points;
    };
    let best = tail;
    let bestScore = -Infinity;
    for (let candidate = 0; candidate < SPACE; candidate++) {
      const plain = decode(tail, candidate);
      const points = score(plain);
      if (points > bestScore) {
        bestScore = points;
        best = plain;
      }
    }
    transmit(best);
  },
  source: [
    'const band = [];',
    'for (let p = receive(); p !== null; p = receive()) band.push(p);',
    'const headed = band.slice(0, -1);',
    'const tail = band[band.length - 1];',
    'let key = 0;',
    'for (let c = 0; c < 95; c++) {',
    "  if (decode(headed[0], c).startsWith('KD//')) { key = c; break; }",
    '}',
    'for (const p of headed) transmit(decode(p, key));',
    'const score = (text) => {',
    '  let points = 0;',
    '  for (const ch of text) {',
    "    if (ch === ' ') points += 2;",
    "    else if (ch >= 'a' && ch <= 'z') points += 3;",
    "    else if (ch >= '0' && ch <= '9') points += 1;",
    '    else points -= 2;',
    '  }',
    '  return points;',
    '};',
    'let best = tail;',
    'let bestScore = -Infinity;',
    'for (let c = 0; c < 95; c++) {',
    '  const plain = decode(tail, c);',
    '  if (score(plain) > bestScore) { bestScore = score(plain); best = plain; }',
    '}',
    'transmit(best);',
  ].join('\n'),
};
