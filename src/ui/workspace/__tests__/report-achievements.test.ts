import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ACHIEVEMENTS } from '../../../game/achievements.ts';
import type { ReportSnapshot } from '../../report.ts';
import { ReportSheet } from '../ReportSheet.tsx';

const AWARDED = ACHIEVEMENTS.slice(0, 2);

function reportWith(achievements: readonly string[]): ReportSnapshot {
  return {
    levelId: 'w1-01',
    title: 'First order',
    passed: true,
    graded: true,
    medal: 'gold',
    headline: 'Closed at par.',
    ticks: 40,
    par: 40,
    limit: null,
    bestTicks: 40,
    seeds: [1],
    seedLines: [],
    objectives: [],
    causes: [],
    cause: null,
    failure: null,
    failureCode: null,
    failureSeed: null,
    failureLine: null,
    passedSeed: null,
    bonusSeed: null,
    achievements,
    personalBest: null,
    points: 3,
    stars: 0,
    onRecord: null,
    libraryLine: null,
  };
}

function textOf(achievements: readonly string[]): string {
  return renderToStaticMarkup(createElement(ReportSheet, { report: reportWith(achievements) }))
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function cards(achievements: readonly string[]): number {
  const markup = renderToStaticMarkup(
    createElement(ReportSheet, { report: reportWith(achievements) }),
  );
  return (markup.match(/class="achievement"/g) ?? []).length;
}

describe('an earned achievement reads as the writing, not the id', () => {
  test('the report has an achievement to draw at all', () => {
    expect(AWARDED.length).toBe(2);
  });

  for (const achievement of AWARDED) {
    test(`${achievement.id} shows its title and never its id`, () => {
      const text = textOf([achievement.id]);

      expect([achievement.id, text.includes(achievement.title)]).toEqual([achievement.id, true]);
      expect([achievement.id, text.includes(achievement.id)]).toEqual([achievement.id, false]);
    });

    test(`${achievement.id} shows its note`, () => {
      expect([achievement.id, textOf([achievement.id]).includes(achievement.note)]).toEqual([
        achievement.id,
        true,
      ]);
    });
  }

  test('several landing on one run each get their own card', () => {
    const ids = AWARDED.map((achievement) => achievement.id);
    const text = textOf(ids);

    expect(cards(ids)).toBe(ids.length);
    for (const achievement of AWARDED) {
      expect([achievement.id, text.includes(achievement.note)]).toEqual([achievement.id, true]);
    }
  });

  test('a run with nothing to award draws no card', () => {
    expect(cards([])).toBe(0);
    expect(textOf([]).includes('Achievements')).toBe(false);
  });

  test('an id the roster no longer carries still draws, with no note to show', () => {
    expect(cards(['retired-and-gone'])).toBe(1);
    expect(textOf(['retired-and-gone']).includes('retired-and-gone')).toBe(true);
  });
});
