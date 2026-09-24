import { create } from 'zustand';
import type {
  EventOrigin,
  PrintEvent,
  Snapshot,
  Trace,
  TraceEvent,
  Verdict,
} from '../engine/index.ts';
import { Medal, eventIndexAt, usesFuel } from '../engine/index.ts';
import type { PerSeedResult, RuntimeFailure, TraceShape } from '../runtime/protocol.ts';
import { WORKER_TIMEOUT_MS } from '../runtime/protocol.ts';
import { findModuleStatements } from '../runtime/index.ts';
import type { LevelDef } from '../levels/index.ts';
import { campaignOrder, getLevel, hardwareUnlockedBy, nextLevel } from '../levels/index.ts';
import type { RendererPort, RunnerPort } from './ports.ts';
import { FakeRenderer, FakeRunner } from './ports.ts';
import type { RunFacts } from './achievements.ts';
import { earnedBy, getAchievement, isSenseBudget } from './achievements.ts';
import type { LevelProgress, SaveFile } from './save.ts';
import { emptyProgress, importSave, loadSave, mergeProgress, writeSave } from './save.ts';
import { medalForLevel, medalOf, objectivesOnEverySeed, ticksOnSeeds } from './score.ts';

export type Screen = 'levels' | 'workspace';
export type RunState = 'idle' | 'running';
export type ConsoleKind = 'print' | 'system' | 'error' | 'success' | 'notice';

export interface AuditSeeds {
  seeds: readonly number[];
  note: string;
}

export interface HeldRun {
  trace: Trace;
  tick: number;
  endTick: number;
}

export interface BlockedLevel {
  levelId: string;
  reason: 'locked' | 'unknown';
}

export interface ConsoleLine {
  id: number;
  t: number;
  kind: ConsoleKind;
  text: string;
  line?: number;
  values?: Snapshot[];
}

export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];

export const BASE_TICKS_PER_SECOND = 4;

// The 5000ms worker default is not enough to record an attributed trace on the heaviest levels.
export const DEBUG_TIMEOUT_MS = 20_000;

const UI_WATCHDOG_MS = WORKER_TIMEOUT_MS + 2000;

const DEBUG_WATCHDOG_MS = DEBUG_TIMEOUT_MS + 2000;

export const SOURCE_NAMES: Readonly<Record<EventOrigin['file'], string>> = {
  program: 'program',
  lib: 'lib.ts',
};

export interface GameState {
  screen: Screen;
  currentLevelId: string | null;
  blocked: BlockedLevel | null;
  save: SaveFile;
  code: string;

  runState: RunState;
  runToken: number;
  runMode: 'dispatch' | 'preview' | 'debug' | null;
  previewState: RunState;
  trace: Trace | null;
  verdict: Verdict | null;
  seedResults: PerSeedResult[];
  traceSeed: number | null;
  failedSeed: number | null;
  failure: RuntimeFailure | null;
  showResults: boolean;
  resultId: number;
  failureCursor: number;
  freshAchievements: string[];
  personalBest: { previous: number; now: number } | null;
  requisition: { levelId: string; hardware: string[] } | null;
  auditSeeds: Readonly<Record<string, AuditSeeds>>;
  surveySeed: number | null;
  heldRun: HeldRun | null;

  tick: number;
  endTick: number;
  playing: boolean;
  speed: number;
  eventCursor: number | null;
  debugNote: string | null;

  console: ConsoleLine[];
  consoleFilter: 'all' | 'print' | 'system';
  suppressed: number;

  docsOpen: boolean;
  brief: 'brief' | 'console' | 'docs' | 'library';

  attachRunner(runner: RunnerPort): void;
  attachRenderer(renderer: RendererPort): void;
  runner(): RunnerPort;
  renderer(): RendererPort;

  goto(screen: Screen): void;
  openLevel(levelId: string): void;
  setCode(code: string): void;
  resetCode(): void;
  revealHint(count: number): void;
  unlockSeeds(): void;
  showSeed(seed: number | null): void;
  setPanel(panel: 'brief' | 'console' | 'docs' | 'library'): void;
  setDocsOpen(open: boolean): void;
  setLayout(patch: Partial<SaveFile['settings']['layout']>): void;
  setAuditSeeds(seeds: Readonly<Record<string, AuditSeeds>>): void;

  run(): void;
  cancel(): void;
  preview(): void;
  debugRun(): void;
  resetPreview(): void;
  dismissResults(): void;
  advanceToNextLevel(): void;
  signRequisition(): void;
  fileReview(rank: number): void;
  setCelebrations(on: boolean): void;
  award(id: string): void;

