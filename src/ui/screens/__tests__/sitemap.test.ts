import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildCampaign } from '../../../game/campaign.ts';
import type { CampaignOrder, CampaignSite, OrderStatus } from '../../../game/campaign.ts';
import { Medal, isGraded } from '../../../game/score.ts';
import { emptySave } from '../../../game/save.ts';
import type { SaveFile } from '../../../game/save.ts';
import { getLevel, levelsByWorld } from '../../../levels/index.ts';
import { orderLabel, siteLabel } from '../LevelSelect.tsx';

const UNGRADED = 'w1-01';
const GRADED = 'w1-03';
const BONUS_ORDER = 'w1-02';

const STATUSES: readonly OrderStatus[] = ['CLOSED', 'OPEN', 'ON HOLD'];

function close(save: SaveFile, id: string, medal: Medal): SaveFile {
  save.levels[id] = { completed: true, medal, stars: [], attempts: 1 };
  return save;
}

function siteFor(save: SaveFile, world: number): CampaignSite {
  const site = buildCampaign(save).sites.find((candidate) => candidate.world.id === world);
  if (!site) throw new Error(`no world ${String(world)}`);
  return site;
}

function orderFor(save: SaveFile, id: string): CampaignOrder {
  const order = buildCampaign(save).orders.find((candidate) => candidate.id === id);
  if (!order) throw new Error(`no work order ${id}`);
  return order;
}

function bootSectorInProgress(): SaveFile {
  return close(close(emptySave(), 'w1-01', Medal.None), 'w1-02', Medal.None);
}

function bootSectorClosed(medal: Medal): SaveFile {
  return close(bootSectorInProgress(), GRADED, medal);
}

function bonusIds(levelId: string): string[] {
  return (getLevel(levelId)?.bonus ?? []).map((objective) => objective.id);
}

function allStarred(medal: Medal): SaveFile {
  const save = bootSectorClosed(medal);
  for (const id of [UNGRADED, BONUS_ORDER, GRADED]) {
    const progress = save.levels[id];
    if (progress) progress.stars = bonusIds(id);
  }
  return save;
}

describe('the fixture the browser was driven against', () => {
  test('world 1 holds two ungraded work orders and one graded', () => {
    const world = levelsByWorld().find((entry) => entry.world.id === 1);
    const graded = (world?.levels ?? []).filter((level) => isGraded(level)).map((l) => l.id);
    const ungraded = (world?.levels ?? []).filter((level) => !isGraded(level)).map((l) => l.id);
    expect(ungraded).toEqual(['w1-01', 'w1-02']);
    expect(graded).toEqual(['w1-03']);
  });
});

describe('an ungraded close is worth a gold', () => {
  test('closing both ungraded orders in Boot Sector pays six, not nothing', () => {
    const site = siteFor(bootSectorInProgress(), 1);
    expect(site.closed).toBe(2);
    expect(site.points).toBe(6);
  });

  test('an ungraded order still on the bench is paid nothing', () => {
    expect(siteFor(emptySave(), 1).points).toBe(0);
  });

  test('the ceiling does not move — a close can reach it', () => {
    const site = siteFor(bootSectorClosed(Medal.Gold), 1);
    expect(site.points).toBe(9);
    expect(site.maxPoints).toBeGreaterThanOrEqual(9);
  });

  test('the campaign total carries the same six', () => {
    expect(buildCampaign(bootSectorInProgress()).points).toBe(6);
  });
});

describe('ALL AT PAR is attainable in a world holding an ungraded order', () => {
  test('a sector of ungraded closes and a gold is perfect', () => {
    const site = siteFor(bootSectorClosed(Medal.Gold), 1);
    expect(site.complete).toBe(true);
    expect(site.perfect).toBe(true);
  });

  test('a silver on the one graded order still withholds the stamp', () => {
    expect(siteFor(bootSectorClosed(Medal.Silver), 1).perfect).toBe(false);
  });

  test('an ungraded order left open is not counted at par', () => {
    expect(siteFor(emptySave(), 1).atPar).toBe(0);
    expect(siteFor(close(emptySave(), UNGRADED, Medal.None), 1).atPar).toBe(1);
  });

  test('the at-par aside counts the close; the medal columns do not', () => {
    const campaign = buildCampaign(bootSectorClosed(Medal.Gold));
    expect(campaign.atPar).toBe(3);
    expect(campaign.gold).toBe(1);
    expect(campaign.silver).toBe(0);
    expect(campaign.bronze).toBe(0);
  });
});

