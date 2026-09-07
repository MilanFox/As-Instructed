/**
 * The single store the shell reads from. Zustand, one flat slice — the panels are all views of
 * the same run, and splitting them apart would only invent synchronisation bugs.
 *
 * The run state machine is the part that matters. It is `idle -> running -> idle`, and every
 * transition out of `running` is driven by a token comparison rather than by trusting the host:
 * a cancelled or superseded run is dropped whatever its promise eventually does, which is what
 * makes a wedged worker survivable (DESIGN.md §10.6).
 */
import { create } from 'zustand';
import type { PrintEvent, Trace, Verdict } from '../engine/index.ts';
import { Medal, usesFuel } from '../engine/index.ts';
import type { PerSeedResult, RuntimeFailure } from '../runtime/protocol.ts';
import { WORKER_TIMEOUT_MS } from '../runtime/protocol.ts';
import type { LevelDef } from '../levels/index.ts';
import { campaignOrder, getLevel, hardwareUnlockedBy, nextLevel } from '../levels/index.ts';
import type { RendererPort, RunnerPort } from './ports.ts';
import { FakeRenderer, FakeRunner } from './ports.ts';
import type { RunFacts } from './achievements.ts';
import { earnedBy, getAchievement, isSenseBudget } from './achievements.ts';
import type { LevelProgress, SaveFile } from './save.ts';
import { emptyProgress, importSave, loadSave, mergeProgress, writeSave } from './save.ts';
import { medalForLevel, objectivesOnEverySeed } from './score.ts';

export type Screen = 'levels' | 'workspace';
export type RunState = 'idle' | 'running';
export type ConsoleKind = 'print' | 'system' | 'error' | 'success';

/**
 * Layouts a work order has to close on that are not in its own `seeds`, and the line that says why.
 *
 * The campaign does not know who puts one here and must not find out: the write is one-directional
 * (`setAuditSeeds`), the read happens once inside `run()`, and nothing here imports the system that
 * raises them. That is the whole of the seam — `src/game/store.ts` importing `src/meta` would
 * invert the dependency and make the Repository non-optional.
 *
 * `note` travels with the seeds because the console line is the one place this is guaranteed to be
 * legible whatever the screens look like, and the campaign has no vocabulary for *why* an extra
 * layout is on the schedule.
 */
export interface AuditSeeds {
  seeds: readonly number[];
  /** One line, already in the raiser's voice. Printed to the console when the run starts. */
  note: string;
}

export interface ConsoleLine {
  id: number;
  t: number;
  kind: ConsoleKind;
  text: string;
  /** Source line, for print events that carry one. */
  line?: number;
}

/** Playback speeds the timeline offers. `Infinity` is "instant" — jump to the end. */
export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];

/** Ticks per second at 1x. Matches the renderer's own default, so 1x means what it draws. */
export const BASE_TICKS_PER_SECOND = 4;

/** The shell's own watchdog. The runtime has one too; this one only catches a host that never answers. */
const UI_WATCHDOG_MS = WORKER_TIMEOUT_MS + 2000;

export interface GameState {
  screen: Screen;
  currentLevelId: string | null;
  save: SaveFile;
  code: string;

  runState: RunState;
  /** Incremented on every run and on every cancel. Stale responses compare unequal and are dropped. */
  runToken: number;
  /** What the currently loaded `trace`/`verdict` came from — a real dispatch or a one-seed preview. */
  runMode: 'dispatch' | 'preview' | null;
  /** `preview()`'s own in-flight flag, apart from `runState` so a preview never lights up DISPATCH. */
  previewState: RunState;
  trace: Trace | null;
  verdict: Verdict | null;
  seedResults: PerSeedResult[];
  /** Which seed the loaded trace came from — the first failing one when there is one. */
  traceSeed: number | null;
  /** The first seed that failed, when any did. Generalization failures hinge on this. */
  failedSeed: number | null;
  failure: RuntimeFailure | null;
  /** Result of the most recent completed run, gating the results overlay. */
  showResults: boolean;
  /**
   * Bumped every time a report is raised. The report's flavour line is picked from this rather
   * than re-picked on render, so the wording holds still while it is being read.
   */
  resultId: number;
  /** How many runs have failed this session. Rotates the failure copy so it never repeats. */
  failureCursor: number;
  /** Commendations this run earned for the first time. Shown once, in the report. */
  freshCommendations: string[];
  /** Set when the run beat the player's own recorded tick count on this work order. */
  personalBest: { previous: number; now: number } | null;
  /**
   * Hardware delivered with the open work order that the player has not signed for yet.
   *
   * Getting `scan()` is a bigger moment than closing the work order that grants it, and it used to
   * be a line in a brief. It is now a delivery, and it waits until the workspace is actually open.
   */
  requisition: { levelId: string; hardware: string[] } | null;
  /**
   * Extra layouts, by work order id. Empty for a player who never opens the Repository.
   *
   * Kept in the store rather than read through a port so that a screen can say "this run includes
   * one you were not shown" without asking anybody who raised it.
   */
  auditSeeds: Readonly<Record<string, AuditSeeds>>;