  seek(tick: number): void;
  step(delta: number): void;
  stepEvent(delta: number): void;
  seekToEvent(index: number): void;
  seekToLine(file: EventOrigin['file'], line: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  setSpeed(speed: number): void;
  jumpToFailure(): void;

  setConsoleFilter(filter: 'all' | 'print' | 'system'): void;
  clearConsole(): void;

  importSaveFile(text: string): void;
  replaceSave(save: SaveFile): void;
}

export function runSeeds(own: readonly number[], audit?: AuditSeeds): number[] {
  if (!audit) return [...own];
  return [...own, ...audit.seeds.filter((seed) => !own.includes(seed))];
}

export function earnsSeedSurvey(
  level: LevelDef,
  medal: Medal | null,
  earned: readonly string[],
): boolean {
  if (medal !== Medal.Gold) return false;
  return (level.bonus ?? []).every((objective) => earned.includes(objective.id));
}

export interface SurveyView {
  surveySeed: number | null;
  heldRun: HeldRun | null;
  trace: Trace | null;
  tick: number;
  endTick: number;
}

// The renderer only draws a preview world while it holds no trace, so surveying a seed has to
// take the run's trace off the board — and hand it back untouched when the survey closes.
export function surveyTransition(current: SurveyView, seed: number | null): SurveyView {
  if (seed === null) {
    const held = current.heldRun;
    return {
      surveySeed: null,
      heldRun: null,
      trace: held?.trace ?? current.trace,
      tick: held?.tick ?? current.tick,
      endTick: held?.endTick ?? current.endTick,
    };
  }
  const held =
    current.heldRun ??
    (current.trace ? { trace: current.trace, tick: current.tick, endTick: current.endTick } : null);
  return { surveySeed: seed, heldRun: held, trace: null, tick: 0, endTick: 0 };
}

// Only a graded dispatch is worth holding aside. A single-seed run belongs to the one seed it
// ran, so drawing a different seed drops it rather than handing it back later as "the run".
export function holdableRun(view: SurveyView, runMode: GameState['runMode']): SurveyView {
  if (view.heldRun !== null || runMode === 'dispatch') return view;
  return { ...view, trace: null, tick: 0, endTick: 0 };
}

// The first index past every event that has already happened at `tick`. The board at tick T
// shows the outcome of every event with t <= T, so all of those are behind the cursor.
function eventsThrough(trace: Trace, tick: number): number {
  let after = eventIndexAt(trace, tick);
  while (after < trace.events.length && (trace.events[after] as TraceEvent).t <= tick) after += 1;
  return after;
}

// Several events can share a tick, so which one is being looked at is not derivable from the
// tick. The held index is believed only while it still names an event at `tick` — a scrub or a
// frame of playback moves the tick out from under it and the cursor re-derives from the board.
export function stepEventCursor(
  trace: Trace,
  tick: number,
  held: number | null,
  delta: number,
): number | null {
  const events = trace.events;
  if (events.length === 0) return null;

  const anchored =
    held !== null && held >= 0 && held < events.length && events[held]?.t === tick ? held : null;
  const index = (anchored ?? eventsThrough(trace, tick) - 1) + delta;
  return index >= 0 && index < events.length ? index : null;
}

export function resolveEventCursor(trace: Trace, tick: number, held: number | null): number | null {
  return stepEventCursor(trace, tick, held, 0);
}

export function firstEventFromLine(
  trace: Trace,
  file: EventOrigin['file'],
  line: number,
): number | null {
  for (const [index, event] of trace.events.entries()) {
    if (event.origin?.file === file && event.origin.line === line) return index;
  }
  return null;
}

export function traceIsAttributed(trace: Trace): boolean {
  return trace.events.some((event) => event.origin !== undefined);
}

let lineId = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let primePending = false;
let primeGeneration = 0;

let lastDispatched: { levelId: string; attempt: number; source: string } | null = null;

function firstLevelId(): string | null {
  return campaignOrder()[0]?.id ?? null;
}

const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

const ONE_CALL = /^(?:return\s+)?[A-Za-z_$][\w$]*\s*\([^()]*\)\s*;?$/;

function dispatchedNothing(source: string): boolean {
  return source.replace(COMMENT, '').trim().length === 0;
}

function withoutImports(source: string): string {
  let out = '';
  let cursor = 0;
  for (const statement of findModuleStatements(source)) {
    if (statement.keyword !== 'import') continue;
    out += source.slice(cursor, statement.start);
    cursor = statement.end;
  }
  return out + source.slice(cursor);
}

function dispatchedOneCall(source: string): boolean {
  return ONE_CALL.test(withoutImports(source).replace(COMMENT, '').trim());
}

function foldShapes(results: readonly PerSeedResult[]): TraceShape {
  if (results.length === 0) return { moves: 0, printed: false, markedUnread: false, sensed: 0 };
  return {
    moves: results.reduce((most, result) => Math.max(most, result.shape.moves), 0),
    printed: results.every((result) => result.shape.printed),
    markedUnread: results.every((result) => result.shape.markedUnread),
    sensed: results.reduce((most, result) => Math.max(most, result.shape.sensed), 0),
  };
}

function routinesCalled(results: readonly PerSeedResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    for (const [name, use] of Object.entries(result.libraryUsage?.calls ?? {})) {
      if (use.calls > 0) names.add(name);
    }
  }
  return [...names];
}

function routinesCharged(results: readonly PerSeedResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    for (const [name, use] of Object.entries(result.libraryUsage?.calls ?? {})) {
      if (use.ticks > 0) names.add(name);
    }
  }
  return [...names];
}

// An audit layout is not on the work order's schedule, so it may gate the close but never grade it.
function onScheduleVerdict(
  level: LevelDef,
  acrossSeeds: Verdict,
  results: readonly PerSeedResult[],
): Verdict {
  const ticks = ticksOnSeeds(results, level.seeds);
  if (ticks === null || ticks === acrossSeeds.stats.ticks) return acrossSeeds;
  return { ...acrossSeeds, stats: { ...acrossSeeds.stats, ticks } };
}

