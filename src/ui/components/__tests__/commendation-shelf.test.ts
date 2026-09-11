import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../../game/achievements.ts';
import { CommendationShelf, earnedOn } from '../CommendationShelf.tsx';

interface Node {
  props?: { className?: unknown; children?: unknown };
}

function walk(node: unknown, seen: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, seen);
    return seen;
  }
  if (typeof node !== 'object' || node === null) return seen;
  const element = node as Node;
  seen.push(element);
  walk(element.props?.children, seen);
  return seen;
}

function texts(tree: ReactElement, className: string): string[] {
  return walk(tree)
    .filter((node) => node.props?.className === className)
    .map((node) => String(node.props?.children ?? ''));
}

const listed = ACHIEVEMENTS.filter((achievement) => achievement.hidden !== true);
const hidden = ACHIEVEMENTS.filter((achievement) => achievement.hidden === true);

describe('the commendation shelf', () => {
  it('shows every aspirational commendation to a player who has earned nothing', () => {
    const shown = texts(CommendationShelf({ achievements: {} }), 'commend__title');
    expect(shown).toEqual(listed.map((achievement) => achievement.title));
  });

  it('keeps a retrospective one off the shelf until it fires', () => {
    const first = hidden[0];
    expect(first).toBeDefined();
    const before = texts(CommendationShelf({ achievements: {} }), 'commend__title');
    const after = texts(
      CommendationShelf({ achievements: { [(first as { id: string }).id]: 1 } }),
      'commend__title',
    );

    expect(before).not.toContain((first as { title: string }).title);
    expect(after).toContain((first as { title: string }).title);
  });

  it('renders the whole list at once without dropping any of it', () => {
    const everything = Object.fromEntries(
      ACHIEVEMENTS.map((achievement) => [achievement.id, 1_699_000_000_000]),
    );
    const tree = CommendationShelf({ achievements: everything });

    expect(texts(tree, 'commend__title')).toEqual(
      ACHIEVEMENTS.map((achievement) => achievement.title),
    );
    expect(texts(tree, 'commend__note')).toEqual(ACHIEVEMENTS.map((a) => a.note));
    expect(texts(tree, 'commend__when numeric')).toHaveLength(ACHIEVEMENTS.length);
  });

  it('swaps the requirement for the note on the ones that fired', () => {
    const one = listed[0] as { id: string; requirement: string; note: string };
    const cold = texts(CommendationShelf({ achievements: {} }), 'commend__note');
    const warm = texts(CommendationShelf({ achievements: { [one.id]: 1 } }), 'commend__note');

    expect(cold).toContain(one.requirement);
    expect(warm).toContain(one.note);
    expect(warm).not.toContain(one.requirement);
  });

  it('dates a commendation by the day it was earned', () => {
    expect(earnedOn(new Date(2026, 8, 3).getTime())).toBe('earned 3 Sept');
    expect(earnedOn(Number.NaN)).toBe('earned');
  });
});
