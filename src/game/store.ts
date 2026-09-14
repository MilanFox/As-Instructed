import { create } from 'zustand';
import type { PrintEvent, Trace, TraceEvent, Verdict } from '../engine/index.ts';
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
export type ConsoleKind = 'print' | 'system' | 'error' | 'success' | 'notice';

export interface AuditSeeds {
  seeds: readonly number[];
  note: string;
}

export interface ConsoleLine {
  id: number;
  t: number;
  kind: ConsoleKind;
  text: string;
  line?: number;
}

export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];

export const BASE_TICKS_PER_SECOND = 4;

const UI_WATCHDOG_MS = WORKER_TIMEOUT_MS + 2000;

export interface GameState {
  screen: Screen;
  currentLevelId: string | null;
  save: SaveFile;
  code: string;

  runState: RunState;
  runToken: number;
  runMode: 'dispatch' | 'preview' | null;
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
  freshCommendations: string[];
  personalBest: { previous: number; now: number } | null;
  requisition: { levelId: string; hardware: string[] } | null;
  auditSeeds: Readonly<Record<string, AuditSeeds>>;

  tick: number;
  endTick: number;
  playing: boolean;
  speed: number;

  console: ConsoleLine[];
  consoleFilter: 'all' | 'print' | 'system';
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
  setAuditSeeds(seeds: Readonly<Record<string, AuditSeeds>>): void;

  run(): void;
  cancel(): void;
  preview(): void;
  resetPreview(): void;
  dismissResults(): void;
  advanceToNextLevel(): void;
  signRequisition(): void;
  fileReview(rank: number): void;
  setCelebrations(on: boolean): void;
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

export function runSeeds(own: readonly number[], audit?: AuditSeeds): number[] {
  if (!audit) return [...own];
  return [...own, ...audit.seeds.filter((seed) => !own.includes(seed))];
}

let lineId = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;

let lastDispatched: { levelId: string; attempt: number; source: string } | null = null;

function firstLevelId(): string | null {
  return campaignOrder()[0]?.id ?? null;
}

const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function commentsIn(source: string): string[] {
  return (source.match(COMMENT) ?? []).map((text) => text.trim());
}

function dispatchedNothing(source: string): boolean {
  return source.replace(COMMENT, '').trim().length === 0;
}

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

function routinesCalled(results: readonly PerSeedResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    for (const [name, use] of Object.entries(result.libraryUsage?.calls ?? {})) {
      if (use.calls > 0) names.add(name);
    }
  }
  return [...names];
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
      freshCommendations: [],
      personalBest: null,
    };
  }

  function primeTrace(levelId: string, code: string): void {
    const level = getLevel(levelId);
    if (!level) return;
    const token = get().runToken;
    get()
      .runner()
      .run({ code, levelId, seeds: [level.seeds[0] as number] })
      .then((response) => {
        if (get().runToken !== token || !response.ok) return;
        get().renderer().setTrace(response.trace);
        get().renderer().seek(0);
        set({
          trace: response.trace,
          verdict: response.verdict,
          tick: 0,
          endTick: response.trace.endTick,
        });
      })
      .catch(() => {
        // Nothing the player asked for failed, so nothing is said about it.
      });
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
      const undelivered = level.hardware;
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
      primeTrace(levelId, get().code);
    },

    setCode(code) {
      const id = get().currentLevelId;
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
      set({ runToken: state.runToken + 1, runState: 'idle' });
      try {
        state.runner().cancel();
      } catch {
        // A host that cannot even be cancelled is still not allowed to hold the shell.
      }
      pushLines([{ t: 0, kind: 'system', text: 'run cancelled' }]);
    },

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
              })),
              ...notices,
            ].sort((a, b) => a.t - b.t),
          );
          pushLines([
            {
              t: trace.endTick,
              kind: verdict.passed ? 'success' : 'error',
              text: `preview complete — ${verdict.stats.ticks} ticks`,
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