  tick: number;
  endTick: number;
  playing: boolean;
  speed: number;

  console: ConsoleLine[];
  consoleFilter: 'all' | 'print' | 'system';
  /** Prints dropped because the run exceeded the console cap. */
  suppressed: number;

  docsOpen: boolean;
  brief: 'brief' | 'console' | 'docs';

  attachRunner(runner: RunnerPort): void;
  attachRenderer(renderer: RendererPort): void;
  runner(): RunnerPort;
  renderer(): RendererPort;

  goto(screen: Screen): void;
  openLevel(levelId: string): void;
  setCode(code: string): void;
  resetCode(): void;
  revealHint(count: number): void;
  setPanel(panel: 'brief' | 'console' | 'docs'): void;
  setDocsOpen(open: boolean): void;
  setLayout(patch: Partial<SaveFile['settings']['layout']>): void;
  /** Replaces the whole map. Written from outside; see `AuditSeeds`. */
  setAuditSeeds(seeds: Readonly<Record<string, AuditSeeds>>): void;

  run(): void;
  cancel(): void;
  /** Runs the program against the work order's first seed only, and autoplays it. No save side effects. */
  preview(): void;
  /** Clears whatever `run()` or `preview()` loaded, back to blank. Leaves `code` and `save` untouched. */
  resetPreview(): void;
  dismissResults(): void;
  advanceToNextLevel(): void;
  signRequisition(): void;
  /** Marks a Performance Review tier as read. A memo is delivered once per tier, ever. */
  fileReview(rank: number): void;
  setCelebrations(on: boolean): void;
  /** Records a commendation raised outside a run — the Repository's, mostly. Idempotent. */
  award(id: string): void;

