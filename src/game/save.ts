import { Medal } from '../engine/index.ts';
import { levelIsGraded } from '../levels/index.ts';
import { RETIRED_ACHIEVEMENTS } from './achievements.ts';

export const SAVE_KEY = 'as-instructed.save';
export const SAVE_VERSION = 2;

export interface LevelProgress {
  code?: string;
  completed: boolean;
  medal: Medal;
  stars: string[];
  objectives?: string[];
  bestTicks?: number;
  attempts: number;
  clearedAt?: number;
  hintsRevealed?: number;
  seedsUnlocked?: boolean;
}

export interface Layout {
  editorFraction: number;
  viewportFraction: number;
}

export interface Settings {
  layout: Layout;
  speed: number;
  consoleCap: number;
  celebrations: boolean;
}

export interface CampaignStats {
  runs: number;
  passes: number;
  fails: number;
}

export interface SaveFile {
  version: number;
  updatedAt: number;
  levels: Record<string, LevelProgress>;
  settings: Settings;
  achievements: Record<string, number>;
  stats: CampaignStats;
  reviewedRanks: number[];
  firstRunAt?: number;
  routineOrders?: Record<string, string[]>;
}

export const DEFAULT_LAYOUT: Layout = { editorFraction: 0.44, viewportFraction: 0.58 };

export function emptyStats(): CampaignStats {
  return { runs: 0, passes: 0, fails: 0 };
}

export function emptySave(): SaveFile {
  return {
    version: SAVE_VERSION,
    updatedAt: Date.now(),
    levels: {},
    settings: {
      layout: { ...DEFAULT_LAYOUT },
      speed: 1,
      consoleCap: 2000,
      celebrations: true,
    },
    achievements: {},
    stats: emptyStats(),
    reviewedRanks: [],
  };
}

export function emptyProgress(): LevelProgress {
  return { completed: false, medal: Medal.None, stars: [], attempts: 0 };
}

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  0: (raw) => ({
    version: 1,
    updatedAt: Date.now(),
    levels: rescueLevels(raw),
    settings: emptySave().settings,
  }),
  1: (raw) => ({
    ...raw,
    version: 2,
    achievements: {},
    stats: reconstructStats(rescueLevels(raw)),
  }),
};

function reconstructStats(levels: Record<string, LevelProgress>): CampaignStats {
  const stats = emptyStats();
  for (const progress of Object.values(levels)) {
    stats.runs += progress.attempts;
    if (progress.completed) stats.passes++;
  }
  stats.fails = Math.max(0, stats.runs - stats.passes);
  return stats;
}

function rescueLevels(raw: unknown): Record<string, LevelProgress> {
  const levels: Record<string, LevelProgress> = {};
  const source = isRecord(raw) && isRecord(raw['levels']) ? raw['levels'] : raw;
  if (!isRecord(source)) return levels;

  for (const [id, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      levels[id] = { ...emptyProgress(), code: value };
      continue;
    }
    if (!isRecord(value)) continue;
    const progress = emptyProgress();
    if (typeof value['code'] === 'string') progress.code = value['code'];
    if (value['completed'] === true) progress.completed = true;
    if (isMedal(value['medal']) && levelIsGraded(id)) progress.medal = value['medal'];
    if (Array.isArray(value['stars'])) {
      progress.stars = value['stars'].filter((s): s is string => typeof s === 'string');
    }
    if (Array.isArray(value['objectives'])) {
      const banked = value['objectives'].filter((s): s is string => typeof s === 'string');
      if (banked.length > 0) progress.objectives = banked;
    }
    if (isPositive(value['bestTicks'])) progress.bestTicks = value['bestTicks'];
    if (isPositive(value['attempts'])) progress.attempts = value['attempts'];
    if (isPositive(value['clearedAt'])) progress.clearedAt = value['clearedAt'];
    if (isPositive(value['hintsRevealed'])) progress.hintsRevealed = value['hintsRevealed'];
    if (value['seedsUnlocked'] === true) progress.seedsUnlocked = true;
    levels[id] = progress;
  }
  return levels;
}

export function migrate(raw: unknown): SaveFile {
  if (!isRecord(raw)) return emptySave();

  let working: Record<string, unknown> = raw;
  let version = isPositive(working['version']) ? working['version'] : 0;

  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    working = step(working);
    version = isPositive(working['version']) ? working['version'] : version + 1;
  }

  const base = emptySave();
  const settings = isRecord(working['settings']) ? working['settings'] : {};
  const layout = isRecord(settings['layout']) ? settings['layout'] : {};

  return {
    version: SAVE_VERSION,
    updatedAt: isPositive(working['updatedAt']) ? working['updatedAt'] : Date.now(),
    levels: rescueLevels(working),
    settings: {
      layout: {
        editorFraction: clampFraction(layout['editorFraction'], DEFAULT_LAYOUT.editorFraction),
        viewportFraction: clampFraction(
          layout['viewportFraction'],
          DEFAULT_LAYOUT.viewportFraction,
        ),
      },
      speed: isPositive(settings['speed']) ? settings['speed'] : base.settings.speed,
      consoleCap: isPositive(settings['consoleCap'])
        ? settings['consoleCap']
        : base.settings.consoleCap,
      celebrations: settings['celebrations'] !== false,
    },
    achievements: rescueAchievements(working['achievements']),
    stats: rescueStats(working['stats']),
    reviewedRanks: rescueRanks(working['reviewedRanks']),
    ...(isPositive(working['firstRunAt']) ? { firstRunAt: working['firstRunAt'] } : {}),
    ...(rescueRoutineOrders(working['routineOrders']) ?? {}),
  };
}

