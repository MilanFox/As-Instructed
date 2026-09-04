import type { LevelDef, WorldMeta } from './types.ts';
import { w1_01 } from './world-1/w1-01.ts';

export type { LevelDef, ReferenceSolution, WorldMeta } from './types.ts';
export type { LevelRunResult } from './harness.ts';
export { runLevel, runReference } from './harness.ts';

/** DESIGN.md §6. Accents are drawn from the tokens.css palette family. */
export const WORLDS: readonly WorldMeta[] = [
  {
    id: 1,
    name: 'Boot Sector',
    subtitle: 'A dusty test hangar',
    blurb:
      'Somewhere to crash a bot without anyone important noticing. Loops, conditionals, coordinates.',
    accent: '#35e0c8',
  },
  {
    id: 2,
    name: 'Regolith Fields',
    subtitle: 'Agriculture on a hostile rock',
    blurb:
      'Crops that will not grow, on soil that does not want them. State machines and resource cycles.',
    accent: '#7ee06a',
  },
  {
    id: 3,
    name: 'The Sorting Yards',
    subtitle: 'Logistics depot',
    blurb: 'Everything arrives in the wrong order. Data structures, filtering, maps.',
    accent: '#ffb020',
  },
  {
    id: 4,
    name: 'Cave Systems',
    subtitle: 'Unmapped tunnels',
    blurb: 'No map, no light, no rescue budget. Search, and remembering where you have been.',
    accent: '#9a7bd8',
  },
  {
    id: 5,
    name: 'The Grid',
    subtitle: 'Power infrastructure',
    blurb: 'Cables that must be energised in the correct order. Constraint solving and graphs.',
    accent: '#4ea8ff',
  },
  {
    id: 6,
    name: 'Deep Signal',
    subtitle: 'A listening post',
    blurb: 'Something is transmitting. Parsing, checksums, and number crunching.',
    accent: '#ff7ad9',
  },
  {
    id: 7,
    name: 'Swarm',
    subtitle: 'A hundred cheap robots',
    blurb: 'Cheaper together, if they do not queue. Parallelism, scheduling, makespan.',
    accent: '#ff5d5d',
  },
  {
    id: 8,
    name: 'The Kessler Contract',
    subtitle: 'The finale',
    blurb: 'Everything you have learned, under budget, with Management watching.',
    accent: '#ffd166',
  },
];

/**
 * The campaign, in play order. CONTENT owns this list; append level modules here as they land.
 * Order within a world follows `LevelDef.index`, not array position.
 */
export const LEVELS: LevelDef[] = [w1_01];

const byId = new Map<string, LevelDef>(LEVELS.map((level) => [level.id, level]));

export function getLevel(id: string): LevelDef | undefined {
  return byId.get(id);
}

export function worldMeta(world: number): WorldMeta | undefined {
  return WORLDS.find((w) => w.id === world);
}

export interface WorldSection {
  world: WorldMeta;
  levels: LevelDef[];
}

/** Every world with its levels sorted by `index`. Worlds with no levels yet are still listed. */
export function levelsByWorld(): WorldSection[] {
  return WORLDS.map((world) => ({
    world,
    levels: LEVELS.filter((level) => level.world === world.id).sort((a, b) => a.index - b.index),
  }));
}

/** The flat play order across the whole campaign. */
export function campaignOrder(): LevelDef[] {
  return LEVELS.slice().sort((a, b) => a.world - b.world || a.index - b.index);
}

/** API names available to the player at `levelId`, cumulative and in unlock order. */
export function hardwareUnlockedBy(levelId: string): string[] {
  const unlocked: string[] = [];
  for (const level of campaignOrder()) {
    for (const name of level.hardware) if (!unlocked.includes(name)) unlocked.push(name);
    if (level.id === levelId) break;
  }
  return unlocked;
}

export function nextLevel(id: string): LevelDef | undefined {
  const order = campaignOrder();
  const i = order.findIndex((level) => level.id === id);
  return i >= 0 ? order[i + 1] : undefined;
}
