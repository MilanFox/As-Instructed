import type { LevelFact } from '../../levels/index.ts';

export interface FactTerm {
  term: string;
  fact: LevelFact;
}

export type LabelPart = string | { text: string; fact: LevelFact };

const ARTICLE = /^(?:the|a|an)\s+/i;
const WORD = /[\p{L}\p{N}_]/u;
const CODE_SPAN = /`[^`]*`/g;

export function factTerm(label: string): string {
  const bare = label.replace(/`/g, '').trim().replace(ARTICLE, '').trim();
  const singular = /[^s]s$/i.test(bare) && bare.length > 3 ? bare.slice(0, -1) : bare;
  return singular.toLowerCase();
}

// Longest first, so a label that holds a shorter term inside a longer one lights the longer.
export function factTerms(facts: readonly LevelFact[]): FactTerm[] {
  return facts
    .map((fact) => ({ term: factTerm(fact.label), fact }))
    .filter((entry) => entry.term !== '')
    .sort((a, b) => b.term.length - a.term.length);
}

function isWord(char: string | undefined): boolean {
  return char !== undefined && WORD.test(char);
}

function inIdentifier(before: string | undefined, after: string | undefined): boolean {
  return isWord(before) || before === '.' || isWord(after) || after === '(';
}

function suffixes(term: string): string[] {
  const last = term.at(-1) ?? '';
  const stem = term.endsWith('y') ? [`${term.slice(0, -1)}ies`, `${term.slice(0, -1)}ied`] : [];
  return [...stem, `${term}${last}ed`, `${term}es`, `${term}ed`, `${term}s`, `${term}d`, term];
}

export function splitByTerms(label: string, terms: readonly FactTerm[]): LabelPart[] {
  const lower = label.toLowerCase();
  const code = [...label.matchAll(CODE_SPAN)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const taken: { start: number; end: number; fact: LevelFact }[] = [];
  const clashes = (start: number, end: number): boolean =>
    [...code, ...taken].some((span) => start < span.end && end > span.start);
  for (const { term, fact } of terms) {
    const root = term.endsWith('y') ? term.slice(0, -1) : term;
    let from = 0;
    let found = false;
    while (!found) {
      const start = lower.indexOf(root, from);
      if (start < 0) break;
      from = start + 1;
      for (const form of suffixes(term)) {
        const end = start + form.length;
        if (lower.slice(start, end) !== form) continue;
        if (inIdentifier(lower[start - 1], lower[end])) continue;
        if (clashes(start, end)) break;
        taken.push({ start, end, fact });
        found = true;
        break;
      }
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const parts: LabelPart[] = [];
  let at = 0;
  for (const span of taken) {
    if (span.start > at) parts.push(label.slice(at, span.start));
    parts.push({ text: label.slice(span.start, span.end), fact: span.fact });
    at = span.end;
  }
  if (at < label.length) parts.push(label.slice(at));
  return parts;
}