function rescueRoutineOrders(raw: unknown): { routineOrders: Record<string, string[]> } | null {
  if (!isRecord(raw)) return null;
  const orders: Record<string, string[]> = {};
  for (const [name, levels] of Object.entries(raw)) {
    if (name.length === 0 || !Array.isArray(levels)) continue;
    const ids = [...new Set(levels.filter((id): id is string => typeof id === 'string'))];
    if (ids.length > 0) orders[name] = ids;
  }
  return Object.keys(orders).length > 0 ? { routineOrders: orders } : null;
}

function rescueAchievements(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const earned: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) {
    if (typeof id !== 'string' || id.length === 0) continue;
    if (RETIRED_ACHIEVEMENTS.has(id)) continue;
    earned[id] = isPositive(at) ? at : Date.now();
  }
  return earned;
}

function rescueStats(raw: unknown): CampaignStats {
  const stats = emptyStats();
  if (!isRecord(raw)) return stats;
  if (isPositive(raw['runs'])) stats.runs = raw['runs'];
  if (isPositive(raw['passes'])) stats.passes = raw['passes'];
  if (isPositive(raw['fails'])) stats.fails = raw['fails'];
  return stats;
}

function rescueRanks(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ranks = raw.filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1,
  );
  return [...new Set(ranks)].sort((a, b) => a - b);
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SaveStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSave(storage: SaveStorage | null = defaultStorage()): SaveFile {
  if (!storage) return emptySave();
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return emptySave();
  }
  if (!text) return emptySave();
  return parseSave(text);
}

export function parseSave(text: string): SaveFile {
  try {
    return migrate(JSON.parse(text) as unknown);
  } catch {
    return emptySave();
  }
}

export function writeSave(save: SaveFile, storage: SaveStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...save, updatedAt: Date.now() }));
  } catch {
    // A full or blocked quota must never interrupt play.
  }
}

export function exportSave(save: SaveFile, library?: unknown): string {
  const payload = {
    ...save,
    version: SAVE_VERSION,
    ...(library === undefined ? {} : { library }),
  };
  return JSON.stringify(payload, null, 2);
}

// The library lives under its own storage key, so `migrate` deliberately leaves it out of
// `SaveFile` — a copy inside the progress save would be a second, staler library. This reader is
// the only thing that keeps the exported section.
export function exportedLibrary(text: string): unknown {
  try {
    const raw: unknown = JSON.parse(text);
    return isRecord(raw) ? raw['library'] : undefined;
  } catch {
    return undefined;
  }
}

export function importSave(current: SaveFile, text: string): SaveFile {
  const incoming = parseSave(text);
  const levels: Record<string, LevelProgress> = { ...current.levels };
  for (const [id, next] of Object.entries(incoming.levels)) {
    levels[id] = mergeProgress(current.levels[id], next);
  }

  const achievements: Record<string, number> = { ...current.achievements };
  for (const [id, at] of Object.entries(incoming.achievements)) {
    const existing = achievements[id];
    achievements[id] = existing === undefined ? at : Math.min(existing, at);
  }

  const routineOrders: Record<string, string[]> = { ...current.routineOrders };
  for (const [name, ids] of Object.entries(incoming.routineOrders ?? {})) {
    routineOrders[name] = [...new Set([...(routineOrders[name] ?? []), ...ids])];
  }
  const startedAt = minDefined(current.firstRunAt, incoming.firstRunAt);

  return {
    ...incoming,
    levels,
    achievements,
    stats: mergeStats(current.stats, incoming.stats),
    reviewedRanks: [...new Set([...current.reviewedRanks, ...incoming.reviewedRanks])].sort(
      (a, b) => a - b,
    ),
    ...(startedAt !== undefined ? { firstRunAt: startedAt } : {}),
    ...(Object.keys(routineOrders).length > 0 ? { routineOrders } : {}),
    version: SAVE_VERSION,
    updatedAt: Date.now(),
  };
}

export function mergeStats(current: CampaignStats, next: CampaignStats): CampaignStats {
  return {
    runs: Math.max(current.runs, next.runs),
    passes: Math.max(current.passes, next.passes),
    fails: Math.max(current.fails, next.fails),
  };
}

export function mergeProgress(
  current: LevelProgress | undefined,
  next: LevelProgress,
): LevelProgress {
  if (!current) return next;
  const merged: LevelProgress = {
    completed: current.completed || next.completed,
    medal: betterMedal(current.medal, next.medal),
    stars: [...new Set([...current.stars, ...next.stars])],
    attempts: Math.max(current.attempts, next.attempts),
  };
  const objectives = [...new Set([...(current.objectives ?? []), ...(next.objectives ?? [])])];
  if (objectives.length > 0) merged.objectives = objectives;
  const code = next.code ?? current.code;
  if (code !== undefined) merged.code = code;
  const hints = Math.max(current.hintsRevealed ?? 0, next.hintsRevealed ?? 0);
  if (hints > 0) merged.hintsRevealed = hints;
  if (current.seedsUnlocked === true || next.seedsUnlocked === true) merged.seedsUnlocked = true;
  const ticks = minDefined(current.bestTicks, next.bestTicks);
  if (ticks !== undefined) merged.bestTicks = ticks;
  const clearedAt = minDefined(current.clearedAt, next.clearedAt);
  if (clearedAt !== undefined) merged.clearedAt = clearedAt;
  return merged;
}

const MEDAL_RANK: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

export function betterMedal(a: Medal, b: Medal): Medal {
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

function minDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isMedal(value: unknown): value is Medal {
  return value === 'gold' || value === 'silver' || value === 'bronze' || value === 'none';
}

function clampFraction(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0.15, Math.min(0.85, value));
}
