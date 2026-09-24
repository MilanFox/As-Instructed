import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { LEVELS } from '../../../levels/index.ts';

const dossier = readFileSync(new URL('../Dossier.tsx', import.meta.url), 'utf8');

describe('the board rows carry the same markup the levels write', () => {
  test('the dossier renders them through InlineMarkdown, as it does the facts', () => {
    const rows = dossier.match(/<span className="note">[\s\S]*?<\/span>/g) ?? [];
    const board = rows.filter((row) => row.includes('{item}') || row.includes('source={item}'));
    expect(board).toHaveLength(1);
    for (const row of board) expect(row).toContain('<InlineMarkdown source={item} />');
  });

  test('levels do write markup in those rows, so rendering them raw would leak it', () => {
    const marked = LEVELS.flatMap((level) =>
      (level.board?.redrawn ?? []).filter((row) => /[*`]/.test(row)),
    );
    expect(marked.length).toBeGreaterThan(0);
  });
});
