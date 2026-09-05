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
import type { PrintEvent, Trace, Verdict, Medal } from '../engine/index.ts';
import { evaluateObjectives, replayTo, reviveTrace, usesFuel } from '../engine/index.ts';
import type { PerSeedResult, RuntimeFailure } from '../runtime/protocol.ts';
import { WORKER_TIMEOUT_MS } from '../runtime/protocol.ts';
import type { LevelDef } from '../levels/index.ts';
import { campaignOrder, getLevel, hardwareUnlockedBy, nextLevel } from '../levels/index.ts';
import type { RendererPort, RunnerPort } from './ports.ts';
import { FakeRenderer, FakeRunner } from './ports.ts';
import type { RunFacts } from './achievements.ts';
import { earnedBy, isSenseBudget } from './achievements.ts';
import type { LevelProgress, SaveFile } from './save.ts';
import { emptyProgress, importSave, loadSave, mergeProgress, writeSave } from './save.ts';
import { countChars, medalFor, objectivesOnEverySeed } from './score.ts';

export type Screen = 'levels' | 'workspace' | 'review';
export type RunState = 'idle' | 'running';
export type ConsoleKind = 'print' | 'system' | 'error' | 'success';

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
  setPanel(panel: 'brief' | 'console' | 'docs'): void;
  setDocsOpen(open: boolean): void;
  setLayout(patch: Partial<SaveFile['settings']['layout']>): void;

  run(): void;
  cancel(): void;
  dismissResults(): void;
  advanceToNextLevel(): void;
  signRequisition(): void;
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
 * Bonus objectives are worth a star (DESIGN.md §7) but the worker's verdict currently reports the
 * required objectives only. Evaluating the level's own bonus objectives against the returned
 * trace closes the gap without inventing a second scoring rule — it is the engine's evaluator,
 * run on the world the trace ends in. Delete this the day the verdict carries them.
 */
function withBonus(level: LevelDef, verdict: Verdict, trace: Trace): Verdict {
  const bonus = level.bonus ?? [];
  const reported = new Set(verdict.objectives.map((objective) => objective.id));
  const missing = bonus.filter((objective) => !reported.has(objective.id));
  if (missing.length === 0) return verdict;
  try {
    const revived = reviveTrace(trace);
    const context = {
      world: replayTo(revived, revived.endTick),
      trace: revived,
      initialWorld: revived.initialWorld,
    };
    return {
      ...verdict,
      objectives: [...verdict.objectives, ...evaluateObjectives(missing, context)],
    };
  } catch {
    return verdict;
  }
}

let lineId = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;

/** Moves the bot attempted and did not get. The elegant-solve commendation hangs on this being 0. */
function blockedMoveCount(trace: Trace): number {
  return trace.events.filter((event) => event.kind === 'move' && !event.ok).length;
}

function firstLevelId(): string | null {
  return campaignOrder()[0]?.id ?? null;
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
      const undelivered = level.hardware.filter(
        (name) => !get().save.seenRequisitions.includes(name),
      );
      set({
        screen: 'workspace',
        currentLevelId: levelId,
        code: stored?.code ?? level.starter,
        runState: 'idle',
        runToken: get().runToken + 1,
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

    setPanel(panel) {
      set({ brief: panel });
    },
    setDocsOpen(open) {
      set({ docsOpen: open });
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

      const token = state.runToken + 1;
      state.pause();
      set({
        runToken: token,
        runState: 'running',
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
          text: `run ${level.id} — ${level.seeds.length} seed${level.seeds.length === 1 ? '' : 's'}`,
        },
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
        .run({ code: state.code, levelId: level.id, seeds: [...level.seeds] })
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
          const message = error instanceof Error ? error.message : String(error);
          finishRun(token, { failure: { kind: 'runtime', message }, ...failedReport() });
          pushLines([{ t: 0, kind: 'error', text: message }]);
        });

      function applyResponse(
        levelDef: LevelDef,
        trace: Trace,
        rawVerdict: Verdict,
        results: PerSeedResult[],
      ): void {
        const verdict = withBonus(levelDef, rawVerdict, trace);
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

        const chars = countChars(get().code);
        const medal = medalFor(verdict.passed, verdict.stats.ticks, levelDef.par.ticks);
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
        recordResult(levelDef, verdict, medal, chars, trace, results);
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
        medal: Medal,
        chars: number,
        trace: Trace,
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
          medal: verdict.passed ? medal : previous.medal,
          stars: verdict.passed ? [...previous.stars, ...earned] : previous.stars,
          objectives: [...(previous.objectives ?? []), ...closed],
          ...(verdict.passed ? { bestTicks: verdict.stats.ticks, bestChars: chars } : {}),
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

        const worldMedals = campaignOrder()
          .filter((candidate) => candidate.world === levelDef.world)
          .map((candidate) => (levels[candidate.id] ?? emptyProgress()).medal);

        const facts: RunFacts = {
          passed: verdict.passed,
          medal,
          ticks: verdict.stats.ticks,
          parTicks: levelDef.par.ticks,
          attempt,
          blockedMoves: blockedMoveCount(trace),
          stars: earned.length,
          senseBudgetMet: verdict.objectives.some(
            (objective) => objective.met && isSenseBudget(objective.id),
          ),
          returnedForStar: previous.completed && previous.stars.length === 0 && earned.length > 0,
          ...(previous.bestTicks !== undefined ? { previousBestTicks: previous.bestTicks } : {}),
          worldMedals,
        };

        const achievements = { ...state.save.achievements };
        const fresh: string[] = [];
        const now = Date.now();
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
        persist({ ...get().save, levels, stats, achievements });
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

    setCelebrations(on) {
      persist({
        ...get().save,
        settings: { ...get().save.settings, celebrations: on },
      });
    },

    award(id) {
      const save = get().save;
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

/** A level is open once the level before it in campaign order has been closed. */
export function isLevelUnlocked(save: SaveFile, levelId: string): boolean {
  const order = campaignOrder();
  const index = order.findIndex((level) => level.id === levelId);
  if (index <= 0) return index === 0;
  const previous = order[index - 1];
  return previous ? (save.levels[previous.id]?.completed ?? false) : false;
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