  seek(tick: number): void;
  step(delta: number): void;
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

/**
 * The layouts one run has to close on: the work order's own, then any audit layout it does not
 * already contain.
 *
 * The order is the design. The runtime reports the *first* failing seed, so the work order's own
 * schedule is always answered first and an audit layout can only become the reported failure once
 * everything the level always asked for already passes. The player is never shown a layout they
 * were not told about while they still have an ordinary bug.
 */
export function runSeeds(own: readonly number[], audit?: AuditSeeds): number[] {
  if (!audit) return [...own];
  return [...own, ...audit.seeds.filter((seed) => !own.includes(seed))];
}

let lineId = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;

/**
 * The last program dispatched, for the one commendation that asks whether anything changed.
 *
 * Deliberately not in the save and not in the state: `save.levels[id].code` is rewritten on every
 * keystroke, so it always equals what is in the editor and can never answer "is this the same
 * program you sent last time". A session-scoped copy can, and losing it on reload costs nothing —
 * a commendation this build does not award today it awards tomorrow.
 *
 * `attempt` is what keeps it honest. It has to match the run count the order is *about* to leave
 * behind, so the record only ever describes the immediately preceding dispatch; a save that has
 * been replaced underneath it breaks the chain instead of speaking for a run it never saw.
 */
let lastDispatched: { levelId: string; attempt: number; source: string } | null = null;

function firstLevelId(): string | null {
  return campaignOrder()[0]?.id ?? null;
}

/**
 * Line and block comments, near enough.
 *
 * Not a lexer: a `//` inside a string literal reads as a comment here. Nothing is scored on the
 * result and the worst case is a fist-bump the player did not strictly earn, which is a better
 * failure than carrying a second tokeniser around for it.
 */
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function commentsIn(source: string): string[] {
  return (source.match(COMMENT) ?? []).map((text) => text.trim());
}

/** True when the program is whitespace, comments, or nothing at all. */
function dispatchedNothing(source: string): boolean {
  return source.replace(COMMENT, '').trim().length === 0;
}

/**
 * The handful of things a commendation asks of a trace, counted in one pass.
 *
 * All six are shapes rather than scores: nothing here is a budget, nothing is compared against par,
 * and none of it is shown anywhere. They exist so that the game can notice what a program did
 * rather than only whether it worked.
 */
interface TraceShape {
  moves: number;
  waited: number;
  turnsInPlace: number;
  onOneTile: number;
  printed: boolean;
  markedUnread: boolean;
}

function traceShape(trace: Trace | null): TraceShape {
  const shape: TraceShape = {
    moves: 0,
    waited: 0,
    turnsInPlace: 0,
    onOneTile: 0,
    printed: false,
    markedUnread: false,
  };
  if (!trace) return shape;

  const turning = new Map<number, number>();
  const gathers = new Map<string, number>();
  let marked = false;
  let readBack = false;

  for (const event of trace.events) {
    switch (event.kind) {
      case 'move': {
        turning.set(event.botId, 0);
        if (event.ok) shape.moves += 1;
        break;
      }
      case 'turn': {
        const spun = (turning.get(event.botId) ?? 0) + 1;
        turning.set(event.botId, spun);
        shape.turnsInPlace = Math.max(shape.turnsInPlace, spun);
        break;
      }
      case 'wait': {
        shape.waited += event.ticks;
        break;
      }
      case 'harvest':
      case 'mine': {
        const tile = `${event.at.x},${event.at.y}`;
        const worked = (gathers.get(tile) ?? 0) + 1;
        gathers.set(tile, worked);
        shape.onOneTile = Math.max(shape.onOneTile, worked);
        break;
      }
      case 'mark': {
        if (event.text !== null) marked = true;
        break;
      }
      case 'sense': {
        if (event.name === 'readMark') readBack = true;
        break;
      }
      case 'print': {
        shape.printed = true;
        break;
      }
      default:
        break;
    }
  }

  shape.markedUnread = marked && !readBack;
  return shape;
}

/** Published subroutines this run actually ran, across every layout. An import is not a call. */
function routinesCalled(results: readonly PerSeedResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    for (const [name, use] of Object.entries(result.libraryUsage?.calls ?? {})) {
      if (use.calls > 0) names.add(name);
    }
  }
  return [...names];
}

/** Every work order in a group is closed. */
function allClosed(group: readonly LevelDef[], levels: Record<string, LevelProgress>): boolean {
  return group.length > 0 && group.every((level) => levels[level.id]?.completed === true);
}

/**
 * Every bonus objective in a group has been met, and every order in it is closed.
 *
 * The close is part of the test rather than an extra: a group whose only bonus-bearing order is
 * starred would otherwise report "nothing left open" over two orders nobody has touched.
 */
