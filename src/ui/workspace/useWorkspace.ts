import { useCallback, useMemo } from 'react';

import type { EventOrigin, Trace, Vec, Verdict, World } from '../../engine/index.ts';
import { replayTo } from '../../engine/index.ts';
import type { Budget, Meter } from '../../game/budgets.ts';
import { budgetFor } from '../../game/budgets.ts';
import { activeTrack, metAt, playbackFor, progressAt } from '../../game/playback.ts';
import { REVIEW_TIERS, isGraded } from '../../game/score.ts';
import type { ConsoleLine, GameState } from '../../game/store.ts';
import {
  SOURCE_NAMES,
  currentLevel,
  levelUsesFuel,
  resolveEventCursor,
  traceIsAttributed,
  unlockedHardware,
  useGame,
  visibleConsole,
} from '../../game/store.ts';
import type { LevelDef, LevelFact } from '../../levels/index.ts';
import { worldMeta } from '../../levels/index.ts';
import { REPOSITORY_ISSUE } from '../../meta/copy.ts';
import { useLibrary } from '../../meta/store.ts';
import type { ApiFunctionSpec, RuntimeFailure } from '../../runtime/index.ts';
import {
  PLAYER_API,
  apiFunctionsFor,
  requiredTypesFor,
  typeDeclarationFor,
} from '../../runtime/index.ts';
import { fillPlaceholders, reportFor } from '../screens/review.ts';
import { CATEGORIES, costLabel, levelCost } from '../reference/api.ts';
import type { LegendSection } from '../reference/legend.ts';
import { legendFor } from '../reference/legend.ts';
import { divergenceCells, divergenceLine } from '../feed/divergence.ts';
import { usePapers } from '../paper/papers.ts';
import type { ReportSnapshot } from '../report.ts';
import { useReport } from '../report.ts';

const TICK_OBJECTIVE = /\bticks?\b/i;

export interface ObjectiveRow {
  id: string;
  label: string;
  met: boolean;
  bonus: boolean;
  active: boolean;
  progress?: [number, number];
  cleared?: boolean;
  meter?: Meter;
  unit?: string;
  budget?: Budget;
}

export interface CrewRow {
  id: number;
  name: string;
  alive: boolean;
  clock: number;
  carrying: number;
  capacity: number;
  cargo: string | null;
  waiting: number;
}

export interface FuelRow {
  fuel: number;
  max: number;
}

export interface Targets {
  graded: boolean;
  par: number;
  ticks: number | null;
  hardStop: number | null;
  seeds: readonly number[];
  hasTickLimit: boolean;
}

export interface WorldRow {
  id: number;
  name: string;
  accentVar: string;
}

export interface BriefData {
  head: readonly [string, string];
  title: string;
  kicker: string;
  ask: readonly string[];
  facts: readonly LevelFact[];
  board: { fixed: readonly string[]; redrawn: readonly string[] } | null;
  prose: string;
  seeds: readonly number[];
}

export interface DebugView {
  index: number | null;
  total: number;
  kind: string | null;
  origin: EventOrigin | null;
  attributed: boolean;
  note: string | null;
}

// Why there is no line is three different facts, and the player is told which one it is: the
// run recorded none, the call was coalesced into one event, or the engine raised it itself.
function lineOf(debug: DebugView): string {
  if (debug.origin) {
    return `${SOURCE_NAMES[debug.origin.file]} line ${String(debug.origin.line)}`;
  }
  if (!debug.attributed) return 'no lines recorded — this run was not a debug run';
  if (debug.kind === 'sense') return 'no single line — these sense calls are coalesced';
  return 'no line — the engine raised this, not an API call';
}

// Counted in words, because the tick readout beside it is a padded 000/000 fraction and two
// cursors in one format read as one.
export function describeDebug(debug: DebugView): string {
  if (debug.note !== null) return debug.note;
  if (debug.total === 0) return 'no events recorded';
  if (debug.index === null) return `before the first of ${String(debug.total)} events`;
  const at = `event ${String(debug.index + 1)} of ${String(debug.total)} · ${debug.kind ?? '—'}`;
  return `${at} · ${lineOf(debug)}`;
}

export interface ReferenceEntry {
  name: string;
  signature: string;
  description: string;
  cost: string;
  category: string;
}

