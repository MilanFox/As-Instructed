/**
 * Standalone audio harness. Open `/src/audio/__dev__/index.html` with `npm run dev`.
 *
 * The offline tests prove the buffers are well-formed; only a human can say whether the sounds
 * are pleasant to sit with for an hour. This page exists so that judgement is one click away:
 * every sound in the catalogue, the mixer, the ambience beds, and a synthetic trace to play at
 * 64x so the rate limiter and the texture bed can be heard doing their job.
 */

import type { Trace, TraceEvent } from '../../engine/index.ts';
import { Dir } from '../../engine/index.ts';
import { GameAudio, SOUNDS, SOUND_NAMES } from '../index.ts';
import type { AmbienceBiome, SoundName } from '../index.ts';

const BIOMES: readonly AmbienceBiome[] = [
  'hangar',
  'regolith',
  'yard',
  'cave',
  'grid',
  'signal',
  'swarm',
  'finale',
];

const END_TICK = 600;

/** The harness only feeds the conductor, which reads `events` and nothing else. */
function syntheticTrace(): Trace {
  const events: TraceEvent[] = [];
  for (let t = 0; t < END_TICK; t++) {
    for (let bot = 0; bot < 4; bot++) {
      const ok = (t + bot) % 7 !== 0;
      events.push({
        t,
        botId: bot,
        dt: 1,
        kind: 'move',
        from: { x: t % 16, y: bot },
        to: { x: (t + 1) % 16, y: bot },
        dir: Dir.East,
        ok,
      });
      if (t % 11 === 0 && bot === 0) {
        events.push({
          t,
          botId: bot,
          dt: 2,
          kind: 'harvest',
          at: { x: t % 16, y: bot },
          item: 'crop',
          count: 1,
          ok: true,
        } as TraceEvent);
      }
      if (t % 23 === 0 && bot === 1) {
        events.push({ t, botId: bot, dt: 1, kind: 'send', to: 2, body: t, ok: true } as TraceEvent);
      }
    }
    if (t % 97 === 0 && t > 0) {
      events.push({ t, kind: 'objective', id: `o${t}`, state: 'met' } as TraceEvent);
    }
  }
  return { initialWorld: null, events, keyframes: [], endTick: END_TICK } as unknown as Trace;
}

const audio = new GameAudio({ persist: false });
audio.setTrace(syntheticTrace());
audio.setWorld(1);

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function group(container: HTMLElement, names: readonly SoundName[]): void {
  for (const name of names) {
    const button = document.createElement('button');
    button.textContent = name;
    if (name.startsWith('medal')) button.className = 'gold';
    button.addEventListener('click', () => {
      void audio.unlock();
      audio.cue(name, Math.floor(Math.random() * 1e6));
    });
    container.append(button);
  }
}

const actions = SOUND_NAMES.filter(
  (name) => SOUNDS[name].bus === 'sfx' && SOUNDS[name].priority < 5,
);
const outcomes = SOUND_NAMES.filter(
  (name) => SOUNDS[name].bus === 'sfx' && SOUNDS[name].priority >= 5,
);
const uiSounds = SOUND_NAMES.filter((name) => SOUNDS[name].bus === 'ui');
group(byId('actions'), actions);
group(byId('outcomes'), outcomes);
group(byId('ui-sounds'), uiSounds);

const biomeSelect = byId<HTMLSelectElement>('biome');
for (const biome of BIOMES) {
  const option = document.createElement('option');
  option.value = biome;
  option.textContent = biome;
  biomeSelect.append(option);
}
biomeSelect.addEventListener('change', () => {
  audio.setBiome(biomeSelect.value as AmbienceBiome);
});

for (const bus of ['master', 'sfx', 'ui'] as const) {
  const slider = byId<HTMLInputElement>(bus);
  slider.addEventListener('input', () => audio.setVolume(bus, Number(slider.value)));
}
const ambSlider = byId<HTMLInputElement>('amb');
ambSlider.addEventListener('input', () => audio.setVolume('ambience', Number(ambSlider.value)));

const muteButton = byId<HTMLButtonElement>('mute');
muteButton.addEventListener('click', () => {
  const next = audio.update({ muted: !audio.settings.muted });
  muteButton.textContent = next.muted ? 'unmute' : 'mute';
});

const ambButton = byId<HTMLButtonElement>('ambToggle');
ambButton.addEventListener('click', () => {
  void audio.unlock();
  const next = audio.update({ ambienceEnabled: !audio.settings.ambienceEnabled });
  ambButton.textContent = `ambience: ${next.ambienceEnabled ? 'on' : 'off'}`;
});

byId('verdictGold').addEventListener('click', () => {
  void audio.unlock();
  audio.outcome({ passed: true, medal: 'gold' });
});
byId('verdictFail').addEventListener('click', () => {
  void audio.unlock();
  audio.outcome({ passed: false });
});

const scrub = byId<HTMLInputElement>('scrub');
const tickLabel = byId('tick');
const speedSelect = byId<HTMLSelectElement>('speed');
const playButton = byId<HTMLButtonElement>('play');

let tick = 0;
let playing = false;
let last = performance.now();

playButton.addEventListener('click', () => {
  void audio.unlock();
  playing = !playing;
  playButton.textContent = playing ? 'pause' : 'play';
});
byId('stop').addEventListener('click', () => {
  playing = false;
  playButton.textContent = 'play';
  tick = 0;
});
scrub.addEventListener('input', () => {
  tick = Number(scrub.value);
});
speedSelect.addEventListener('change', () => audio.setSpeed(Number(speedSelect.value)));
audio.setSpeed(Number(speedSelect.value));

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (playing) {
    tick = Math.min(END_TICK, tick + Number(speedSelect.value) * dt);
    if (tick >= END_TICK) {
      playing = false;
      playButton.textContent = 'play';
    }
    scrub.value = String(tick);
  }
  audio.playback(tick, playing);

  const stats = audio.stats;
  byId('voices').textContent = String(stats.voices);
  byId('rate').textContent = stats.eventsPerSecond.toFixed(0);
  byId('texture').textContent = stats.texture.toFixed(2);
  tickLabel.textContent = `t ${tick.toFixed(1)} / ${END_TICK}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