function allClosed(group: readonly LevelDef[], levels: Record<string, LevelProgress>): boolean {
  return group.length > 0 && group.every((level) => levels[level.id]?.completed === true);
}

function allStarred(group: readonly LevelDef[], levels: Record<string, LevelProgress>): boolean {
  if (!allClosed(group, levels)) return false;
  return group.every((level) => {
    const stars = levels[level.id]?.stars ?? [];
    return (level.bonus ?? []).every((bonus) => stars.includes(bonus.id));
  });
}

function allAtPar(group: readonly LevelDef[], levels: Record<string, LevelProgress>): boolean {
  if (!allClosed(group, levels)) return false;
  return group.every((level) => {
    const progress = levels[level.id] as LevelProgress;
    const medal = medalOf(level, progress);
    return medal === null || medal === Medal.Gold;
  });
}

function sectorsClosed(order: readonly LevelDef[], levels: Record<string, LevelProgress>): number {
  const worlds = [...new Set(order.map((level) => level.world))];
  return worlds.filter((world) =>
    allClosed(
      order.filter((level) => level.world === world),
      levels,
    ),
  ).length;
}

function closedElsewhere(
  order: readonly LevelDef[],
  levels: Record<string, LevelProgress>,
  level: LevelDef,
  source: string,
): boolean {
  if (source.trim().length === 0) return false;
  return order.some((other) => {
    const progress = levels[other.id];
    return other.world !== level.world && progress?.completed === true && progress.code === source;
  });
}