function allStarred(group: readonly LevelDef[], levels: Record<string, LevelProgress>): boolean {
  if (!allClosed(group, levels)) return false;
  return group.every((level) => {
    const stars = levels[level.id]?.stars ?? [];
    return (level.bonus ?? []).every((bonus) => stars.includes(bonus.id));
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

  /** `finishRun`'s twin for `preview()` — the same token discipline, but idles `previewState` only. */
  function finishPreview(token: number, patch: Partial<GameState>): void {
    if (get().runToken !== token) return;
    clearWatchdog();
    set({ previewState: 'idle', ...patch });
  }

  /** Bumps past whatever `preview()` has in flight. Shared by `preview()`'s own toggle and `resetPreview()`. */
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

  /**
   * The state a report raised by a run that never produced a verdict carries.
   *
   * `failureCursor` advances on every failure and nothing else, which is what stops the flavour
   * line repeating while somebody debugs the same loop for the ninth time.
   */
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
      freshCommendations: [],
      personalBest: null,
    };
  }

  return {
    screen: 'levels',
    currentLevelId: startLevel,
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
    freshCommendations: [],
    personalBest: null,
    requisition: null,
    auditSeeds: {},

    tick: 0,
    endTick: 0,
    playing: false,
    speed: save.settings.speed,

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
      // The renderer owns the frame loop, so the shell mirrors its position rather than keeping
      // a second clock that would drift against the interpolation.
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
      set({ screen });
    },

    openLevel(levelId) {
      const level = getLevel(levelId);
      if (!level) return;
      const stored = get().save.levels[levelId];
      get().pause();
      get().renderer().setWorld(level.world);
      get().renderer().setTrace(null);
      get().runner().prepare(levelId);
      clearWatchdog();
      /* Everything this order's API surface holds that has not been signed for, not just what this
         order adds. Two orders are open at once now, so a player can arrive here having skipped
         the one that granted `scan` — and the scope they run against is cumulative either way.
         Delivering only `level.hardware` would hand them a command nobody announced. */
      const undelivered = hardwareUnlockedBy(levelId).filter(
        (name) => !get().save.seenRequisitions.includes(name),
      );
      set({
        screen: 'workspace',
        currentLevelId: levelId,
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
        freshCommendations: [],
        personalBest: null,
        requisition: undelivered.length > 0 ? { levelId, hardware: undelivered } : null,
        tick: 0,
        endTick: 0,
        console: [],
        suppressed: 0,
        brief: 'brief',
      });
    },

    setCode(code) {
      const id = get().currentLevelId;
      /*
       * A trace on the board is a recording of the code as it stood the moment `preview()` or
       * `run()` last read it. The instant that code changes underneath it, the recording is of a
       * program that no longer exists, and `togglePlay()` would resume it rather than trying the
       * edit — so an edit quietly clears it, the same clearing the player's own Reset (↺) does on
       * purpose, but fired automatically and without Reset's own visual say-so.
       */
      if (code !== get().code && get().trace !== null) get().resetPreview();
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
      const state = get();
      if (state.runState === 'running') {
        state.cancel();
        return;
      }
      const level = state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
      if (!level) return;

      const audit = state.auditSeeds[level.id];
      const seeds = runSeeds(level.seeds, audit);
      const token = state.runToken + 1;
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
        freshCommendations: [],
        personalBest: null,
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
            // A cancelled run is not a failure; the player already knows they stopped it.
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
        verdict: Verdict,
        results: PerSeedResult[],
      ): void {
        const cap = get().save.settings.consoleCap;
        const prints = trace.events.filter((event): event is PrintEvent => event.kind === 'print');
        const shown = prints.slice(0, cap);
        pushLines(
          shown.map((event) => ({
            t: event.t,
            kind: 'print' as const,
            text: event.text,
            ...(event.line !== undefined ? { line: event.line } : {}),
          })),
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

        // Land on the end of the trace: that is the world the program actually left behind, so
        // the objective rail reads true the moment the report is dismissed. Play rewinds.
        get().renderer().setTrace(trace);
        get().renderer().seek(trace.endTick);
        set({
          trace,
          verdict,
          seedResults: results,
          suppressed: Math.max(0, prints.length - shown.length),
          tick: trace.endTick,
          endTick: trace.endTick,
          showResults: true,
          resultId: get().resultId + 1,
          ...(verdict.passed ? {} : { failureCursor: get().failureCursor + 1 }),
        });
        recordResult(levelDef, verdict, medal, results);
      }

      /**
       * Folds the run into the save, and works out what the player should be told about it.
       *
       * Everything read from `previous` is read before the merge, because the personal-best
       * callout and the commendations are comparisons against the record *as it was* — a merge
       * that has already lowered `bestTicks` cannot tell you that you lowered it.
       */
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

        /* Banked whether the run passed or not. A failed run costs nothing (DESIGN.md §7.1), and
           an objective that held on every layout is closed work even when its neighbour is not. */
        const closed = objectivesOnEverySeed(
          results,
          levelDef.objectives.map((objective) => objective.id),
        );

        const next: LevelProgress = mergeProgress(previous, {
          ...previous,
          attempts: attempt,
          completed: previous.completed || verdict.passed,
          /* An ungraded work order stores no medal, ever. The save is where the site map, the
             Performance Review and the sector commendations all read from, so keeping `none`
             there is what makes every one of them ignore the level without knowing why. */
          medal: verdict.passed ? (medal ?? Medal.None) : previous.medal,
          stars: verdict.passed ? [...previous.stars, ...earned] : previous.stars,
          objectives: [...(previous.objectives ?? []), ...closed],
          ...(verdict.passed ? { bestTicks: verdict.stats.ticks } : {}),
          ...(verdict.passed && !previous.clearedAt ? { clearedAt: Date.now() } : {}),
          code: get().code,
        });
        next.attempts = attempt;
        levels[levelDef.id] = next;

        /*
         * A failed run costs nothing. It does not touch the medal, the best time, the stars, or a
         * single commendation already earned. That is the whole penalty model of this game and it
         * is deliberate: the loop this game is made of is run, watch it fail, fix it.
         */
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

        /* Append-only per routine, like `stars`: a subroutine used on an order has been used on it
           whatever any later run does. Recorded on a dispatch rather than on a close, because the
           question is what the program called, not whether it worked. */
        const routineOrders = { ...state.save.routineOrders };
        const called = routinesCalled(results);
        for (const name of called) {
          const orders = routineOrders[name] ?? [];
          if (!orders.includes(levelDef.id)) routineOrders[name] = [...orders, levelDef.id];
        }

        const order = campaignOrder();
        const sector = order.filter((level) => level.world === levelDef.world);
        const starter = new Set(commentsIn(levelDef.starter));
        const shape = traceShape(state.trace);
        const startedAt = state.save.firstRunAt;

        const facts: RunFacts = {
          passed: verdict.passed,
          attempt,
          senseBudgetMet: verdict.objectives.some(
            (objective) => objective.met && isSenseBudget(objective.id),
          ),
          returnedForStar: previous.completed && previous.stars.length === 0 && earned.length > 0,
          world: levelDef.world,
          ticks: verdict.stats.ticks,
          ops: verdict.stats.ops,
          /* `null` is A7's "no medal ever", and it is the one honest reading of par on a work
             order that carries no ladder. `medal` is not passed on: nothing below reads one. */
          parTicks: medal === null ? null : levelDef.par.ticks,
          seeds: results.length,
          seedsPassed: results.filter((result) => result.passed).length,
          waited: shape.waited,
          moves: shape.moves,
          turnsInPlace: shape.turnsInPlace,
          onOneTile: shape.onOneTile,
          printed: shape.printed,
          markedUnread: shape.markedUnread,
          emptyProgram: dispatchedNothing(source),
          wroteComment: commentsIn(source).some((text) => !starter.has(text)),
          unchanged,
          routineCalled: called.length > 0,
          routineOrders: Math.max(0, ...Object.values(routineOrders).map((ids) => ids.length)),
          sectorClosed: allClosed(sector, levels),
          sectorStarred: allStarred(sector, levels),
          siteClosed: allClosed(order, levels),
          siteStarred: allStarred(order, levels),
          unclosedRuns: stats.fails,
          hour: new Date(now).getHours(),
          laterDay:
            startedAt !== undefined &&
            new Date(startedAt).toDateString() !== new Date(now).toDateString(),
        };

        const achievements = { ...state.save.achievements };
        const fresh: string[] = [];
        for (const id of earnedBy(facts)) {
          if (achievements[id] !== undefined) continue;
          achievements[id] = now;
          fresh.push(id);
        }

        const beaten =
          verdict.passed &&
          previous.bestTicks !== undefined &&
          verdict.stats.ticks < previous.bestTicks;

        set({
          freshCommendations: fresh,
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
      // Bump the token first: whatever the host does next is already stale.
      set({ runToken: state.runToken + 1, runState: 'idle' });
      try {
        state.runner().cancel();
      } catch {
        // A host that cannot even be cancelled is still not allowed to hold the shell.
      }
      pushLines([{ t: 0, kind: 'system', text: 'run cancelled' }]);
    },

    /**
     * "Try it" — the one-seed roundtrip the playtest asked for, kept apart from `run()` so trying
     * something never touches the record. Only the level's first seed runs, never the audit
     * layouts (`AuditSeeds` is a dispatch-only concept), and success never calls `recordResult` or
     * `failedReport`: no medal, no attempt, no stat, no achievement is at stake here, on purpose.
     */
    preview() {
      const state = get();
      if (state.runState === 'running') return;
      if (state.previewState === 'running') {
        cancelPreview();
        pushLines([{ t: 0, kind: 'system', text: 'preview cancelled' }]);
        return;
      }
      const level = state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
      if (!level) return;

      const seeds = [level.seeds[0] as number];
      const token = state.runToken + 1;
      state.pause();
      set({
        runToken: token,
        previewState: 'running',
        runMode: 'preview',
        failure: null,
        verdict: null,
        seedResults: [],
        traceSeed: null,
        failedSeed: null,
        showResults: false,
      });
      pushLines([{ t: 0, kind: 'system', text: `preview ${level.id} — seed ${seeds[0]}` }]);

      clearWatchdog();
      watchdog = setTimeout(() => {
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
      }, UI_WATCHDOG_MS);

      state
        .runner()
        .run({ code: state.code, levelId: level.id, seeds })
        .then((response) => {
          if (get().runToken !== token) return;
          if (!response.ok) {
            // A cancelled preview is not a failure; the player already knows they stopped it.
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
          const prints = trace.events.filter(
            (event): event is PrintEvent => event.kind === 'print',
          );
          const shown = prints.slice(0, cap);
          pushLines(
            shown.map((event) => ({
              t: event.t,
              kind: 'print' as const,
              text: event.text,
              ...(event.line !== undefined ? { line: event.line } : {}),
            })),
          );
          pushLines([
            {
              t: trace.endTick,
              kind: verdict.passed ? 'success' : 'error',
              text: `preview complete — ${verdict.stats.ticks} ticks`,
            },
          ]);

          // Unlike a dispatch, which lands on the end so the objective rail reads the finished
          // state, a preview loads at the start and plays — the point is watching it happen.
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
            showResults: false,
          });
          finishPreview(token, {});
          get().play();
        })
        .catch((error: unknown) => {
          if (get().runToken !== token) return;
          const message = error instanceof Error ? error.message : String(error);
          finishPreview(token, { failure: { kind: 'runtime', message } });
          pushLines([{ t: 0, kind: 'error', text: message }]);
        });
    },

    resetPreview() {
      const state = get();
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
        tick: 0,
        endTick: 0,
        runMode: null,
        showResults: false,
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
      const pending = get().requisition;
      set({ requisition: null });
      if (!pending) return;
      const seen = [...new Set([...get().save.seenRequisitions, ...pending.hardware])];
      persist({ ...get().save, seenRequisitions: seen });
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
      /* A commendation this build does not issue is not recorded. The call sites live outside this
         module, so a retired id raised by one of them must stop here rather than be written and
         then dropped by the next load. */
      if (getAchievement(id) === undefined) return;
      if (save.achievements[id] !== undefined) return;
      persist({ ...save, achievements: { ...save.achievements, [id]: Date.now() } });
      set({ freshCommendations: [...get().freshCommendations, id] });
    },

    seek(tick) {
      const clamped = Math.max(0, Math.min(get().endTick, tick));
      set({ tick: clamped });
      get().renderer().seek(clamped);
    },

    step(delta) {
      get().pause();
      get().seek(Math.round(get().tick) + delta);
    },

    play() {
      if (get().endTick <= 0) return;
      if (get().speed === Infinity) {
        get().seek(get().endTick);
        return;
      }
      if (get().tick >= get().endTick) get().seek(0);
      set({ playing: true });
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

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function currentLevel(state: GameState): LevelDef | undefined {
  return state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
}

export function progressFor(state: GameState, levelId: string): LevelProgress {
  return state.save.levels[levelId] ?? emptyProgress();
}

/** Closing one work order opens the next two. DESIGN.md §6. */
export const LEVELS_OPENED_BY_A_CLOSE = 2;

/**
 * Whether a work order is on the board.
 *
 * Two live at a time rather than one, and closing a world puts the whole of the next world up.
 *
 * Strictly N−1 made every join in the campaign a single point of failure: a stuck player's only
 * legal move was to keep grinding the same order, and the hint ladder — which is finite and ends —
 * was the only other way out. This genre's answer to *stuck* is lateral movement, and the gate
 * removed it. Two open orders means being stuck is somewhere you leave and come back to.
 *
 * The teaching order survives, because the entitlement is bought with closes: reaching World 5
 * still means closing most of World 4. What does not survive is *not yet succeeding* closing a
 * door, which it never should have been able to do.
 */
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

export function unlockedHardware(levelId: string): string[] {
  return hardwareUnlockedBy(levelId);
}

/** Whether the level's world uses the fuel mechanic, which is the only time the gauge appears. */
export function levelUsesFuel(level: LevelDef): boolean {
  try {
    return usesFuel(level.build(level.seeds[0] ?? 1));
  } catch {
    return false;
  }
}

/**
 * Console lines as of a playback position. Prints appear at the tick they happened, so scrubbing
 * the trace scrubs the log with it.
 *
 * Not a store selector: it allocates, and a zustand selector that allocates re-renders forever.
 */
export function visibleConsole(
  lines: readonly ConsoleLine[],
  filter: GameState['consoleFilter'],
  upToTick: number,
): ConsoleLine[] {
  return lines.filter((line) => {
    if (filter === 'print' && line.kind !== 'print') return false;
    if (filter === 'system' && line.kind === 'print') return false;
    return line.kind !== 'print' || line.t <= upToTick;
  });
}
