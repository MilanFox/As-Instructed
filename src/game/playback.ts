import type { Objective, Trace, TraceEvent, Vec, World } from '../engine/index.ts';
import { applyEvent, cloneWorld, reviveTrace } from '../engine/index.ts';
import type { LevelDef } from '../levels/index.ts';

const MAX_SAMPLES = 500;

export interface ObjectiveFlip {
  t: number;
  met: boolean;
}

export interface ObjectiveTrack {
  id: string;
  label: string;
  bonus: boolean;
  flips: ObjectiveFlip[];
  progress: { t: number; done: number; total: number }[];
  completedAt: number | null;
  work: { t: number; x: number; y: number }[];
  landing: Vec | null;
}

export interface Playback {
  endTick: number;
  tracks: ObjectiveTrack[];
  required: ObjectiveTrack[];
}

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

function actingCell(event: TraceEvent, previous: Vec | null): Vec | null {
  if (event.kind === 'move' && event.ok) return { x: event.to.x, y: event.to.y };
  const at = (event as { at?: Vec }).at;
  return at ? { x: at.x, y: at.y } : previous;
}

const cache = new WeakMap<Trace, Playback>();

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

export function activeTrack(playback: Playback | null, tick: number): ObjectiveTrack | null {
  if (!playback) return null;
  return playback.required.find((track) => !metAt(track, tick)) ?? null;
}

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

  const next = active.work.find((entry) => entry.t > tick);
  if (next) return { cells: [{ x: next.x, y: next.y }], met: false };

  const fallback = active.landing ?? active.work[active.work.length - 1] ?? null;
  return { cells: fallback ? [{ x: fallback.x, y: fallback.y }] : [], met: false };
}

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
      marks.push({
        id: track.id,
        label: track.label,
        tick: lost.t,
        met: false,
        bonus: track.bonus,
      });
      continue;
    }
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

export interface Segment {
  id: string;
  label: string;
  from: number;
  to: number;
  met: boolean;
}

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
  const last = out[out.length - 1];
  if (last) last.to = playback.endTick;
  return out;
}
