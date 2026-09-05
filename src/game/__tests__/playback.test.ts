import { describe, expect, it } from 'vitest';
import {
  Dir,
  Objectives,
  Sim,
  Terrain,
  addBot,
  botById,
  createWorld,
  setTerrain,
} from '../../engine/index.ts';
import type { Trace } from '../../engine/index.ts';
import type { LevelDef } from '../../levels/index.ts';
import {
  activeTrack,
  highlightsAt,
  landmarks,
  metAt,
  playbackFor,
  progressAt,
  progressMarks,
  segments,
} from '../playback.ts';

/**
 * A six-wide corridor and a bot that drives the length of it. Two objectives that close at known,
 * different ticks and both hold to the end — which is the whole thing `src/game/playback.ts`
 * exists to find, given that nothing in the engine records it.
 */
function corridor(): { level: LevelDef; trace: Trace } {
  const world = createWorld({ w: 6, h: 1, fill: Terrain.Floor });
  setTerrain(world, { x: 5, y: 0 }, Terrain.Pad);
  addBot(world, { at: { x: 0, y: 0 } });

  const sim = new Sim(world);
  for (let i = 0; i < 5; i++) sim.move(0, Dir.East);
  const trace = sim.finish();

  const level = {
    id: 'test-corridor',
    world: 1,
    index: 1,
    title: 'Corridor',
    brief: '',
    hardware: [],
    build: () => world,
    objectives: [
      Objectives.checkbox(
        'halfway',
        'Get past the middle',
        (ctx) => (botById(ctx.world, 0)?.at.x ?? 0) >= 3,
      ),
      Objectives.botAt({ x: 5, y: 0 }, { id: 'the-pad', label: 'Reach the pad' }),
    ],
    seeds: [1],
    par: { ticks: 5 },
    starter: '',
    hints: [],
  } as unknown as LevelDef;

  return { level, trace };
}

describe('playbackFor', () => {
  it('finds the tick each objective closed, without the engine recording one', () => {
    const { level, trace } = corridor();
    const playback = playbackFor(level, trace);
    expect(playback).not.toBeNull();

    const halfway = playback?.tracks.find((track) => track.id === 'halfway');
    const pad = playback?.tracks.find((track) => track.id === 'the-pad');
    expect(halfway?.completedAt).toBeGreaterThan(0);
    expect(pad?.completedAt).toBeGreaterThan(halfway?.completedAt ?? 0);
    expect(pad?.completedAt).toBeLessThanOrEqual(trace.endTick);
  });

  it('is memoized per trace', () => {
    const { level, trace } = corridor();
    expect(playbackFor(level, trace)).toBe(playbackFor(level, trace));
  });

  it('answers null without a level or a trace', () => {
    const { level, trace } = corridor();
    expect(playbackFor(undefined, trace)).toBeNull();
    expect(playbackFor(level, null)).toBeNull();
  });
});

describe('reading a playback back', () => {
  it('reports objective state as of a tick, not only at the end', () => {
    const { level, trace } = corridor();
    const playback = playbackFor(level, trace);
    const pad = playback?.tracks.find((track) => track.id === 'the-pad');
    expect(pad).toBeDefined();
    if (!pad) return;
    expect(metAt(pad, 0)).toBe(false);
    expect(metAt(pad, trace.endTick)).toBe(true);
  });

  it('names the first outstanding required objective as the active one', () => {
    const { level, trace } = corridor();
    const playback = playbackFor(level, trace);
    expect(activeTrack(playback, 0)?.id).toBe('halfway');
    expect(activeTrack(playback, trace.endTick)).toBeNull();
  });

  it('hands the renderer a met highlight once everything has closed', () => {
    const { level, trace } = corridor();
    const playback = playbackFor(level, trace);
    expect(highlightsAt(playback, trace.endTick).met).toBe(true);
    expect(highlightsAt(playback, 0).met).toBe(false);
  });

  it('lays the run out as one segment per required objective', () => {
    const { level, trace } = corridor();
    const acts = segments(playbackFor(level, trace));
    expect(acts).toHaveLength(2);
    expect(acts[0]?.from).toBe(0);
    expect(acts[acts.length - 1]?.to).toBe(trace.endTick);
  });

  it('pips each objective once rather than once per transition', () => {
    const { level, trace } = corridor();
    const playback = playbackFor(level, trace);
    const marks = landmarks(playback);
    expect(marks.length).toBeLessThanOrEqual(playback?.tracks.length ?? 0);
    expect(new Set(marks.map((mark) => mark.id)).size).toBe(marks.length);
  });

  it('survives a level whose objectives it cannot evaluate', () => {
    const { level, trace } = corridor();
    const broken = {
      ...level,
      id: 'test-broken',
      objectives: [
        {
          id: 'throws',
          label: 'Throws on every evaluation',
          evaluate: (): boolean => {
            throw new Error('nope');
          },
        },
      ],
    } as unknown as LevelDef;
    const playback = playbackFor(broken, { ...trace });
    expect(playback?.tracks).toHaveLength(1);
    expect(playback?.tracks[0]?.completedAt).toBeNull();
  });
});

describe('progress', () => {
  it('samples a counting objective as it climbs, and marks each step on the bar', () => {
    const world = createWorld({ w: 4, h: 1, fill: Terrain.Floor });
    setTerrain(world, { x: 0, y: 0 }, Terrain.Regolith);
    setTerrain(world, { x: 1, y: 0 }, Terrain.Regolith);
    addBot(world, { at: { x: 0, y: 0 } });

    const sim = new Sim(world);
    sim.move(0, Dir.East);
    sim.move(0, Dir.East);
    sim.move(0, Dir.East);
    const trace = sim.finish();

    const level = {
      id: 'test-progress',
      world: 1,
      index: 1,
      title: 'Progress',
      brief: '',
      hardware: [],
      build: () => world,
      objectives: [
        Objectives.tileCount((tile) => tile.terrain === Terrain.Floor, '>=', 4, {
          id: 'floored',
          label: 'Floor the whole strip',
        }),
      ],
      seeds: [1],
      par: { ticks: 3 },
      starter: '',
      hints: [],
    } as unknown as LevelDef;

    const playback = playbackFor(level, trace);
    const track = playback?.tracks[0];
    expect(track).toBeDefined();
    if (!track) return;
    expect(progressAt(track, trace.endTick)).toEqual([2, 4]);
    // Nothing ever floors a tile here, so there is one flat reading and no steps to mark.
    expect(progressMarks(playback)).toHaveLength(0);
  });
});
