/**
 * The shape of a run, as a function of the playhead.
 *
 * A trace is a flat list of events, and played back as one it is featureless: a bot drives around
 * for three minutes and the objectives all tick over in the last frame. What is missing is
 * *structure* — which objective the run is working towards right now, when each one closed, and
 * where on the site the work is happening. That is what this file computes, once per trace.
 *
 * It is derived, not recorded. `Sim.noteObjective` exists but nothing calls it, so objective
 * transitions are found the only honest way: replay the trace forward, and evaluate the level's
 * own objectives against the world at each step. They are pure functions of
 * `{ world, trace, initialWorld }` (DESIGN.md §5), so this produces exactly the answers the
 * verdict would have given had the run stopped there.
 *
 * Two things keep it cheap enough to do on the main thread:
 *
 *  - The world is advanced with `applyEvent` in one forward pass rather than re-replayed per
 *    sample, and the truncated trace handed to the objectives is a prefix array that is pushed
 *    onto in place. Both are O(events) in total instead of O(events²).
 *  - Long runs are sampled rather than evaluated every tick. `MAX_SAMPLES` bounds the work at a
 *    resolution far finer than a scrubber pixel.
 */
import type { Objective, Trace, TraceEvent, Vec, World } from '../engine/index.ts';
import { applyEvent, cloneWorld, reviveTrace } from '../engine/index.ts';
import type { LevelDef } from '../levels/index.ts';

/** Evaluation points across a trace, however long it is. A 4000-tick run samples every 8 ticks. */
const MAX_SAMPLES = 500;

/** Highlighted cells at any one moment. More than this and the eye is not being directed anywhere. */
const MAX_HIGHLIGHTS = 8;

/** A transition in an objective's state, at the tick the playhead has to reach to see it. */
export interface ObjectiveFlip {
  t: number;
  met: boolean;
}

export interface ObjectiveTrack {
  id: string;
  label: string;
  bonus: boolean;
  flips: ObjectiveFlip[];
  /** Samples where `progress()` changed. Empty for a binary objective. */
  progress: { t: number; done: number; total: number }[];
  /** The tick it closed for good, or null if it never held to the end of the run. */
  completedAt: number | null;
  /** Cells this objective's work happens at, in the order the run gets to them. */
  work: { t: number; x: number; y: number }[];
  /** Where the site was busy at the moment it closed — the fallback when there is no `work`. */
  landing: Vec | null;
}

export interface Playback {
  endTick: number;
  tracks: ObjectiveTrack[];
  /** Required objectives only, in rail order. The active one is always the first of these. */
  required: ObjectiveTrack[];
}

/** Events that changed something on the ground, and so are worth pointing the camera at. */
const WORK_KINDS = new Set([
  'tileChange',
  'harvest',
  'mine',
  'plant',
  'pickup',
  'drop',
  'use',
  'refuel',
  'mark',
  'act',
  'die',
]);

function workCell(event: TraceEvent): Vec | null {
  if (!WORK_KINDS.has(event.kind)) return null;
  const at = (event as { at?: Vec }).at;
  return at ? { x: at.x, y: at.y } : null;
}

/**
 * Where the run is currently busy, so that an objective which closes without touching a tile —
 * "park on the pad", "enter every floor tile" — still has somewhere to point.
 */
function actingCell(event: TraceEvent, previous: Vec | null): Vec | null {
  if (event.kind === 'move' && event.ok) return { x: event.to.x, y: event.to.y };
  const at = (event as { at?: Vec }).at;
  return at ? { x: at.x, y: at.y } : previous;
}

const cache = new WeakMap<Trace, Playback>();

/**
 * The run's structure, memoized per trace.
 *
 * Every panel that wants it asks for it; the first caller after a run pays for the walk and the
 * rest read it. A trace is replaced wholesale on every run, so the entry dies with it.
 */
export function playbackFor(level: LevelDef | undefined, trace: Trace | null): Playback | null {
  if (!level || !trace) return null;
  const existing = cache.get(trace);
  if (existing) return existing;
  const built = build(level, trace);
  cache.set(trace, built);
  return built;
}

