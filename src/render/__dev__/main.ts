/**
 * Standalone renderer harness. Open `/src/render/__dev__/index.html` with `npm run dev`.
 *
 * Deliberately does not touch `index.html` or `src/main.tsx` — the UI agent owns those. Vite
 * serves any HTML file under the project root as its own entry, and this one is not referenced by
 * the production build's entry graph.
 */

import { Renderer, padCells } from '../index.ts';
import type { FrameInfo, TileReadout } from '../index.ts';
import { allScenes } from './scenes.ts';
import type { Scene } from './scenes.ts';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const readout = document.getElementById('readout') as HTMLElement;
const sceneSelect = document.getElementById('scene') as HTMLSelectElement;
const scrub = document.getElementById('scrub') as HTMLInputElement;
const tickLabel = document.getElementById('tickLabel') as HTMLElement;
const playPause = document.getElementById('playPause') as HTMLButtonElement;
const speedSelect = document.getElementById('speed') as HTMLSelectElement;

const scenes = allScenes();
for (const scene of scenes) {
  const option = document.createElement('option');
  option.value = scene.id;
  option.textContent = scene.label;
  sceneSelect.append(option);
}

let current: Scene = scenes[0] as Scene;
let following = false;
let bench: { until: number; frames: number; total: number; worst: number } | null = null;

const renderer = new Renderer({
  world: current.world,
  onFrame: onFrame,
  onHover: onHover,
  onComplete: () => {
    playPause.textContent = 'play';
    playPause.classList.remove('on');
  },
});

function onHover(info: TileReadout | null): void {
  readout.textContent = info ? info.label : 'hover a tile';
}

function onFrame(info: FrameInfo): void {
  if (!scrubbing) scrub.value = String(Math.round((info.tick / Math.max(1, info.endTick)) * 1000));
  tickLabel.textContent = `t ${info.tick.toFixed(2)} / ${info.endTick}`;
  const slow = info.frameMs > 16.7;
  hud.innerHTML = [
    `scene   <b>${current.id}</b>`,
    `grid    <b>${current.trace.initialWorld.w}x${current.trace.initialWorld.h}</b>`,
    `bots    <b>${current.trace.initialWorld.bots.length}</b>`,
    `events  <b>${current.trace.events.length}</b>`,
    `frame   <b class="${slow ? 'warn' : 'good'}">${info.frameMs.toFixed(2)} ms</b>`,
    `fps     <b class="${info.fps < 55 ? 'warn' : 'good'}">${info.fps.toFixed(0)}</b>`,
    `parts   <b>${info.particles}</b>`,
    `terrain <b>${info.terrainRebuilds} rebuilds</b>`,
    `zoom    <b>${renderer.camera.deviceTilePx}px/tile @ ${renderer.camera.dpr}x</b>`,
  ].join('<br>');

  if (bench) {
    bench.frames++;
    bench.total += info.frameMs;
    if (info.frameMs > bench.worst) bench.worst = info.frameMs;
    if (performance.now() > bench.until) {
      const mean = bench.total / Math.max(1, bench.frames);
      const line = `benchmark: ${bench.frames} frames, mean ${mean.toFixed(2)} ms, worst ${bench.worst.toFixed(2)} ms`;
      console.log(line);
      (window as unknown as { __benchResult?: string }).__benchResult = line;
      bench = null;
    }
  }
}

function loadScene(scene: Scene): void {
  current = scene;
  renderer.setWorld(scene.world);
  renderer.setTrace(scene.trace);
  const highlights = scene.highlights.length > 0 ? scene.highlights : padCells(scene.trace.initialWorld);
  renderer.setHighlights(highlights);
  renderer.setActiveBot(scene.trace.initialWorld.bots[0]?.id ?? null);
  renderer.setFollow(null);
  following = false;
  document.getElementById('follow')?.classList.remove('on');
  renderer.fit();
  renderer.play(Number(speedSelect.value));
  playPause.textContent = 'pause';
  playPause.classList.add('on');
}

let scrubbing = false;
scrub.addEventListener('pointerdown', () => {
  scrubbing = true;
  renderer.pause();
});
scrub.addEventListener('pointerup', () => {
  scrubbing = false;
});
scrub.addEventListener('input', () => {
  renderer.seek((Number(scrub.value) / 1000) * renderer.endTick);
});

