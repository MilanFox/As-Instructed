/**
 * Player progress in localStorage, plus JSON export/import.
 *
 * Two rules govern everything here:
 *  1. Player code is never lost. Any read path that cannot understand the stored shape still
 *     rescues every string that looks like source before giving up.
 *  2. The shape is versioned from the first release and only ever moves forward through
 *     `MIGRATIONS`, one step per version, so a save written by any past build still loads.
 */
import { Medal } from '../engine/index.ts';

export const SAVE_KEY = 'bootstrap.save';
export const SAVE_VERSION = 2;

export interface LevelProgress {
  /** The player's source, exactly as last typed. Sacred. */
  code?: string;
  completed: boolean;
  medal: Medal;
  /** Bonus objective ids ever met on this level. */
  stars: string[];
  bestTicks?: number;
  /**
   * Shortest source ever submitted for this order. Kept because a save must never lose a number a
   * past build wrote — but it is **not** scored, ranked, or compared to anything. DESIGN.md §7.
   */
  bestChars?: number;
  attempts: number;
  /** Epoch ms of the first passing run. */
  clearedAt?: number;
}

export interface Layout {
  /** Editor column width as a fraction of the workspace. */
  editorFraction: number;
  /** Viewport height as a fraction of the right-hand column. */
  viewportFraction: number;
}

export interface Settings {
  layout: Layout;
  /** Last playback speed the player chose. */
  speed: number;
  /** Console line cap. */
  consoleCap: number;
  /**
   * Whether the run report escalates or arrives all at once.
   *
   * Off is a first-class choice, not a degraded one: a player on their fortieth work order has
   * seen the objectives tick off and does not need to see it again. `prefers-reduced-motion`
   * forces the same behaviour without touching this flag, so the OS setting and the player's
   * setting never fight over which one wins.
   */
  celebrations: boolean;
}

/**
 * Campaign-wide counters. Nothing here is ever spent, deducted, or shown as a penalty — a failed
 * run costs the player time and nothing else (`fails` exists to celebrate persistence, not to
 * scold), which is the whole reason it is safe to count them.
 */
export interface CampaignStats {
  runs: number;
  passes: number;
  fails: number;
  /** Work orders closed in a row with no failed run in between. Reset by a failure, never by time. */
  streak: number;
  bestStreak: number;
}

export interface SaveFile {
  version: number;
  updatedAt: number;
  levels: Record<string, LevelProgress>;
  settings: Settings;
  /** Commendation id to the epoch ms it was earned. Append-only; nothing here is ever removed. */
  achievements: Record<string, number>;
  stats: CampaignStats;
  /** Hardware names whose requisition note has already been signed for. */
  seenRequisitions: string[];
}

export const DEFAULT_LAYOUT: Layout = { editorFraction: 0.44, viewportFraction: 0.58 };

export function emptyStats(): CampaignStats {
  return { runs: 0, passes: 0, fails: 0, streak: 0, bestStreak: 0 };
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
    seenRequisitions: [],
  };
}

export function emptyProgress(): LevelProgress {
  return { completed: false, medal: Medal.None, stars: [], attempts: 0 };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * One entry per version step, keyed by the version being migrated *from*. A save at version `n`
 * runs every step from `n` upward until it reaches `SAVE_VERSION`.
 *
 * Version 0 is the unversioned shape: any object whose values are level ids mapped to source
 * strings, which is what an early build wrote and what a hand-edited export tends to look like.
 */
type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  0: (raw) => ({
    version: 1,
    updatedAt: Date.now(),
    levels: rescueLevels(raw),
    settings: emptySave().settings,
  }),
  /*
   * Commendations, streaks and requisition history arrive in version 2.
   *
   * A version 1 save has closed work orders but no record of *how* they were closed, so the
   * commendations that can be reconstructed honestly are reconstructed and the rest are simply not
   * awarded. Handing a returning player fifteen commendations for runs nobody watched would be
   * worth less than earning one, and pretending we know their streak would be a lie.
   */
  1: (raw) => ({
    ...raw,
    version: 2,
    achievements: reconstructAchievements(rescueLevels(raw)),
    stats: reconstructStats(rescueLevels(raw)),
    seenRequisitions: [],
  }),
};