function build(level: LevelDef, trace: Trace): Playback {
  const required = level.objectives ?? [];
  const bonus = level.bonus ?? [];
  const objectives: { objective: Objective; bonus: boolean }[] = [
    ...required.map((objective) => ({ objective, bonus: false })),
    ...bonus.map((objective) => ({ objective, bonus: true })),
  ];

  const tracks: ObjectiveTrack[] = objectives.map(({ objective, bonus: isBonus }) => ({
    id: objective.id,
    label: objective.label,
    bonus: isBonus,
    flips: [],
    progress: [],
    completedAt: null,
    work: [],
    landing: null,
  }));

  const empty: Playback = {
    endTick: trace.endTick,
    tracks,
    required: tracks.filter((track) => !track.bonus),
  };

  let world: World;
  try {
    reviveTrace(trace);
    world = cloneWorld(trace.initialWorld);
  } catch {
    return empty;
  }

  // A prefix *view*: the same array object grows as the walk advances, so an objective evaluated
  // mid-walk sees exactly the events that had happened by then and nothing is copied.
  const prefix: TraceEvent[] = [];
  const view: Trace = { ...trace, events: prefix, keyframes: [], endTick: 0 };
  const context = { world, trace: view, initialWorld: trace.initialWorld };

  const events = trace.events;
  const stride = Math.max(1, Math.ceil(trace.endTick / MAX_SAMPLES));

  const sample = (t: number): void => {
    view.endTick = t;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i] as ObjectiveTrack;
      const objective = objectives[i]?.objective;
      if (!objective) continue;
      let met = false;
      try {
        met = objective.evaluate(context);
      } catch {
        // An objective that throws on a partial world is not a reason to lose the whole rail.
        continue;
      }
      const last = track.flips[track.flips.length - 1];
      if ((last?.met ?? false) !== met) track.flips.push({ t, met });
      if (!objective.progress) continue;
      try {
        const [done, total] = objective.progress(context);
        const previous = track.progress[track.progress.length - 1];
        if (previous?.done !== done || previous.total !== total) {
          track.progress.push({ t, done, total });
        }
      } catch {
        // Same.
      }
    }
  };

  sample(0);

  let acting: Vec | null = null;
  let index = 0;
  let nextSampleAt = stride;
  while (index < events.length) {
    const t = (events[index] as TraceEvent).t;
    while (index < events.length && (events[index] as TraceEvent).t === t) {
      const event = events[index] as TraceEvent;
      try {
        applyEvent(world, event);
      } catch {
        // A trace the renderer can draw is a trace this can walk; if it cannot, stop guessing.
      }
      prefix.push(event);
      acting = actingCell(event, acting);
      index++;
    }
    if (t >= nextSampleAt || index >= events.length) {
      sample(t);
      nextSampleAt = t + stride;
      for (const track of tracks) {
        const last = track.flips[track.flips.length - 1];
        if (last?.met && last.t === t && acting) track.landing = acting;
      }
    }
  }
  if (trace.endTick > 0) sample(trace.endTick);

  for (const track of tracks) {
    const last = track.flips[track.flips.length - 1];
    track.completedAt = last?.met ? last.t : null;
  }

  assignWork(tracks, events);

  return { endTick: trace.endTick, tracks, required: tracks.filter((track) => !track.bonus) };
}

/**
 * Files every ground-level event under whichever required objective was outstanding at the time.
 *
 * That is the same rule the rail and the viewport use to decide what is "active", so the brackets
 * on the canvas and the highlighted row in the panel are always talking about the same thing.
 */
function assignWork(tracks: ObjectiveTrack[], events: readonly TraceEvent[]): void {
  const required = tracks.filter((track) => !track.bonus);
  if (required.length === 0) return;
  for (const event of events) {
    const cell = workCell(event);
    if (!cell) continue;
    const track = firstOutstanding(required, event.t);
    if (!track) continue;
    const last = track.work[track.work.length - 1];
    if (last && last.x === cell.x && last.y === cell.y) continue;
    track.work.push({ t: event.t, x: cell.x, y: cell.y });
  }
}