sceneSelect.addEventListener('change', () => {
  const next = scenes.find((s) => s.id === sceneSelect.value);
  if (next) loadScene(next);
});

playPause.addEventListener('click', () => {
  if (renderer.isPlaying) {
    renderer.pause();
    playPause.textContent = 'play';
    playPause.classList.remove('on');
  } else {
    renderer.play(Number(speedSelect.value));
    playPause.textContent = 'pause';
    playPause.classList.add('on');
  }
});

document.getElementById('stepBack')?.addEventListener('click', () => {
  renderer.pause();
  renderer.step(-1);
});
document.getElementById('stepFwd')?.addEventListener('click', () => {
  renderer.pause();
  renderer.step(1);
});
document.getElementById('fit')?.addEventListener('click', () => renderer.fit());
document.getElementById('follow')?.addEventListener('click', (event) => {
  following = !following;
  const target = current.trace.initialWorld.bots[0]?.id ?? null;
  renderer.setFollow(following ? target : null);
  (event.currentTarget as HTMLElement).classList.toggle('on', following);
});
document.getElementById('grid')?.addEventListener('click', (event) => {
  const el = event.currentTarget as HTMLElement;
  el.classList.toggle('on');
});
for (const kind of ['bronze', 'silver', 'gold'] as const) {
  const id = `celebrate${kind[0]?.toUpperCase()}${kind.slice(1)}`;
  document.getElementById(id)?.addEventListener('click', () => renderer.celebrate(kind));
}

document.getElementById('reduced')?.addEventListener('click', (event) => {
  const el = event.currentTarget as HTMLElement;
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  renderer.setReducedMotion(on ? true : null);
});

document.getElementById('bench')?.addEventListener('click', () => {
  const stress = scenes.find((s) => s.id === 'stress');
  if (stress && current.id !== 'stress') loadScene(stress);
  renderer.play(8);
  bench = { until: performance.now() + 5000, frames: 0, total: 0, worst: 0 };
});
speedSelect.addEventListener('change', () => renderer.setSpeed(Number(speedSelect.value)));

window.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    event.preventDefault();
    playPause.click();
  }
  if (event.key === 'ArrowRight') renderer.step(event.shiftKey ? 5 : 1);
  if (event.key === 'ArrowLeft') renderer.step(event.shiftKey ? -5 : -1);
  if (event.key === 'f') renderer.fit();
});

// Exposed for the browser-automation pass: drive the harness without synthetic pointer events.
(window as unknown as Record<string, unknown>).__harness = {
  renderer,
  scenes,
  load: (id: string) => {
    const scene = scenes.find((s) => s.id === id);
    if (scene) loadScene(scene);
  },
  seek: (tick: number) => {
    renderer.pause();
    renderer.seek(tick);
    playPause.textContent = 'play';
    playPause.classList.remove('on');
  },
  zoom: (steps: number) => renderer.camera.zoomBy(steps),
  celebrate: (kind: 'bronze' | 'silver' | 'gold' | 'pass' | 'fail') => renderer.celebrate(kind),
  reduced: (on: boolean | null) => renderer.setReducedMotion(on),
  speed: (ticksPerSecond: number) => renderer.setSpeed(ticksPerSecond),
  play: (ticksPerSecond?: number) => renderer.play(ticksPerSecond),
  /**
   * Synchronous frame-cost measurement. rAF is throttled to a few hertz in a background tab, so
   * an fps counter there measures Chrome's scheduler, not the renderer.
   */
  measure: (frames = 400): Record<string, number> => {
    renderer.seek(0);
    renderer.play(6);
    const samples: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      renderer.renderFrame(1 / 60);
      samples.push(performance.now() - t0);
    }
    renderer.pause();
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return {
      frames,
      mean: Number(mean.toFixed(3)),
      p50: Number((samples[Math.floor(frames * 0.5)] ?? 0).toFixed(3)),
      p95: Number((samples[Math.floor(frames * 0.95)] ?? 0).toFixed(3)),
      worst: Number((samples[frames - 1] ?? 0).toFixed(3)),
      particles: renderer.particles.live,
    };
  },
};

await renderer.mount(canvas);
loadScene(current);