describe('the accessible name does not announce finished work as unfinished', () => {
  const state = (order: CampaignOrder): string => {
    const label = orderLabel(order);
    const at = label.indexOf(order.level.title);
    if (at < 0) throw new Error(`the label does not name ${order.id}`);
    return label.slice(at + order.level.title.length);
  };

  test('a closed ungraded order is not read as a missing medal', () => {
    const order = orderFor(bootSectorInProgress(), UNGRADED);
    expect(state(order)).toContain('closed');
    expect(orderLabel(order).toLowerCase()).not.toContain('medal');
    expect(state(order)).not.toContain('open');
  });

  test('an untouched graded order is still read as unfinished', () => {
    const order = orderFor(bootSectorInProgress(), GRADED);
    expect(state(order)).toContain('open');
    expect(state(order)).not.toContain('closed');
  });

  test('a closed ungraded order and an untouched graded one do not sound alike', () => {
    const save = bootSectorInProgress();
    expect(state(orderFor(save, UNGRADED))).not.toBe(state(orderFor(save, GRADED)));
  });

  test('a medal is still named where the level carries one', () => {
    expect(state(orderFor(bootSectorClosed(Medal.Gold), GRADED))).toContain(Medal.Gold);
  });
});

describe('the survey names a site by how much of it has been walked', () => {
  test('a site names itself whether or not it has been walked', () => {
    const campaign = buildCampaign(emptySave());
    const first = campaign.sites[0];
    const last = campaign.sites[campaign.sites.length - 1];
    if (!first || !last) throw new Error('no sites');

    expect([first.world.id, first.unlocked]).toEqual([1, true]);
    expect(last.unlocked).toBe(false);
    expect(siteLabel(last)).toContain(last.world.name);
    expect(siteLabel(first)).toContain(first.world.name);
    expect(siteLabel(last)).toContain('unsurveyed');
    expect(siteLabel(first)).not.toContain('unsurveyed');
  });

  test('a surveyed site reads its closed count against the orders it issued', () => {
    const save = bootSectorInProgress();
    const site = siteFor(save, 1);
    expect(siteLabel(site)).toContain(`${String(site.closed)} of ${String(site.issued)}`);
  });

  test('a site closed to its last order says so, over and above the count', () => {
    const closed = siteLabel(siteFor(bootSectorClosed(Medal.Silver), 1));

    expect(siteLabel(siteFor(bootSectorInProgress(), 1))).not.toContain('site complete');
    expect(closed).toContain('site complete');
    expect(closed).not.toContain('at par');
    expect(closed).not.toContain('bonus');
  });

  test('each further tier is named, and only once the site has reached it', () => {
    const atPar = siteLabel(siteFor(bootSectorClosed(Medal.Gold), 1));
    const starred = siteLabel(siteFor(allStarred(Medal.Gold), 1));

    expect(atPar).toContain('every work order at par');
    expect(atPar).not.toContain('bonus');
    expect(starred).toContain('every work order at par');
    expect(starred).toContain('every bonus objective met');
  });

  test('a site starred short of par is not read as being at par', () => {
    const label = siteLabel(siteFor(allStarred(Medal.Silver), 1));

    expect(label).toContain('every bonus objective met');
    expect(label).not.toContain('at par');
  });

  test('a work order with every bonus met announces it', () => {
    const bonus = getLevel(BONUS_ORDER)?.bonus ?? [];
    const save = emptySave();
    save.levels[BONUS_ORDER] = {
      completed: true,
      medal: Medal.None,
      stars: bonus.map((objective) => objective.id),
      attempts: 1,
    };

    expect(bonus.length).toBeGreaterThan(0);
    expect(orderLabel(orderFor(save, BONUS_ORDER))).toContain('all bonus objectives met');
    expect(orderLabel(orderFor(bootSectorInProgress(), BONUS_ORDER))).not.toContain('bonus');
  });

  test('every work order carries one of the three states and nothing else', () => {
    const campaign = buildCampaign(bootSectorInProgress());
    const seen = new Set(campaign.orders.map((order) => order.status));

    expect(campaign.orders.length).toBeGreaterThan(0);
    expect([...seen].every((status) => STATUSES.includes(status))).toBe(true);
    expect([...seen].sort()).toEqual([...STATUSES].sort());
  });
});