function firstOutstanding(tracks: ObjectiveTrack[], tick: number): ObjectiveTrack | undefined {
  return tracks.find((track) => !metAt(track, tick)) ?? tracks[tracks.length - 1];
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

/** Whether the objective held as of `tick`. Objectives can be lost again, so this is a lookup. */
export function metAt(track: ObjectiveTrack, tick: number): boolean {
  let met = false;
  for (const flip of track.flips) {
    if (flip.t > tick) break;
    met = flip.met;
  }
  return met;
}

export function progressAt(track: ObjectiveTrack, tick: number): [number, number] | undefined {
  let found: [number, number] | undefined;
  for (const sample of track.progress) {
    if (sample.t > tick) break;
    found = [sample.done, sample.total];
  }
  return found;
}

/**
 * The objective the run is working towards at `tick` — the first required one still outstanding.
 *
 * Null once they are all met, which is the truth: the work is finished and there is nothing left
 * to point at but the result.
 */
export function activeTrack(playback: Playback | null, tick: number): ObjectiveTrack | null {
  if (!playback) return null;
  return playback.required.find((track) => !metAt(track, tick)) ?? null;
}

/**
 * Cells to bracket on the canvas at `tick`.
 *
 * While an objective is outstanding these are the next few places its work happens, so the
 * brackets sit ahead of the bot and the eye is led rather than chased. The moment the last
 * objective closes they become the cell it closed on, in the met colour — which is also where
 * `Renderer.celebrate` centres its burst, so the medal lands on the thing that earned it.
 */
export function highlightsAt(
  playback: Playback | null,
  tick: number,
): { cells: Vec[]; met: boolean } {
  const active = activeTrack(playback, tick);
  if (!active) {
    const last = playback?.required[playback.required.length - 1];
    const cell = last?.landing ?? last?.work[last.work.length - 1] ?? null;
    return { cells: cell ? [{ x: cell.x, y: cell.y }] : [], met: true };
  }

  const cells: Vec[] = [];
  const seen = new Set<string>();
  for (const entry of active.work) {
    if (entry.t <= tick) continue;
    const key = `${entry.x},${entry.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push({ x: entry.x, y: entry.y });
    if (cells.length >= MAX_HIGHLIGHTS) break;
  }
  if (cells.length > 0) return { cells, met: false };

  const fallback = active.landing ?? active.work[active.work.length - 1] ?? null;
  return { cells: fallback ? [{ x: fallback.x, y: fallback.y }] : [], met: false };
}

/** Landmarks for the scrubber: where each objective closed, and where any was lost again. */
export interface Landmark {
  id: string;
  label: string;
  tick: number;
  met: boolean;
  bonus: boolean;
}

export function landmarks(playback: Playback | null): Landmark[] {
  if (!playback) return [];
  const marks: Landmark[] = [];
  for (const track of playback.tracks) {
    /*
     * One pip per objective, not one per transition.
     *
     * Plenty of objectives flap on the way — "every tile planted" is briefly true after the first
     * tile and false again after the second — and pipping all of it turns the bar into confetti.
     * What a player is looking for is a single answer per objective: the tick it closed for good,
     * or, when it never did, the last moment it was true. That second one is the moment it went
     * wrong, which is the whole reason to put landmarks on a scrubber.
     */
    const closed = track.completedAt;
    if (closed !== null) {
      if (closed <= 0) continue;
      marks.push({
        id: track.id,
        label: track.label,
        tick: closed,
        met: true,
        bonus: track.bonus,
      });
      continue;
    }
    const lost = [...track.flips].reverse().find((flip) => !flip.met && flip.t > 0);
    if (lost) {
      marks.push({ id: track.id, label: track.label, tick: lost.t, met: false, bonus: track.bonus });
      continue;
    }
    // Never met, never lost: it simply stopped moving. The last step forward is where to look.
    const stalled = [...track.progress].reverse().find((sample) => sample.t > 0 && sample.done > 0);
    if (!stalled) continue;
    marks.push({
      id: track.id,
      label: track.label,
      tick: stalled.t,
      met: false,
      bonus: track.bonus,
    });
  }
  return marks.sort((a, b) => a.tick - b.tick);
}

/**
 * The run split into one segment per required objective — start tick, close tick, share of the
 * whole. This is the bar under the scrubber, and the reason a three-minute solve reads as three
 * acts instead of one featureless slab.
 */
export interface Segment {
  id: string;
  label: string;
  from: number;
  to: number;
  met: boolean;
}

/**
 * Every step forward an objective made, as a tick on the bar.
 *
 * Completion pips alone are not enough structure for the objectives this game actually asks for.
 * "Harvest every crop" closes on the last crop and nowhere else, so a pip-only timeline puts every
 * landmark in the final second of a three-minute run. The progress ticks are the run's actual
 * rhythm — twelve crops, twelve marks, spread across the bar — and a gap between two of them is
 * visible as exactly what it is: the stretch where nothing was getting done.
 */
export interface ProgressMark {
  id: string;
  label: string;
  tick: number;
  done: number;
  total: number;
}

const MAX_PROGRESS_MARKS = 60;

export function progressMarks(playback: Playback | null): ProgressMark[] {
  if (!playback) return [];
  const marks: ProgressMark[] = [];
  for (const track of playback.required) {
    let best = -1;
    for (const sample of track.progress) {
      if (sample.t <= 0 || sample.done <= best) continue;
      best = sample.done;
      if (track.completedAt !== null && sample.t >= track.completedAt) continue;
      marks.push({
        id: `${track.id}#${sample.t}`,
        label: track.label,
        tick: sample.t,
        done: sample.done,
        total: sample.total,
      });
    }
  }
  marks.sort((a, b) => a.tick - b.tick);
  if (marks.length <= MAX_PROGRESS_MARKS) return marks;
  // Too many to read as individual events; thin them evenly rather than crowd the bar.
  const step = marks.length / MAX_PROGRESS_MARKS;
  const thinned: ProgressMark[] = [];
  for (let i = 0; i < MAX_PROGRESS_MARKS; i++) {
    thinned.push(marks[Math.floor(i * step)] as ProgressMark);
  }
  return thinned;
}

export function segments(playback: Playback | null): Segment[] {
  if (!playback || playback.endTick <= 0) return [];
  const out: Segment[] = [];
  let from = 0;
  for (const track of playback.required) {
    const to = track.completedAt ?? playback.endTick;
    if (to < from) continue;
    out.push({ id: track.id, label: track.label, from, to, met: track.completedAt !== null });
    from = to;
  }
  // The tail after the last objective closes belongs to the act that closed it, so the bar covers
  // the whole run rather than stopping short and reading as a rendering bug.
  const last = out[out.length - 1];
  if (last) last.to = playback.endTick;
  return out;
}
