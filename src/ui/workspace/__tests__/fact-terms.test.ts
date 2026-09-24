import { describe, expect, test } from 'vitest';
import { LEVELS } from '../../../levels/index.ts';
import { factTerm, factTerms, splitByTerms } from '../fact-terms.ts';

const fact = (label: string): { label: string; value: string } => ({ label, value: label });

describe('fact terms', () => {
  test('a label loses its backticks, its article and a plural s', () => {
    expect(factTerm('The crates')).toBe('crate');
    expect(factTerm('`scan(dir).mark`')).toBe('scan(dir).mark');
    expect(factTerm('A glass')).toBe('glass');
    expect(factTerm('Gas')).toBe('gas');
  });

  test('a term matches a whole word or its plural or -ed form, once', () => {
    const terms = factTerms([fact('Stencil'), fact('Reserve')]);
    expect(splitByTerms("Stencilled crates by the reserve's stencil", terms)).toEqual([
      { text: 'Stencilled', fact: fact('Stencil') },
      ' crates by the ',
      { text: 'reserve', fact: fact('Reserve') },
      "'s stencil",
    ]);
    expect(splitByTerms('Unstencilled', terms)).toEqual(['Unstencilled']);
    expect(splitByTerms('Stencilling reserves', terms)).toEqual([
      'Stencilling ',
      { text: 'reserves', fact: fact('Reserve') },
    ]);
    expect(splitByTerms('Batteries', factTerms([fact('Battery')]))).toEqual([
      { text: 'Batteries', fact: fact('Battery') },
    ]);
    expect(splitByTerms('Send S', factTerms([fact('`S`')]))).toEqual([
      'Send ',
      { text: 'S', fact: fact('`S`') },
    ]);
  });

  test('a term never lights inside code or an identifier', () => {
    const terms = factTerms([fact('Move'), fact('Use')]);
    expect(splitByTerms('Call `move` once; canMove stays', terms)).toEqual([
      'Call `move` once; canMove stays',
    ]);
    expect(splitByTerms('use() the moved crate', terms)).toEqual([
      'use() the ',
      { text: 'moved', fact: fact('Move') },
      ' crate',
    ]);
    expect(splitByTerms('crate.use is not a use', terms)).toEqual([
      'crate.use is not a ',
      { text: 'use', fact: fact('Use') },
    ]);
  });

  test('every fact label yields a term', () => {
    for (const level of LEVELS)
      for (const entry of level.facts ?? [])
        expect(factTerm(entry.label), `${level.id} ${entry.label}`).not.toBe('');
  });
});