const CSS = readFileSync(new URL('../../styles/screens.css', import.meta.url), 'utf8');
const LOCKED = readFileSync(new URL('../../styles/locked.css', import.meta.url), 'utf8');

const rule = (selector: string, sheet = CSS): string => {
  const found = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(sheet)?.[0];
  if (!found) throw new Error(`no ${selector} rule in the stylesheet`);
  return found;
};

const value = (property: string, source: string): string => {
  const found = new RegExp(`${property}:\\s*([^;]+);`).exec(source)?.[1];
  if (!found) throw new Error(`no ${property} declaration`);
  return found.trim();
};

const EDGES = ['top', 'right', 'bottom', 'left'] as const;

describe('the survey root declares the tokens its frames read', () => {
  const root = rule('.survey');

  test('every measurement the frames share is stated once, on the root', () => {
    for (const token of [
      '--survey-inset',
      '--survey-cut',
      '--survey-dossier',
      '--survey-seals',
      '--survey-sheet',
      '--survey-dock',
    ]) {
      expect([token, new RegExp(`${token}:\\s*[^;]+;`).test(root)]).toEqual([token, true]);
    }
  });

  test('a frame places itself off those tokens rather than off a pixel of its own', () => {
    for (const selector of ['.survey__tally', '.dossier', '.survey-seals']) {
      const frame = rule(selector);
      for (const edge of EDGES) {
        if (!new RegExp(`\\b${edge}:`).test(frame)) continue;
        const declared = value(edge, frame);
        expect([`${selector} ${edge}`, /var\(--survey-/.test(declared)]).toEqual([
          `${selector} ${edge}`,
          true,
        ]);
      }
    }
  });
});

describe('the dossier and the interlock occupy the same box', () => {
  const dossier = rule('.dossier');
  const interlock = rule('.survey-interlock', LOCKED);

  test('both are one dossier column wide', () => {
    expect(value('width', dossier)).toBe('var(--survey-dossier)');
    expect(value('width', interlock)).toBe(value('width', dossier));
  });

  test('both take the same edges, so the refusal lands on the panel it replaces', () => {
    for (const edge of ['top', 'right', 'bottom'] as const) {
      expect([edge, value(edge, interlock)]).toEqual([edge, value(edge, dossier)]);
    }
  });

  test('narrow turns both into the same bottom sheet, in one rule', () => {
    const sheet = /([^{}]*)\{[^}]*height:\s*var\(--survey-sheet\)[^}]*\}/.exec(CSS)?.[1] ?? '';
    expect(sheet).toContain('.dossier');
    expect(sheet).toContain('.survey-interlock');
  });
});

describe('the achievements tab is measured off the panel it opens', () => {
  test('the tab stands on the frames own inset, clear of the cut it opens beside', () => {
    expect(value('bottom', rule('.survey-seals-tab'))).toBe(
      'calc(var(--survey-inset) + var(--survey-cut))',
    );
  });

  test('the open tab travels the width the panel declares', () => {
    expect(value('width', rule('.survey-seals'))).toBe('var(--survey-seals)');
    expect(CSS).toContain('translateX(calc(var(--survey-seals) + var(--survey-inset)))');
  });

  test('narrow lifts the tab over the sheet rather than over a guess', () => {
    const narrow = /\.survey\[data-narrow='true'] \.survey-seals-tab\s*\{[^}]*\}/.exec(CSS)?.[0];
    if (!narrow) throw new Error('no narrow rule for the achievements tab');
    const bottom = value('bottom', narrow);

    expect(bottom).toContain('var(--survey-sheet)');
    expect(bottom).toContain('var(--survey-dock)');
  });
});