export const useGame = create<GameState>((set, get) => {
  let runner: RunnerPort | null = null;
  let renderer: RendererPort | null = null;
  let unsubscribeRenderer: (() => void) | null = null;

  const save = loadSave();
  const startLevel = firstLevelId();

  function persist(next: SaveFile): void {
    writeSave(next);
    set({ save: next });
  }

  function pushLines(lines: Omit<ConsoleLine, 'id'>[]): void {
    set((state) => ({
      console: [...state.console, ...lines.map((line) => ({ ...line, id: lineId++ }))].slice(-4000),
    }));
  }

  function clearWatchdog(): void {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  }

  function finishRun(token: number, patch: Partial<GameState>): void {
    if (get().runToken !== token) return;
    clearWatchdog();
    set({ runState: 'idle', ...patch });
  }

  function finishPreview(token: number, patch: Partial<GameState>): void {
    if (get().runToken !== token) return;
    clearWatchdog();
    set({ previewState: 'idle', ...patch });
  }

  function cancelPreview(): void {
    const state = get();
    clearWatchdog();
    set({ runToken: state.runToken + 1, previewState: 'idle' });
    try {
      state.runner().cancel();
    } catch {
      // A host that cannot even be cancelled is still not allowed to hold the shell.
    }
  }

  function failedReport(): Partial<GameState> {
    const save = get().save;
    persist({
      ...save,
      stats: { ...save.stats, runs: save.stats.runs + 1, fails: save.stats.fails + 1 },
    });
    return {
      showResults: true,
      resultId: get().resultId + 1,
      failureCursor: get().failureCursor + 1,
      freshAchievements: [],
      personalBest: null,
    };
  }

  function cancelPrime(): void {
    primePending = false;
    primeGeneration += 1;
  }

  // The seed a single-seed run runs: the one being surveyed, or the order's own first.
  function chosenSeed(): number | null {
    const state = get();
    const level = state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
    if (!level) return null;
    return state.surveySeed ?? (level.seeds[0] as number);
  }

  // The preview, the survey's Dispatch and the debug run are one mechanism: run a single seed,
  // show the trace, grade nothing, write nothing. `debug` only asks for attribution on top.
  //
  // Nothing here reaches recordResult or persist, and showResults stays false, so no medal,
  // star, attempt, best or close-out can come of it. A verdict from one seed is not a verdict:
  // the medal folds worst-seed per objective across the whole schedule.
  function oneSeedRun(seed: number, debug: boolean): void {
    const word = debug ? 'debug' : 'single-seed';
    if (get().runState === 'running') return;
    if (get().previewState === 'running') {
      cancelPreview();
      pushLines([{ t: 0, kind: 'system', text: `${word} run cancelled` }]);
      return;
    }
    const state = get();
    const level = state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
    if (!level) return;

    const seeds = [seed];
    const token = state.runToken + 1;
    cancelPrime();
    state.pause();
    set({
      runToken: token,
      previewState: 'running',
      runMode: debug ? 'debug' : 'preview',
      failure: null,
      verdict: null,
      seedResults: [],
      traceSeed: null,
      failedSeed: null,
      showResults: false,
      eventCursor: null,
      debugNote: null,
    });
    pushLines([
      { t: 0, kind: 'system', text: `${word} run ${level.id} — seed ${String(seed)}, ungraded` },
    ]);

    clearWatchdog();
    watchdog = setTimeout(
      () => {
        finishPreview(token, {
          failure: {
            kind: 'timeout',
            message:
              'Your program did not halt. We stopped it. We would like this noted on the record.',
          },
        });
        pushLines([
          { t: 0, kind: 'error', text: 'HALT notice filed. The host did not answer in time.' },
        ]);
      },
      debug ? DEBUG_WATCHDOG_MS : UI_WATCHDOG_MS,
    );

    state
      .runner()
      .run({
        code: state.code,
        levelId: level.id,
        seeds,
        ...(debug ? { debug: true, timeoutMs: DEBUG_TIMEOUT_MS } : {}),
      })
      .then((response) => {
        if (get().runToken !== token) return;
        if (!response.ok) {
          if (response.error.kind === 'cancelled') {
            finishPreview(token, {});
            return;
          }
          finishPreview(token, { failure: response.error });
          pushLines([{ t: 0, kind: 'error', text: response.error.message }]);
          return;
        }

        const { trace, verdict, results, traceSeed, failedSeed } = response;
        const cap = get().save.settings.consoleCap;
        const prints = trace.events.filter((event): event is PrintEvent => event.kind === 'print');
        const shown = prints.slice(0, cap);
        const notices = trace.events.flatMap((event) => {
          const text = actionNotice(event);
          return text ? [{ t: event.t, kind: 'notice' as const, text }] : [];
        });
        pushLines(
          [
            ...shown.map((event) => ({
              t: event.t,
              kind: 'print' as const,
              text: event.text,
              ...(event.line !== undefined ? { line: event.line } : {}),
              ...(event.values !== undefined ? { values: event.values } : {}),
            })),
            ...notices,
          ].sort((a, b) => a.t - b.t),
        );
        pushLines([
          {
            t: trace.endTick,
            kind: verdict.passed ? 'success' : 'error',
            text: `${word} run complete — ${verdict.stats.ticks} ticks on seed ${String(seed)}, ungraded`,
          },
        ]);

        get().renderer().setTrace(trace);
        get().renderer().seek(0);
        set({
          trace,
          verdict,
          seedResults: results,
          traceSeed,
          failedSeed: failedSeed ?? null,
          suppressed: Math.max(0, prints.length - shown.length),
          tick: 0,
          endTick: trace.endTick,
          eventCursor: null,
          debugNote: null,
          showResults: false,
        });
        finishPreview(token, {});
        // A debug run is for stepping, so it stops on the first frame instead of playing away
        // from the line the player came to read.
        if (!debug) get().play();
      })
      .catch((error: unknown) => {
        if (get().runToken !== token) return;
        const message = error instanceof Error ? error.message : String(error);
        finishPreview(token, { failure: { kind: 'runtime', message } });
        pushLines([{ t: 0, kind: 'error', text: message }]);
      });
  }

  // The transport cannot move without a trace, and nothing runs a half-typed program to get
  // one: the board is cleared on an edit and the step the player presses pays for the run,
  // landing on `landOn`.
  function primeTrace(levelId: string, code: string, landOn: number): void {
    const level = getLevel(levelId);
    if (!level) return;
    const seed = get().surveySeed ?? (level.seeds[0] as number);
    const token = get().runToken;
    const generation = primeGeneration;
    primePending = true;
    get()
      .runner()
      .run({ code, levelId, seeds: [seed] })
      .then((response) => {
        if (get().runToken !== token || primeGeneration !== generation) return;
        primePending = false;
        // The board moved to another seed while this ran, so this trace is of the wrong world.
        if ((get().surveySeed ?? (level.seeds[0] as number)) !== seed) return;
        if (!response.ok) {
          if (response.error.kind !== 'cancelled') set({ debugNote: response.error.message });
          return;
        }
        get().renderer().setTrace(response.trace);
        set({
          trace: response.trace,
          verdict: response.verdict,
          tick: 0,
          endTick: response.trace.endTick,
        });
        get().seek(landOn);
      })
      .catch((error: unknown) => {
        if (primeGeneration !== generation) return;
        primePending = false;
        set({ debugNote: error instanceof Error ? error.message : String(error) });
      });
  }

  return {
    screen: 'levels',
    currentLevelId: startLevel,
    blocked: null,
    save,
    code: startLevel ? (save.levels[startLevel]?.code ?? getLevel(startLevel)?.starter ?? '') : '',

    runState: 'idle',
    runToken: 0,
    runMode: null,
    previewState: 'idle',
    trace: null,
    verdict: null,
    seedResults: [],
    traceSeed: null,
    failedSeed: null,
    failure: null,
    showResults: false,
    resultId: 0,
    failureCursor: 0,
    freshAchievements: [],
    personalBest: null,
    requisition: null,
    auditSeeds: {},
    surveySeed: null,
    heldRun: null,

    tick: 0,
    endTick: 0,
    playing: false,
    speed: save.settings.speed,
    eventCursor: null,
    debugNote: null,

    console: [],
    consoleFilter: 'all',
    suppressed: 0,

    docsOpen: false,
    brief: 'brief',

    attachRunner(next) {
      runner?.dispose();
      runner = next;
    },
    attachRenderer(next) {
      unsubscribeRenderer?.();
      renderer?.dispose();
      renderer = next;
      unsubscribeRenderer = next.onTick((tick, playing) => set({ tick, playing }));
      const level = currentLevel(get());
      if (level) next.setWorld(level.world);
      const trace = get().trace;
      if (trace) {
        next.setTrace(trace);
        next.seek(get().tick);
      }
    },
    runner() {
      if (!runner) runner = new FakeRunner();
      return runner;
    },
    renderer() {
      if (!renderer) renderer = new FakeRenderer();
      return renderer;
    },

    goto(screen) {
      get().pause();
      set({ screen, blocked: null });
    },

    openLevel(levelId) {
      const level = getLevel(levelId);
      if (!level) {
        get().pause();
        set({ screen: 'levels', blocked: { levelId, reason: 'unknown' } });
        return;
      }
      if (!isLevelUnlocked(get().save, levelId)) {
        get().pause();
        set({ screen: 'levels', blocked: { levelId, reason: 'locked' } });
        return;
      }
      const stored = get().save.levels[levelId];
      get().pause();
      get().renderer().setWorld(level.world);
      get().renderer().setTrace(null);
      get().runner().prepare(levelId);
      clearWatchdog();
      cancelPrime();
      const undelivered = level.hardware;
      set({
        screen: 'workspace',
        currentLevelId: levelId,
        blocked: null,
        code: stored?.code ?? level.starter,
        runState: 'idle',
        runToken: get().runToken + 1,
        runMode: null,
        previewState: 'idle',
        trace: null,
        verdict: null,
        seedResults: [],
        traceSeed: null,
        failedSeed: null,
        failure: null,
        showResults: false,
        freshAchievements: [],
        personalBest: null,
        requisition: undelivered.length > 0 ? { levelId, hardware: undelivered } : null,
        surveySeed: null,
        heldRun: null,
        tick: 0,
        endTick: 0,
        eventCursor: null,
        debugNote: null,
        console: [],
        suppressed: 0,
        brief: 'brief',
      });
    },

    setCode(code) {
      const id = get().currentLevelId;
      const changed = code !== get().code;
      if (changed && get().trace !== null) get().resetPreview();
      // A survey has the run off the board, so the edit retires it there instead.
      else if (changed && get().heldRun !== null) set({ heldRun: null });
      set({ code });
      if (!id) return;
      const levels = { ...get().save.levels };
      levels[id] = { ...(levels[id] ?? emptyProgress()), code };
      persist({ ...get().save, levels });
    },

    resetCode() {
      const id = get().currentLevelId;
      const level = id ? getLevel(id) : undefined;
      if (level) get().setCode(level.starter);
    },

    revealHint(count) {
      const id = get().currentLevelId;
      if (!id) return;
      const levels = { ...get().save.levels };
      const progress = levels[id] ?? emptyProgress();
      if ((progress.hintsRevealed ?? 0) >= count) return;
      levels[id] = { ...progress, hintsRevealed: count };
      persist({ ...get().save, levels });
    },

    unlockSeeds() {
      const id = get().currentLevelId;
      if (!id) return;
      const levels = { ...get().save.levels };
      const progress = levels[id] ?? emptyProgress();
      if (progress.seedsUnlocked === true) return;
      levels[id] = { ...progress, seedsUnlocked: true };
      persist({ ...get().save, levels });
    },

    showSeed(seed) {
      const state = get();
      const level = currentLevel(state);
      if (!level || seed === state.surveySeed) return;
      if (seed !== null && !level.seeds.includes(seed)) return;
      if (seed !== null && state.save.levels[level.id]?.seedsUnlocked !== true) return;

      cancelPrime();
      state.pause();
      const next = surveyTransition(
        seed === null ? state : holdableRun(state, state.runMode),
        seed,
      );
      state.renderer().setTrace(next.trace);
      if (next.trace) state.renderer().seek(next.tick);
      set({ ...next, eventCursor: null, debugNote: null });
    },

    setPanel(panel) {
      set({ brief: panel });
    },
    setDocsOpen(open) {
      set({ docsOpen: open });
    },
    setAuditSeeds(seeds) {
      set({ auditSeeds: seeds });
    },

    setLayout(patch) {
      const settings = {
        ...get().save.settings,
        layout: { ...get().save.settings.layout, ...patch },
      };
      persist({ ...get().save, settings });
    },

    run() {
      if (get().runState === 'running') {
        get().cancel();
        return;
      }
      // Dispatch while a seed is on the board runs that seed. It cannot grade: a medal folds
      // worst-seed per objective across the whole schedule, so one seed decides nothing.
      const surveyed = get().surveySeed;
      if (surveyed !== null) {
        oneSeedRun(surveyed, false);
        return;
      }
      const state = get();
      const level = state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
      if (!level) return;

      const audit = state.auditSeeds[level.id];
      const seeds = runSeeds(level.seeds, audit);
      const token = state.runToken + 1;
      cancelPrime();
      state.pause();
      set({
        runToken: token,
        runState: 'running',
        runMode: 'dispatch',
        failure: null,
        verdict: null,
        seedResults: [],
        traceSeed: null,
        failedSeed: null,
        showResults: false,
        freshAchievements: [],
        personalBest: null,
        eventCursor: null,
        debugNote: null,
        console: [],
        suppressed: 0,
      });
      pushLines([
        {
          t: 0,
          kind: 'system',
          text: `run ${level.id} — ${seeds.length} seed${seeds.length === 1 ? '' : 's'}`,
        },
        ...(audit && seeds.length > level.seeds.length
          ? [{ t: 0, kind: 'system' as const, text: audit.note }]
          : []),
      ]);

      clearWatchdog();
      watchdog = setTimeout(() => {
        finishRun(token, {
          failure: {
            kind: 'timeout',
            message:
              'Your program did not halt. We stopped it. We would like this noted on the record.',
          },
          ...failedReport(),
        });
        pushLines([
          { t: 0, kind: 'error', text: 'HALT notice filed. The host did not answer in time.' },
        ]);
      }, UI_WATCHDOG_MS);

      state
        .runner()
        .run({ code: state.code, levelId: level.id, seeds })
        .then((response) => {
          if (get().runToken !== token) return;
          if (!response.ok) {
            if (response.error.kind === 'cancelled') {
              finishRun(token, {});
              return;
            }
            finishRun(token, { failure: response.error, ...failedReport() });
            pushLines([{ t: 0, kind: 'error', text: response.error.message }]);
            return;
          }
          applyResponse(level, response.trace, response.verdict, response.results);
          set({
            traceSeed: response.traceSeed,
            failedSeed: response.failedSeed ?? null,
          });
          finishRun(token, {});
        })
        .catch((error: unknown) => {
          if (get().runToken !== token) return;
          const message = error instanceof Error ? error.message : String(error);
          finishRun(token, { failure: { kind: 'runtime', message }, ...failedReport() });
          pushLines([{ t: 0, kind: 'error', text: message }]);
        });

      function applyResponse(
        levelDef: LevelDef,
        trace: Trace,
        acrossSeeds: Verdict,
        results: PerSeedResult[],
      ): void {
        const verdict = onScheduleVerdict(levelDef, acrossSeeds, results);
        const cap = get().save.settings.consoleCap;
        const prints = trace.events.filter((event): event is PrintEvent => event.kind === 'print');
        const shown = prints.slice(0, cap);
        const notices = trace.events.flatMap((event) => {
          const text = actionNotice(event);
          return text ? [{ t: event.t, kind: 'notice' as const, text }] : [];
        });
        pushLines(
          [
            ...shown.map((event) => ({
              t: event.t,
              kind: 'print' as const,
              text: event.text,
              ...(event.line !== undefined ? { line: event.line } : {}),
              ...(event.values !== undefined ? { values: event.values } : {}),
            })),
            ...notices,
          ].sort((a, b) => a.t - b.t),
        );

        const medal = medalForLevel(levelDef, verdict.passed, verdict.stats.ticks);
        pushLines([
          {
            t: trace.endTick,
            kind: verdict.passed ? 'success' : 'error',
            text: verdict.passed
              ? `work order closed — ${verdict.stats.ticks} ticks`
              : (verdict.failure?.message ?? 'Run complete. The objective is still open.'),
          },
        ]);

        get().renderer().setTrace(trace);
        get().renderer().seek(trace.endTick);
        set({
          trace,
          verdict,
          seedResults: results,
          suppressed: Math.max(0, prints.length - shown.length),
          tick: trace.endTick,
          endTick: trace.endTick,
          eventCursor: null,
          debugNote: null,
          showResults: true,
          resultId: get().resultId + 1,
          ...(verdict.passed ? {} : { failureCursor: get().failureCursor + 1 }),
        });
        recordResult(levelDef, verdict, medal, results);
      }

      function recordResult(
        levelDef: LevelDef,
        verdict: Verdict,
        medal: Medal | null,
        results: PerSeedResult[],
      ): void {
        const state = get();
        const levels = { ...state.save.levels };
        const previous = levels[levelDef.id] ?? emptyProgress();
        const bonusIds = (levelDef.bonus ?? []).map((objective) => objective.id);
        const earned = verdict.objectives
          .filter((objective) => objective.met && bonusIds.includes(objective.id))
          .map((objective) => objective.id);
        const attempt = previous.attempts + 1;

        const closed = objectivesOnEverySeed(
          results,
          levelDef.objectives.map((objective) => objective.id),
        );

        const next: LevelProgress = mergeProgress(previous, {
          ...previous,
          attempts: attempt,
          completed: previous.completed || verdict.passed,
          medal: verdict.passed ? (medal ?? Medal.None) : previous.medal,
          stars: verdict.passed ? [...previous.stars, ...earned] : previous.stars,
          objectives: [...(previous.objectives ?? []), ...closed],
          ...(verdict.passed ? { bestTicks: verdict.stats.ticks } : {}),
          ...(verdict.passed && !previous.clearedAt ? { clearedAt: Date.now() } : {}),
          ...(verdict.passed && earnsSeedSurvey(levelDef, medal, earned)
            ? { seedsUnlocked: true }
            : {}),
          code: get().code,
        });
        next.attempts = attempt;
        levels[levelDef.id] = next;

        const stats = { ...state.save.stats, runs: state.save.stats.runs + 1 };
        if (verdict.passed) {
          stats.passes += 1;
        } else {
          stats.fails += 1;
        }

        const now = Date.now();
        const source = get().code;
        const unchanged =
          lastDispatched?.levelId === levelDef.id &&
          lastDispatched.attempt === previous.attempts &&
          lastDispatched.source === source;
        lastDispatched = { levelId: levelDef.id, attempt, source };

        const routineOrders = { ...state.save.routineOrders };
        const called = routinesCalled(results);
        if (verdict.passed) {
          for (const name of routinesCharged(results)) {
            const orders = routineOrders[name] ?? [];
            if (!orders.includes(levelDef.id)) routineOrders[name] = [...orders, levelDef.id];
          }
        }

        const order = campaignOrder();
        const sector = order.filter((level) => level.world === levelDef.world);
        const shape = foldShapes(results);
        const startedAt = state.save.firstRunAt;
        const onSchedule = results.filter((result) => levelDef.seeds.includes(result.seed));
        const beaten =
          verdict.passed &&
          previous.bestTicks !== undefined &&
          verdict.stats.ticks < previous.bestTicks;

        const facts: RunFacts = {
          passed: verdict.passed,
          attempt,
          senseBudgetMet: verdict.objectives.some(
            (objective) => objective.met && isSenseBudget(objective.id),
          ),
          world: levelDef.world,
          ticks: verdict.stats.ticks,
          parTicks: medal === null ? null : levelDef.par.ticks,
          beatOwnBest: beaten,
          seeds: levelDef.seeds.length,
          seedsPassed: onSchedule.filter((result) => result.passed).length,
          moves: shape.moves,
          sensed: shape.sensed,
          printed: shape.printed,
          markedUnread: shape.markedUnread,
          emptyProgram: dispatchedNothing(source),
          unchanged,
          routineCalled: called.length > 0,
          routineOrders: Math.max(0, ...Object.values(routineOrders).map((ids) => ids.length)),
          singleCall: dispatchedOneCall(source),
          sameProgramOtherSector: closedElsewhere(order, levels, levelDef, source),
          sectorClosed: allClosed(sector, levels),
          sectorsClosed: sectorsClosed(order, levels),
          sectorAtPar: allAtPar(sector, levels),
          sectorStarred: allStarred(sector, levels),
          siteClosed: allClosed(order, levels),
          siteStarred: allStarred(order, levels),
        };

        const achievements = { ...state.save.achievements };
        const fresh: string[] = [];
        for (const id of earnedBy(facts)) {
          if (achievements[id] !== undefined) continue;
          achievements[id] = now;
          fresh.push(id);
        }

        set({
          freshAchievements: fresh,
          personalBest: beaten
            ? { previous: previous.bestTicks as number, now: verdict.stats.ticks }
            : null,
        });
        persist({
          ...get().save,
          levels,
          stats,
          achievements,
          firstRunAt: startedAt ?? now,
          ...(Object.keys(routineOrders).length > 0 ? { routineOrders } : {}),
        });
      }
    },

    cancel() {
      const state = get();
      clearWatchdog();
      set({ runToken: state.runToken + 1, runState: 'idle' });
      try {
        state.runner().cancel();
      } catch {
        // A host that cannot even be cancelled is still not allowed to hold the shell.
      }
      pushLines([{ t: 0, kind: 'system', text: 'run cancelled' }]);
    },

    preview() {
      const seed = chosenSeed();
      if (seed !== null) oneSeedRun(seed, false);
    },

    debugRun() {
      const seed = chosenSeed();
      if (seed !== null) oneSeedRun(seed, true);
    },

    resetPreview() {
      const state = get();
      cancelPrime();
      if (state.previewState === 'running') cancelPreview();
      else if (state.runState === 'running') state.cancel();

      get().pause();
      get().renderer().setTrace(null);
      set({
        trace: null,
        verdict: null,
        seedResults: [],
        traceSeed: null,
        failedSeed: null,
        surveySeed: null,
        heldRun: null,
        tick: 0,
        endTick: 0,
        eventCursor: null,
        debugNote: null,
        runMode: null,
        showResults: false,
        failure: null,
        console: [],
        suppressed: 0,
      });
    },

    dismissResults() {
      set({ showResults: false });
    },

    advanceToNextLevel() {
      const id = get().currentLevelId;
      const next = id ? nextLevel(id) : undefined;
      set({ showResults: false });
      if (next) get().openLevel(next.id);
      else get().goto('levels');
    },

    signRequisition() {
      set({ requisition: null });
    },

    fileReview(rank) {
      const save = get().save;
      if (save.reviewedRanks.includes(rank)) return;
      persist({ ...save, reviewedRanks: [...save.reviewedRanks, rank].sort((a, b) => a - b) });
    },

    setCelebrations(on) {
      persist({
        ...get().save,
        settings: { ...get().save.settings, celebrations: on },
      });
    },

    award(id) {
      const save = get().save;
      if (getAchievement(id) === undefined) return;
      if (save.achievements[id] !== undefined) return;
      persist({ ...save, achievements: { ...save.achievements, [id]: Date.now() } });
      set({ freshAchievements: [...get().freshAchievements, id] });
    },

    // Every cursor move lands here, including the renderer's and the conductor's, so the event
    // cursor is dropped on the way through and re-derived from the tick by whoever reads it.
    seek(tick) {
      const clamped = Math.max(0, Math.min(get().endTick, tick));
      set({ tick: clamped, eventCursor: null, debugNote: null });
      get().renderer().seek(clamped);
    },

    step(delta) {
      const state = get();
      state.pause();
      if (state.trace === null) {
        if (state.runState === 'running' || state.previewState === 'running' || primePending) {
          return;
        }
        if (state.currentLevelId === null) return;
        set({ debugNote: 'Running the program.' });
        primeTrace(state.currentLevelId, state.code, Math.max(0, delta));
        return;
      }
      get().seek(Math.round(state.tick) + delta);
    },

    stepEvent(delta) {
      const state = get();
      const trace = state.trace;
      if (!trace) return;
      state.pause();
      const index = stepEventCursor(trace, state.tick, state.eventCursor, delta);
      if (index === null) {
        set({ debugNote: delta < 0 ? 'No earlier event.' : 'No later event.' });
        return;
      }
      get().seekToEvent(index);
    },

    seekToEvent(index) {
      const event = get().trace?.events[index];
      if (!event) return;
      get().pause();
      get().seek(event.t);
      set({ eventCursor: index });
    },

    seekToLine(file, line) {
      const trace = get().trace;
      if (!trace) {
        set({ debugNote: 'No run to step through.' });
        return;
      }
      const index = firstEventFromLine(trace, file, line);
      if (index === null) {
        const where = `${SOURCE_NAMES[file]} line ${String(line)}`;
        set({
          debugNote: traceIsAttributed(trace)
            ? `No event came from ${where}.`
            : 'This run recorded no lines. Dispatch a debug run.',
        });
        return;
      }
      get().seekToEvent(index);
    },

    play() {
      if (get().endTick <= 0) return;
      if (get().speed === Infinity) {
        get().seek(get().endTick);
        return;
      }
      if (get().tick >= get().endTick) get().seek(0);
      set({ playing: true, eventCursor: null, debugNote: null });
      get()
        .renderer()
        .play(get().speed * BASE_TICKS_PER_SECOND);
    },

    pause() {
      if (get().playing) set({ playing: false });
      get().renderer().pause();
    },

    togglePlay() {
      if (get().trace === null) {
        get().preview();
        return;
      }
      if (get().playing) get().pause();
      else get().play();
    },

    setSpeed(speed) {
      set({ speed });
      persist({ ...get().save, settings: { ...get().save.settings, speed } });
      if (speed === Infinity) {
        get().pause();
        get().seek(get().endTick);
        return;
      }
      if (get().playing)
        get()
          .renderer()
          .play(speed * BASE_TICKS_PER_SECOND);
    },

    jumpToFailure() {
      const trace = get().trace;
      if (!trace) return;
      get().pause();
      get().seek(trace.endTick);
      set({ showResults: false });
    },

    setConsoleFilter(filter) {
      set({ consoleFilter: filter });
    },

    clearConsole() {
      set({ console: [], suppressed: 0 });
    },

    importSaveFile(text) {
      get().replaceSave(importSave(get().save, text));
    },

    replaceSave(next) {
      persist(next);
      const id = get().currentLevelId;
      if (id) set({ code: next.levels[id]?.code ?? getLevel(id)?.starter ?? '' });
    },
  };
});

