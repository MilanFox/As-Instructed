import type { LevelDef, WorldMeta } from './types.ts';
import { WORLD_1_LEVELS } from './world-1/index.ts';
import { WORLD_2_LEVELS } from './world-2/index.ts';
import { WORLD_3_LEVELS } from './world-3/index.ts';
import { WORLD_4_LEVELS } from './world-4/index.ts';
import { WORLD_5_LEVELS } from './world-5/index.ts';
import { WORLD_6_LEVELS } from './world-6/index.ts';
import { WORLD_7_LEVELS } from './world-7/index.ts';
import { WORLD_8_LEVELS } from './world-8/index.ts';

export type { LevelDef, LevelFact, ReferenceSolution, WorldMeta } from './types.ts';
export type { LevelRunResult } from './harness.ts';
export { runLevel, runReference } from './harness.ts';

export const WORLDS: readonly WorldMeta[] = [
  {
    id: 1,
    name: 'Boot Sector',
    subtitle: 'A dusty test hangar',
    blurb: 'Somewhere to crash a bot without anyone important noticing.',
    concepts: ['Control Flow'],
    accent: '#35e0c8',
  },
  {
    id: 2,
    name: 'Regolith Fields',
    subtitle: 'Agriculture on a hostile rock',
    blurb: 'Crops that will not grow, on soil that does not want them.',
    concepts: ['State Tracking'],
    accent: '#7ee06a',
  },
  {
    id: 3,
    name: 'The Sorting Yards',
    subtitle: 'Logistics depot',
    blurb: 'Everything arrives in the wrong order.',
    concepts: ['Data Structures'],
    accent: '#ffb020',
  },
  {
    id: 4,
    name: 'Cave Systems',
    subtitle: 'Unmapped tunnels',
    blurb: 'No map, no light, no rescue budget. Search, and remembering where you have been.',
    concepts: ['Pathfinding'],
    accent: '#9a7bd8',
  },
  {
    id: 5,
    name: 'The Grid',
    subtitle: 'Power infrastructure',
    blurb:
      'Cables that must be energised in the right order. Working out what has to happen first.',
    concepts: ['Graphs'],
    accent: '#4ea8ff',
  },
  {
    id: 6,
    name: 'Deep Signal',
    subtitle: 'A listening post',
    blurb: 'Something is transmitting.',
    concepts: ['Encoding'],
    accent: '#ff7ad9',
  },
  {
    id: 7,
    name: 'Swarm',
    subtitle: 'Several bots at once',
    blurb:
      'Cheaper together, if they do not queue. Many bots at once, dividing work, and a clock that stops with the last of them.',
    concepts: ['Concurrency'],
    accent: '#ff5d5d',
  },
  {
    id: 8,
    name: 'The Kessler Contract',
    subtitle: 'The finale',
    blurb: 'Everything you have learned, under budget, with Management watching.',
    concepts: ['Synthesis'],
    accent: '#ffd166',
  },
];

export const LEVELS: LevelDef[] = [
  ...WORLD_1_LEVELS,
  ...WORLD_2_LEVELS,
  ...WORLD_3_LEVELS,
  ...WORLD_4_LEVELS,
  ...WORLD_5_LEVELS,
  ...WORLD_6_LEVELS,
  ...WORLD_7_LEVELS,
  ...WORLD_8_LEVELS,
];

const byId = new Map<string, LevelDef>(LEVELS.map((level) => [level.id, level]));

export function getLevel(id: string): LevelDef | undefined {
  return byId.get(id);
}

export function levelIsGraded(id: string): boolean {
  return byId.get(id)?.graded !== false;
}

export function worldMeta(world: number): WorldMeta | undefined {
  return WORLDS.find((w) => w.id === world);
}

export interface WorldSection {
  world: WorldMeta;
  levels: LevelDef[];
}

export function levelsByWorld(): WorldSection[] {
  return WORLDS.map((world) => ({
    world,
    levels: LEVELS.filter((level) => level.world === world.id).sort((a, b) => a.index - b.index),
  }));
}

export function campaignOrder(): LevelDef[] {
  return LEVELS.slice().sort((a, b) => a.world - b.world || a.index - b.index);
}

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
