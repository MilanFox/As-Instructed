import { describe, expect, test } from 'vitest';
import { buildCampaign } from '../campaign.ts';
import type { CampaignSite } from '../campaign.ts';
import { emptySave } from '../save.ts';
import type { LevelProgress, SaveFile } from '../save.ts';
import { Medal } from '../score.ts';
import { levelsByWorld } from '../../levels/index.ts';

// The rule the site-starred commendation is awarded by, copied from allStarred in
// src/game/store.ts. The map may not claim a site is fully starred where that would not fire.
function commendationStarred(save: SaveFile, world: number): boolean {
  const group = levelsByWorld().find((entry) => entry.world.id === world)?.levels ?? [];
  if (group.length === 0) return false;
  if (!group.every((level) => save.levels[level.id]?.completed === true)) return false;
  return group.every((level) => {
    const stars = save.levels[level.id]?.stars ?? [];
    return (level.bonus ?? []).every((bonus) => stars.includes(bonus.id));
  });
}

function siteFor(save: SaveFile, world: number): CampaignSite {
  const site = buildCampaign(save).sites.find((candidate) => candidate.world.id === world);
  if (!site) throw new Error(`no world ${String(world)}`);
  return site;
}

function bonusIds(world: number, levelId: string): string[] {
  const group = levelsByWorld().find((entry) => entry.world.id === world)?.levels ?? [];
  const level = group.find((candidate) => candidate.id === levelId);
  return (level?.bonus ?? []).map((objective) => objective.id);
}

function idsOf(world: number): string[] {
  return (levelsByWorld().find((entry) => entry.world.id === world)?.levels ?? []).map(
    (level) => level.id,
  );
}

interface Close {
  medal?: Medal;
  stars?: string[];
}

function sector(closes: Record<string, Close | null>): SaveFile {
  const save = emptySave();
  for (const [id, close] of Object.entries(closes)) {
    if (!close) continue;
    const progress: LevelProgress = {
      completed: true,
      medal: close.medal ?? Medal.None,
      stars: close.stars ?? [],
      attempts: 1,
    };
    save.levels[id] = progress;
  }
  return save;
}

function everyOrder(world: number, close: (id: string) => Close | null): SaveFile {
  return sector(
    Object.fromEntries(idsOf(world).map((id) => [id, close(id)])) as Record<string, Close | null>,
  );
}

const BOOT = 1;

describe('the fixture covers the case the rule is vacuous on', () => {
  test('Boot Sector holds a work order that grades no bonus at all', () => {
    const bonusless = idsOf(BOOT).filter((id) => bonusIds(BOOT, id).length === 0);
    const graded = idsOf(BOOT).filter((id) => bonusIds(BOOT, id).length > 0);

    expect(bonusless.length).toBeGreaterThan(0);
    expect(graded.length).toBeGreaterThan(0);
  });
});

describe('the starred tier is the site-starred commendation, drawn', () => {
  const saves: [string, SaveFile][] = [
    ['nothing closed', emptySave()],
    ['closed, no bonus met', everyOrder(BOOT, () => ({ medal: Medal.Gold }))],
    [
      'closed, one bonus missed',
      everyOrder(BOOT, (id) => ({
        medal: Medal.Gold,
        stars: id === idsOf(BOOT)[1] ? [] : bonusIds(BOOT, id),
      })),
    ],
    [
      'every bonus met, one order short of closed',
      everyOrder(BOOT, (id) =>
        id === idsOf(BOOT)[0] ? null : { medal: Medal.Gold, stars: bonusIds(BOOT, id) },
      ),
    ],
    [
      'every bonus met, every order closed',
      everyOrder(BOOT, (id) => ({ medal: Medal.Gold, stars: bonusIds(BOOT, id) })),
    ],
    [
      'every bonus met on silver',
      everyOrder(BOOT, (id) => ({ medal: Medal.Silver, stars: bonusIds(BOOT, id) })),
    ],
  ];

  for (const [name, save] of saves) {
    test(`${name}: the map and the commendation agree`, () => {
      expect([name, siteFor(save, BOOT).starred]).toEqual([name, commendationStarred(save, BOOT)]);
    });
  }

  test('an order that grades no bonus does not withhold the tier', () => {
    const save = everyOrder(BOOT, (id) => ({ medal: Medal.Gold, stars: bonusIds(BOOT, id) }));
    const site = siteFor(save, BOOT);

    expect(site.orders.some((order) => order.maxStars === 0)).toBe(true);
    expect(site.starred).toBe(true);
  });

  test('a stray star from some other work order does not buy the tier', () => {
    const save = everyOrder(BOOT, () => ({ medal: Medal.Gold, stars: ['not-an-objective'] }));

    expect(siteFor(save, BOOT).starred).toBe(false);
    expect(commendationStarred(save, BOOT)).toBe(false);
  });
});

describe('at par and every bonus met are independent facts', () => {
  test('a site can be starred without being at par', () => {
    const site = siteFor(
      everyOrder(BOOT, (id) => ({ medal: Medal.Silver, stars: bonusIds(BOOT, id) })),
      BOOT,
    );

    expect([site.complete, site.perfect, site.starred]).toEqual([true, false, true]);
  });

  test('a site can be at par without being starred', () => {
    const site = siteFor(
      everyOrder(BOOT, () => ({ medal: Medal.Gold })),
      BOOT,
    );

    expect([site.complete, site.perfect, site.starred]).toEqual([true, true, false]);
  });

  test('neither tier is reachable before the site is closed', () => {
    const site = siteFor(
      everyOrder(BOOT, (id) =>
        id === idsOf(BOOT)[0] ? null : { medal: Medal.Gold, stars: bonusIds(BOOT, id) },
      ),
      BOOT,
    );

    expect([site.complete, site.perfect, site.starred]).toEqual([false, false, false]);
  });
});