export function currentLevel(state: GameState): LevelDef | undefined {
  return state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
}

export function progressFor(state: GameState, levelId: string): LevelProgress {
  return state.save.levels[levelId] ?? emptyProgress();
}

export const LEVELS_OPENED_BY_A_CLOSE = 2;

export function isLevelUnlocked(save: SaveFile, levelId: string): boolean {
  const order = campaignOrder();
  const index = order.findIndex((level) => level.id === levelId);
  if (index < 0) return false;
  if (index === 0) return true;

  let deepestClosed = -1;
  for (const [at, level] of order.entries()) {
    if (save.levels[level.id]?.completed) deepestClosed = at;
  }
  if (deepestClosed >= 0 && index <= deepestClosed + LEVELS_OPENED_BY_A_CLOSE) return true;

  const world = order[index]?.world;
  if (world === undefined) return false;
  const before = order.filter((candidate) => candidate.world === world - 1);
  return before.length > 0 && before.every((c) => save.levels[c.id]?.completed === true);
}

export interface LockReason {
  opensOnClosing: string | null;
  previousWorld: number | null;
  outstanding: string[];
}

export function lockReason(save: SaveFile, levelId: string): LockReason | null {
  const order = campaignOrder();
  const index = order.findIndex((level) => level.id === levelId);
  if (index < 0 || isLevelUnlocked(save, levelId)) return null;

  const world = order[index]?.world ?? 0;
  const before = order.filter((candidate) => candidate.world === world - 1);
  return {
    opensOnClosing: order[Math.max(0, index - LEVELS_OPENED_BY_A_CLOSE)]?.id ?? null,
    previousWorld: before.length > 0 ? world - 1 : null,
    outstanding: before
      .filter((candidate) => !save.levels[candidate.id]?.completed)
      .map((candidate) => candidate.id),
  };
}

export function unlockedHardware(levelId: string): string[] {
  return hardwareUnlockedBy(levelId);
}

export function levelUsesFuel(level: LevelDef): boolean {
  try {
    return usesFuel(level.build(level.seeds[0] ?? 1));
  } catch {
    return false;
  }
}

export function visibleConsole(
  lines: readonly ConsoleLine[],
  filter: GameState['consoleFilter'],
  upToTick: number,
): ConsoleLine[] {
  return lines.filter((line) => {
    if (filter === 'print' && line.kind !== 'print') return false;
    if (filter === 'system' && line.kind === 'print') return false;
    const gated = line.kind === 'print' || line.kind === 'notice';
    return !gated || line.t <= upToTick;
  });
}

export function actionNotice(event: TraceEvent): string | null {
  switch (event.kind) {
    case 'harvest':
      if (event.reason === 'full') return 'No room in the hopper. Swung anyway.';
      return null;
    default:
      return null;
  }
}