/**
 * The commendations a version 1 save can prove. `medal` and `clearedAt` are the only two fields
 * that survived, so this awards exactly the two that follow from them and nothing else.
 */
function reconstructAchievements(levels: Record<string, LevelProgress>): Record<string, number> {
  const earned: Record<string, number> = {};
  for (const progress of Object.values(levels)) {
    if (!progress.completed) continue;
    const at = progress.clearedAt ?? Date.now();
    earned['filed'] = Math.min(earned['filed'] ?? at, at);
    if (progress.medal === Medal.Gold) {
      earned['within-budget'] = Math.min(earned['within-budget'] ?? at, at);
    }
  }
  return earned;
}

function reconstructStats(levels: Record<string, LevelProgress>): CampaignStats {
  const stats = emptyStats();
  for (const progress of Object.values(levels)) {
    stats.runs += progress.attempts;
    if (progress.completed) stats.passes++;
  }
  stats.fails = Math.max(0, stats.runs - stats.passes);
  return stats;
}

/** Pulls every recoverable level record out of an unknown blob. Never throws. */
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
    if (isMedal(value['medal'])) progress.medal = value['medal'];
    if (Array.isArray(value['stars'])) {
      progress.stars = value['stars'].filter((s): s is string => typeof s === 'string');
    }
    if (isPositive(value['bestTicks'])) progress.bestTicks = value['bestTicks'];
    if (isPositive(value['bestChars'])) progress.bestChars = value['bestChars'];
    if (isPositive(value['attempts'])) progress.attempts = value['attempts'];
    if (isPositive(value['clearedAt'])) progress.clearedAt = value['clearedAt'];
    levels[id] = progress;
  }
  return levels;
}

/**
 * Normalises anything into a current-version `SaveFile`.
 *
 * A save from a *newer* build is not thrown away either: its levels are rescued field by field,
 * so downgrading costs settings, never code.
 */
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
    seenRequisitions: rescueStrings(working['seenRequisitions']),
  };
}

/** Commendations are timestamps. A junk value still counts as earned, dated now. */
function rescueAchievements(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const earned: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) {
    if (typeof id !== 'string' || id.length === 0) continue;
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
  if (isPositive(raw['streak'])) stats.streak = raw['streak'];
  if (isPositive(raw['bestStreak'])) stats.bestStreak = raw['bestStreak'];
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  return stats;
}

function rescueStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((value): value is string => typeof value === 'string'))];
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

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

/** Parses save JSON. Corrupt input yields an empty save rather than an exception. */
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

export function exportSave(save: SaveFile): string {
  return JSON.stringify({ ...save, version: SAVE_VERSION }, null, 2);
}

/**
 * Import replaces settings but merges levels, keeping the better result on each side.
 *
 * Commendations, counters and requisition history merge the same way progress does: a
 * commendation earned on either side is earned, dated from whichever side earned it first. An
 * import can raise a total. It can never lower one.
 */
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

  return {
    ...incoming,
    levels,
    achievements,
    stats: mergeStats(current.stats, incoming.stats),
    seenRequisitions: [...new Set([...current.seenRequisitions, ...incoming.seenRequisitions])],
    version: SAVE_VERSION,
    updatedAt: Date.now(),
  };
}

/** The live streak comes from the incoming save — it is the one describing the more recent play. */
export function mergeStats(current: CampaignStats, next: CampaignStats): CampaignStats {
  return {
    runs: Math.max(current.runs, next.runs),
    passes: Math.max(current.passes, next.passes),
    fails: Math.max(current.fails, next.fails),
    streak: next.streak,
    bestStreak: Math.max(current.bestStreak, next.bestStreak, next.streak),
  };
}

/** Keeps the better of two records. Incoming code wins, because import is an explicit act. */
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
  const code = next.code ?? current.code;
  if (code !== undefined) merged.code = code;
  const ticks = minDefined(current.bestTicks, next.bestTicks);
  if (ticks !== undefined) merged.bestTicks = ticks;
  const chars = minDefined(current.bestChars, next.bestChars);
  if (chars !== undefined) merged.bestChars = chars;
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