export interface TypeEntry {
  name: string;
  declaration: string;
  doc: string;
}

export interface NoticeData {
  id: string;
  kind: 'issue' | 'memo';
  rank: number | null;
  title: string;
  body: string;
  dot: string;
}

export interface WorkspaceData {
  level: LevelDef | null;
  world: WorldRow | null;

  code: string;
  setCode(code: string): void;
  resetCode(): void;

  runState: GameState['runState'];
  previewState: GameState['runState'];
  runMode: GameState['runMode'];
  traceSeed: number | null;
  ungraded: string | null;
  trace: Trace | null;
  grade: Verdict | null;
  failure: RuntimeFailure | null;
  board: World | null;

  tick: number;
  endTick: number;
  playing: boolean;
  speed: number;

  run(): void;
  cancel(): void;
  preview(): void;
  debugRun(): void;
  seek(tick: number): void;
  step(delta: number): void;
  stepEvent(delta: number): void;
  debug: DebugView;
  play(): void;
  pause(): void;
  togglePlay(): void;
  setSpeed(speed: number): void;
  jumpToFailure(): void;
  goto(screen: GameState['screen']): void;

  console: readonly ConsoleLine[];
  consoleFilter: GameState['consoleFilter'];
  suppressed: number;
  setConsoleFilter(filter: GameState['consoleFilter']): void;
  clearConsole(): void;

  objectives: readonly ObjectiveRow[];
  bonus: readonly ObjectiveRow[];
  crew: readonly CrewRow[];
  fuel: FuelRow | null;
  banked: readonly string[];
  bankedCount: number;
  targets: Targets;

  divergence: string | null;
  divergenceCells: readonly Vec[];

  brief: BriefData | null;
  hints: readonly string[];
  hintsRevealed: number;
  revealHint(count: number): void;

  seedsUnlocked: boolean;
  surveySeed: number | null;
  surveyHolding: boolean;
  unlockSeeds(): void;
  showSeed(seed: number | null): void;

  report: ReportSnapshot | null;
  closePending: boolean;
  closeOut(): void;

  showResults: boolean;
  dismissResults(): void;
  advanceToNextLevel(): void;
  personalBest: { previous: number; now: number } | null;
  freshAchievements: readonly string[];

  requisition: { levelId: string; hardware: string[] } | null;
  signRequisition(): void;

  notices: readonly NoticeData[];
  dismissNotice(id: string): void;

  reference: readonly ReferenceEntry[];
  types: readonly TypeEntry[];
  legend: readonly LegendSection[];
}

function signatureOf(fn: ApiFunctionSpec): string {
  const params = fn.params.map((param) => {
    const mark = param.optional === true && param.defaultValue === undefined ? '?' : '';
    const fallback = param.defaultValue === undefined ? '' : ` = ${param.defaultValue}`;
    return `${param.name}${mark}: ${param.type}${fallback}`;
  });
  return `${fn.name}(${params.join(', ')}): ${fn.returns}`;
}

const NO_HINTS: readonly string[] = [];
const NO_BANKED: readonly string[] = [];

