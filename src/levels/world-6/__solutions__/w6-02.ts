import type { Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from './_api.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Recompute both sums, relay what agrees, and name the altered byte in what does not. The bonus
 * falls out of the two differences: the plain one is the size of the change, the weighted one is
 * that change multiplied by its position.
 */
export const solution: ReferenceSolution = {
  levelId: 'w6-02',
  run(sim: Sim, botId: number): void {
    const { receive, transmit, probe, print } = playerApi(sim, botId, 'w6-02');
    const salt = probe('mast')?.vars['salt'] ?? 0;
    let index = 0;
    let packet = receive();
    while (packet !== null) {
      const star = packet.indexOf('*');
      const bytes = packet.slice(0, star).split(',').map(Number);
      const claimed = packet.slice(star + 1).split(',').map(Number);
      let sum = salt;
      let skew = salt;
      bytes.forEach((byte, i) => {
        sum += byte;
        skew += (i + 1) * byte;
      });
      sum %= 256;
      skew %= 256;
      if (sum === claimed[0] && skew === claimed[1]) {
        transmit(packet);
      } else {
        const plain = (sum - (claimed[0] ?? 0) + 256) % 256;
        const skewed = (skew - (claimed[1] ?? 0) + 256) % 256;
        for (let i = 0; i < bytes.length; i++) {
          if (((i + 1) * plain) % 256 === skewed) print(`bad ${String(index)} ${String(i)}`);
        }
      }
      index++;
      packet = receive();
    }
  },
  source: [
    "const salt = probe('mast')?.vars.salt ?? 0;",
    'let index = 0;',
    'let packet = receive();',
    'while (packet !== null) {',
    "  const star = packet.indexOf('*');",
    "  const bytes = packet.slice(0, star).split(',').map(Number);",
    "  const claimed = packet.slice(star + 1).split(',').map(Number);",
    '  let sum = salt;',
    '  let skew = salt;',
    '  bytes.forEach((byte, i) => {',
    '    sum += byte;',
    '    skew += (i + 1) * byte;',
    '  });',
    '  sum %= 256;',
    '  skew %= 256;',
    '  if (sum === claimed[0] && skew === claimed[1]) {',
    '    transmit(packet);',
    '  } else {',
    '    const plain = (sum - claimed[0] + 256) % 256;',
    '    const skewed = (skew - claimed[1] + 256) % 256;',
    '    for (let i = 0; i < bytes.length; i++) {',
    '      if (((i + 1) * plain) % 256 === skewed) print(`bad ${index} ${i}`);',
    '    }',
    '  }',
    '  index++;',
    '  packet = receive();',
    '}',
  ].join('\n'),
};
