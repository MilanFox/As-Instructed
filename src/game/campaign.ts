import { campaignOrder, levelsByWorld } from '../levels/index.ts';
import type { LevelDef, WorldMeta } from '../levels/index.ts';
import { ACHIEVEMENTS } from './achievements.ts';
import type { Achievement } from './achievements.ts';
import { emptyProgress } from './save.ts';
import type { LevelProgress, SaveFile } from './save.ts';
import { Medal, levelMaxPoints, medalOf, progressPoints, starsFor } from './score.ts';
import { isLevelUnlocked } from './store.ts';

export type OrderStatus = 'CLOSED' | 'OPEN' | 'ON HOLD';

export interface CampaignOrder {
  id: string;
  index: number;
  level: LevelDef;
  progress: LevelProgress;
  medal: Medal | null;
  stars: number;
  maxStars: number;
  points: number;
  maxPoints: number;
  status: OrderStatus;
  playable: boolean;
  isNext: boolean;
}

export interface CampaignSite {
  world: WorldMeta;
  orders: CampaignOrder[];
  issued: number;
  closed: number;
  points: number;
  maxPoints: number;
  atPar: number;
  unlocked: boolean;
  complete: boolean;
  perfect: boolean;
}

export interface CampaignCommendation {
  achievement: Achievement;
  earnedAt: number | null;
}

export interface Campaign {
  sites: CampaignSite[];
  orders: CampaignOrder[];
  commendations: CampaignCommendation[];
  earnedCount: number;
  points: number;
  maxPoints: number;
  closed: number;
  issued: number;
  atPar: number;
  gold: number;
  silver: number;
  bronze: number;
  stars: number;
  maxStars: number;
  next: CampaignOrder | undefined;
}

function progressOf(save: SaveFile, levelId: string): LevelProgress {
  return save.levels[levelId] ?? emptyProgress();
}

// An ungraded close is at par and pays a gold's points, but it is no gold: it carries no medal, so
// it counts towards a site's atPar and towards none of the three medal tallies.
function atPar(order: CampaignOrder): boolean {
  return order.medal === Medal.Gold || (order.medal === null && order.progress.completed);
}

export function buildCampaign(save: SaveFile): Campaign {
  const nextUp = campaignOrder().find(
    (level) => isLevelUnlocked(save, level.id) && !progressOf(save, level.id).completed,
  );

  const sites: CampaignSite[] = levelsByWorld().map(({ world, levels }) => {
    const orders: CampaignOrder[] = levels.map((level, position) => {
      const progress = progressOf(save, level.id);
      const playable = isLevelUnlocked(save, level.id);
      const bonus = level.bonus?.length ?? 0;
      return {
        id: level.id,
        index: position + 1,
        level,
        progress,
        medal: medalOf(level, progress),
        stars: starsFor(level.bonus, progress.stars),
        maxStars: bonus,
        points: progressPoints(level, progress),
        maxPoints: levelMaxPoints(bonus),
        status: progress.completed ? 'CLOSED' : playable ? 'OPEN' : 'ON HOLD',
        playable,
        isNext: level.id === nextUp?.id,
      };
    });

    const closed = orders.filter((order) => order.status === 'CLOSED').length;
    const par = orders.filter(atPar).length;
    const complete = orders.length > 0 && closed === orders.length;

    return {
      world,
      orders,
      issued: orders.length,
      closed,
      points: orders.reduce((sum, order) => sum + order.points, 0),
      maxPoints: orders.reduce((sum, order) => sum + order.maxPoints, 0),
      atPar: par,
      unlocked: orders.some((order) => order.playable),
      complete,
      perfect: complete && par === orders.length,
    };
  });

  const orders = sites.flatMap((site) => site.orders);
  const commendations: CampaignCommendation[] = ACHIEVEMENTS.filter(
    (achievement) => !achievement.hidden || save.achievements[achievement.id] !== undefined,
  ).map((achievement) => ({
    achievement,
    earnedAt: save.achievements[achievement.id] ?? null,
  }));

  return {
    sites,
    orders,
    commendations,
    earnedCount: commendations.filter((entry) => entry.earnedAt !== null).length,
    points: sites.reduce((sum, site) => sum + site.points, 0),
    maxPoints: sites.reduce((sum, site) => sum + site.maxPoints, 0),
    closed: sites.reduce((sum, site) => sum + site.closed, 0),
    issued: sites.reduce((sum, site) => sum + site.issued, 0),
    atPar: sites.reduce((sum, site) => sum + site.atPar, 0),
    gold: orders.filter((order) => order.progress.medal === Medal.Gold).length,
    silver: orders.filter((order) => order.progress.medal === Medal.Silver).length,
    bronze: orders.filter((order) => order.progress.medal === Medal.Bronze).length,
    stars: orders.reduce((sum, order) => sum + order.stars, 0),
    maxStars: orders.reduce((sum, order) => sum + order.maxStars, 0),
    next: orders.find((order) => order.isNext),
  };
}