export function useWorkspace(): WorkspaceData {
  const level = useGame(currentLevel) ?? null;
  const levelId = level?.id ?? null;

  const code = useGame((state) => state.code);
  const setCode = useGame((state) => state.setCode);
  const resetCode = useGame((state) => state.resetCode);

  const runState = useGame((state) => state.runState);
  const previewState = useGame((state) => state.previewState);
  const runMode = useGame((state) => state.runMode);
  const trace = useGame((state) => state.trace);
  const verdict = useGame((state) => state.verdict);
  const failure = useGame((state) => state.failure);
  const traceSeed = useGame((state) => state.traceSeed);

  // A preview writes a verdict of its own, so only a dispatched run has graded anything.
  const grade = runMode === 'dispatch' ? verdict : null;

  // What is on the board is a medal or it is not, and the player is told which without having
  // to work it out from which button they pressed.
  const ungraded =
    trace === null || runMode === 'dispatch' || runMode === null
      ? null
      : traceSeed === null
        ? 'one seed · ungraded'
        : `seed ${String(traceSeed)} · ungraded`;

  const tick = useGame((state) => state.tick);
  const endTick = useGame((state) => state.endTick);
  const playing = useGame((state) => state.playing);
  const speed = useGame((state) => state.speed);

  const run = useGame((state) => state.run);
  const cancel = useGame((state) => state.cancel);
  const preview = useGame((state) => state.preview);
  const debugRun = useGame((state) => state.debugRun);
  const seek = useGame((state) => state.seek);
  const step = useGame((state) => state.step);
  const stepEvent = useGame((state) => state.stepEvent);
  const eventCursor = useGame((state) => state.eventCursor);
  const debugNote = useGame((state) => state.debugNote);
  const play = useGame((state) => state.play);
  const pause = useGame((state) => state.pause);
  const togglePlay = useGame((state) => state.togglePlay);
  const setSpeed = useGame((state) => state.setSpeed);
  const jumpToFailure = useGame((state) => state.jumpToFailure);
  const goto = useGame((state) => state.goto);

  const allConsole = useGame((state) => state.console);
  const consoleFilter = useGame((state) => state.consoleFilter);
  const suppressed = useGame((state) => state.suppressed);
  const setConsoleFilter = useGame((state) => state.setConsoleFilter);
  const clearConsole = useGame((state) => state.clearConsole);

  const showResults = useGame((state) => state.showResults);
  const dismissResults = useGame((state) => state.dismissResults);
  const advanceToNextLevel = useGame((state) => state.advanceToNextLevel);
  const personalBest = useGame((state) => state.personalBest);
  const freshAchievements = useGame((state) => state.freshAchievements);
  const requisition = useGame((state) => state.requisition);
  const signRequisition = useGame((state) => state.signRequisition);
  const fileReview = useGame((state) => state.fileReview);
  const revealHint = useGame((state) => state.revealHint);

  const save = useGame((state) => state.save);
  const hintsRevealed = useGame((state) =>
    levelId ? (state.save.levels[levelId]?.hintsRevealed ?? 0) : 0,
  );
  const banked = useGame((state) =>
    levelId ? (state.save.levels[levelId]?.objectives ?? NO_BANKED) : NO_BANKED,
  );
  const starred = useGame((state) =>
    levelId ? (state.save.levels[levelId]?.stars ?? NO_BANKED) : NO_BANKED,
  );
  const seedsUnlocked = useGame((state) =>
    levelId ? state.save.levels[levelId]?.seedsUnlocked === true : false,
  );
  const surveySeed = useGame((state) => state.surveySeed);
  const surveyHolding = useGame((state) => state.heldRun !== null);
  const unlockSeeds = useGame((state) => state.unlockSeeds);
  const showSeed = useGame((state) => state.showSeed);

  const docs = usePapers((state) => state.docs);

  const flooredTick = Math.floor(tick);
  const playback = useMemo(() => playbackFor(level ?? undefined, trace), [level, trace]);
  const atEnd = !trace || flooredTick >= trace.endTick;
  const active = activeTrack(playback, flooredTick);

  const clearedIds = useMemo(() => new Set([...banked, ...starred]), [banked, starred]);

  const rows: ObjectiveRow[] = useMemo(() => {
    if (!level) return [];
    const bonusIds = new Set((level.bonus ?? []).map((objective) => objective.id));
    const reported = new Map(verdict?.objectives.map((o) => [o.id, o]) ?? []);
    const tracks = new Map((playback?.tracks ?? []).map((track) => [track.id, track]));
    const defs = [...level.objectives, ...(level.bonus ?? [])];
    return defs.map((objective) => {
      const result = reported.get(objective.id);
      const track = tracks.get(objective.id);
      const met = atEnd ? (result?.met ?? false) : track ? metAt(track, flooredTick) : false;
      const row: ObjectiveRow = {
        id: objective.id,
        label: result?.label ?? objective.label,
        met,
        bonus: bonusIds.has(objective.id),
        active: !atEnd && active?.id === objective.id,
        ...(clearedIds.has(objective.id) ? { cleared: true } : {}),
        ...(objective.meter ? { meter: objective.meter } : {}),
        ...(objective.unit ? { unit: objective.unit } : {}),
      };
      const live = track ? progressAt(track, flooredTick) : undefined;
      const progress = atEnd ? result?.progress : (live ?? result?.progress);
      if (progress) row.progress = progress;
      const budget = budgetFor(row, {
        trace,
        tick: flooredTick,
        ...(verdict ? { stats: verdict.stats } : {}),
        ...(track ? { history: track.progress } : {}),
      });
      if (budget) row.budget = budget;
      return row;
    });
  }, [level, verdict, playback, atEnd, active, flooredTick, trace, clearedIds]);

  const objectives = useMemo(() => rows.filter((row) => !row.bonus), [rows]);
  const bonus = useMemo(() => rows.filter((row) => row.bonus), [rows]);

  const bankedCount = useMemo(() => {
    if (!level) return 0;
    const ids = new Set(banked);
    return level.objectives.filter((objective) => ids.has(objective.id)).length;
  }, [level, banked]);

  const board = useMemo<World | null>(() => {
    if (trace) return replayTo(trace, flooredTick);
    return level ? level.build(surveySeed ?? (level.seeds[0] as number)) : null;
  }, [level, trace, flooredTick, surveySeed]);

  const attributed = useMemo(() => (trace ? traceIsAttributed(trace) : false), [trace]);

  const debug = useMemo<DebugView>(() => {
    const index = trace ? resolveEventCursor(trace, tick, eventCursor) : null;
    const event = index === null ? undefined : trace?.events[index];
    return {
      index,
      total: trace?.events.length ?? 0,
      kind: event?.kind ?? null,
      origin: event?.origin ?? null,
      attributed,
      note: debugNote,
    };
  }, [trace, tick, eventCursor, attributed, debugNote]);

  const showFuel = useMemo(() => (level ? levelUsesFuel(level) : false), [level]);
  const fuel = useMemo<FuelRow | null>(() => {
    if (!showFuel || !trace || !board) return null;
    const bot = board.bots.find((candidate) => Number.isFinite(candidate.fuelMax));
    return bot ? { fuel: bot.fuel, max: bot.fuelMax } : null;
  }, [showFuel, trace, board]);

  const crew = useMemo<CrewRow[]>(() => {
    if (!board) return [];
    return board.bots.map((bot) => {
      const carrying = bot.inventory.reduce((total, stack) => total + stack.count, 0);
      const kinds = new Set(bot.inventory.filter((stack) => stack.count > 0).map((s) => s.kind));
      return {
        id: bot.id,
        name: bot.name,
        alive: bot.alive,
        clock: Math.round(bot.clock),
        carrying,
        capacity: bot.capacity,
        cargo: kinds.size === 1 ? ([...kinds][0] ?? null) : null,
        waiting: bot.inbox.length,
      };
    });
  }, [board]);

  const targets = useMemo<Targets>(() => {
    if (!level) {
      return { graded: false, par: 0, ticks: null, hardStop: null, seeds: [], hasTickLimit: false };
    }
    const gradesTicks = level.objectives.some(
      (objective) => objective.meter?.kind === 'ticks' || TICK_OBJECTIVE.test(objective.label),
    );
    return {
      graded: isGraded(level),
      par: level.par.ticks,
      ticks: grade?.stats.ticks ?? null,
      hardStop: gradesTicks ? null : (level.budget?.maxTicks ?? null),
      seeds: level.seeds,
      hasTickLimit: gradesTicks || level.budget?.maxTicks !== undefined,
    };
  }, [level, grade]);

  const initialWorld = useMemo<World | null>(
    () =>
      trace?.initialWorld ?? (level ? level.build(surveySeed ?? (level.seeds[0] as number)) : null),
    [level, trace, surveySeed],
  );

  const legend = useMemo(() => legendFor(initialWorld), [initialWorld]);

  const posted = useReport((state) => state.report);
  const acknowledged = useReport((state) => state.acknowledged);
  // The store is cleared when the level changes, but not before the render that changes it.
  const report = posted && posted.levelId === levelId ? posted : null;
  const cause = report?.cause ?? null;
  const cells = useMemo(() => divergenceCells(cause, initialWorld), [cause, initialWorld]);
  const marking = cells.length > 0 && !playing && endTick > 0 && flooredTick >= endTick;
  const divergence = marking ? divergenceLine(cause, cells) : null;

  const closePending = report !== null && report.passed && !acknowledged;
  const closeOut = useCallback((): void => {
    useReport.getState().acknowledge();
  }, []);

  const brief = useMemo<BriefData | null>(() => {
    if (!level) return null;
    const meta = worldMeta(level.world);
    return {
      head: ['WORK ORDER', level.id.toUpperCase()],
      title: level.title,
      kicker: meta ? `${meta.name} · ${meta.subtitle}` : `WORLD ${String(level.world)}`,
      ask: level.objectives.map((objective) => objective.label),
      facts: level.facts ?? [],
      board: level.board ?? null,
      prose: level.brief,
      seeds: level.seeds,
    };
  }, [level]);

  const world = useMemo<WorldRow | null>(() => {
    if (!level) return null;
    const meta = worldMeta(level.world);
    return {
      id: level.world,
      name: meta?.name ?? `World ${String(level.world)}`,
      accentVar: `--world-${String(level.world)}`,
    };
  }, [level]);

  const reference = useMemo<ReferenceEntry[]>(() => {
    if (!level) return [];
    const installed = new Set(unlockedHardware(level.id));
    return PLAYER_API.functions
      .filter((fn) => installed.has(fn.name))
      .map((fn) => ({
        name: fn.name,
        signature: signatureOf(fn),
        description: fn.doc,
        cost: costLabel(levelCost(fn, level.costs)),
        category: CATEGORIES.find((entry) => entry.id === fn.category)?.label ?? 'Other',
      }));
  }, [level]);

  const types = useMemo<TypeEntry[]>(() => {
    if (!level) return [];
    const installed = apiFunctionsFor(unlockedHardware(level.id));
    return requiredTypesFor(installed).map((type) => ({
      name: type.name,
      declaration: typeDeclarationFor(type, installed),
      doc: type.doc,
    }));
  }, [level]);

  const notices = useMemo<NoticeData[]>(() => {
    const open: NoticeData[] = [];
    const review = reportFor(save);
    for (const doc of docs) {
      if (doc.filed) continue;
      if (doc.payload.kind === 'issue') {
        open.push({
          id: doc.id,
          kind: 'issue',
          rank: null,
          title: REPOSITORY_ISSUE.title,
          body: REPOSITORY_ISSUE.intro,
          dot: REPOSITORY_ISSUE.dot,
        });
        continue;
      }
      if (doc.payload.kind !== 'memo') continue;
      const rank = doc.payload.rank;
      const tier = REVIEW_TIERS.find((entry) => entry.rank === rank);
      if (!tier) continue;
      open.push({
        id: doc.id,
        kind: 'memo',
        rank,
        title: tier.grade,
        body: fillPlaceholders(tier.body, tier, review),
        dot: tier.dot,
      });
    }
    return open;
  }, [docs, save]);

  const dismissNotice = useCallback(
    (id: string): void => {
      const doc = usePapers.getState().docs.find((entry) => entry.id === id);
      if (!doc) return;
      if (doc.payload.kind === 'memo') {
        fileReview(doc.payload.rank);
        usePapers.getState().file(id, 'acknowledged');
        return;
      }
      useLibrary.getState().markBriefed();
      usePapers.getState().file(id, 'read');
    },
    [fileReview],
  );

  const consoleLines = useMemo(
    () => visibleConsole(allConsole, consoleFilter, trace ? flooredTick : Number.POSITIVE_INFINITY),
    [allConsole, consoleFilter, trace, flooredTick],
  );

  return {
    level,
    world,
    code,
    setCode,
    resetCode,
    runState,
    previewState,
    runMode,
    traceSeed,
    ungraded,
    trace,
    grade,
    failure,
    board,
    tick,
    endTick,
    playing,
    speed,
    run,
    cancel,
    preview,
    debugRun,
    seek,
    step,
    stepEvent,
    debug,
    play,
    pause,
    togglePlay,
    setSpeed,
    jumpToFailure,
    goto,
    console: consoleLines,
    consoleFilter,
    suppressed,
    setConsoleFilter,
    clearConsole,
    objectives,
    bonus,
    crew,
    fuel,
    banked,
    bankedCount,
    targets,
    divergence,
    divergenceCells: cells,
    brief,
    hints: level?.hints ?? NO_HINTS,
    hintsRevealed,
    revealHint,
    seedsUnlocked,
    surveySeed,
    surveyHolding,
    unlockSeeds,
    showSeed,
    report,
    closePending,
    closeOut,
    showResults,
    dismissResults,
    advanceToNextLevel,
    personalBest,
    freshAchievements,
    requisition,
    signRequisition,
    notices,
    dismissNotice,
    reference,
    types,
    legend,
  };
}
