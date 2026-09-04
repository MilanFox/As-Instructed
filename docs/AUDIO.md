# BOOTSTRAP — Audio

Everything in `src/audio/` is synthesized in code with WebAudio. There are no asset files and no
new dependencies (DESIGN.md §2). The UI imports from `src/audio` and nothing deeper.

## 1. The idea in one paragraph

The game does not fire sounds from gameplay code, because at play time there is no gameplay code
running — a finished `Trace` is being scrubbed back and forth at 0.25x to 64x (DESIGN.md §3). So
audio is a **cursor over `trace.events` driven by the renderer's clock**. Everything hard about
this file tree follows from that: a seek must not replay a burst of stale sounds, and 64x must not
turn into a machine gun.

```
Renderer (owns the frame loop)          src/audio
  onTick(tick, playing) ───────────────► Conductor
                                           │ cursor over trace.events
                                           │ rate limit, coalesce, degrade
                                           ▼
                                         sounds.ts  ──► AudioEngine (voice pool, buses, limiter)
```

## 2. Files

| File | Owns |
|---|---|
| `engine.ts` | The `AudioContext` graph: three buses, a master, a limiter, a feed-forward space network, and the voice pool. |
| `synth.ts` | Oscillator / noise / envelope / filter primitives. Every sound is a short function over these. |
| `sounds.ts` | The catalogue: one entry per event type, plus the ambience beds and the 64x texture. |
| `conductor.ts` | Playback position in, sound out. Rate limiting, coalescing, scrub safety. |
| `settings.ts` | Per-bus volumes, mute, global off. Persisted to `localStorage`. |
| `index.ts` | `GameAudio` — the whole mount surface — plus the barrel. |
| `__dev__/` | A browser harness. Open `/src/audio/__dev__/index.html` with `npm run dev`. |
| `__tests__/offline.ts` | A minimal offline WebAudio implementation, so tests can assert on samples. |

## 3. Mounting it

```ts
import { createAudio } from './audio/index.ts';

const audio = createAudio();          // reads settings from localStorage
```

Four wires, all optional, all safe to skip:

**1. Unlock, from any user gesture.** Autoplay policy leaves a fresh context suspended. `unlock()`
never throws and never rejects, and a capture-phase listener retries on the first
`pointerdown` / `keydown` / `touchend` regardless, so calling it once from the Run button is
enough.

```ts
void audio.unlock();
```

**2. Point it at the playback clock.** `GameAudio.playback` has exactly the shape of
`RendererPort.onTick` (`src/game/ports.ts`), so:

```ts
const detach = audio.attach(renderer);     // renderer: { onTick(cb): () => void }
// or, equivalently:
const detach = renderer.onTick(audio.playback);
```

`playback(tick, playing)` is called once per frame at 60Hz forever. It is cheap when there is
nothing to do and does no work at all while audio is off or the context is suspended.

**3. Tell it about the level and the run.**

```ts
audio.setWorld(level.world);        // selects the biome for the ambience bed
audio.setTrace(trace);              // or null to clear
audio.setSpeed(ticksPerSecond);     // pass null or Infinity to let it infer from the playhead
```

`setSpeed` is optional. Without it the conductor infers the speed from how far the playhead moves
per frame, which also keeps it honest when the UI's idea of the speed and the renderer's disagree.

**4. Tell it the two things the trace does not know.**

```ts
audio.ui('runStart');               // 'runStart' | 'compileError' | 'cancel' | 'panelOpen' | 'panelClose' | 'button'
audio.outcome({ passed, medal });   // medal: 'gold' | 'silver' | 'bronze' | 'none' | undefined
```

`outcome` plays the verdict and, a beat later, the medal stinger. Everything else — moves, blocked
moves, harvests, sync releases, objectives met and lost — comes out of the trace on its own.

### Full surface

| Member | Notes |
|---|---|
| `settings` | Read-only current settings. |
| `update(patch)` | Applies, persists, and reconfigures live. Returns the new settings. |
| `setVolume(bus, 0..1)` | `'master' \| 'sfx' \| 'ui' \| 'ambience'`. |
| `unlock()` | Resumes a suspended context. Never throws. |
| `attach(source)` | Subscribes to anything with `onTick`. Returns the unsubscribe. |
| `playback(tick, playing)` | The per-frame drive. Stable reference; safe to pass directly. |
| `setTrace` / `setWorld` / `setBiome` / `setSpeed` | Per level and per transport change. |
| `ui(name)` / `outcome(report)` | The two things the trace cannot say. |
| `cue(name, seed?)` | Fires any catalogue sound directly, ungated. For harnesses. |
| `running` | False while autoplay policy still holds the context — show an "enable sound" affordance. |
| `stats` | `{ voices, eventsPerSecond, texture }`. Cheap enough to poll from a HUD. |
| `dispose()` | Tears the context down. |

Lower-level exports (`AudioEngine`, `Conductor`, `SOUNDS`, `play`, `Synth`, `soundFor`) are
available for tests and harnesses. The UI should need none of them.

## 4. Settings

```ts
interface AudioSettings {
  enabled: boolean;          // true  — hard off-switch, not a volume
  muted: boolean;            // false — silence that keeps the context alive
  master: number;            // 0.7
  sfx: number;               // 0.8
  ui: number;                // 0.6
  ambience: number;          // 0.35
  ambienceEnabled: boolean;  // false — see §7
  scrubTicks: boolean;       // true  — a very quiet tick while dragging the scrubber
}
```

Stored at `localStorage['bootstrap.audio']`, separate from `bootstrap.save` so a save
export/import does not carry one machine's volume to another. Reads are tolerant: any field that
is missing, out of range or the wrong type falls back to its default, and a corrupt blob loads as
defaults rather than throwing.

`enabled: false` is not a volume. With it clear, no `AudioContext` is ever constructed, no noise
buffers are generated and every method above is a no-op — turning audio off costs nothing.

## 5. Rate limiting — the rules

At 64x (256 ticks/second) a busy World 7 trace delivers thousands of events per second. Four
defences apply in order:

1. **Per-frame budget.** At most `MAX_NEW_PER_FRAME` (4) new voices start in one frame, no matter
   how many events the playhead crossed. Skipped events still count towards density.
2. **Per-sound minimum interval, stretched by density.** Each entry in `SOUNDS` declares a
   `minIntervalMs` (45ms for `move`, 70ms for `blocked`, 400ms for the stingers). The effective
   gate is `minIntervalMs × (1 + 6 × texture)`, so `move` thins from ~22/second at rest towards
   ~4/second in a storm.
3. **Voice pool cap.** `AudioEngine.voice` refuses past `MAX_VOICES` (16). A higher-priority sound
   may steal the lowest-priority voice playing; an equal or lower one is dropped. `voice()` returns
   `null`, never throws — a dropped sound is a non-event.
4. **Degradation into texture.** Above `TEXTURE_ON` (18 events/second) a `SwarmTexture` bed —
   band-passed noise plus a low hum, no rhythm — fades in and reaches full at `TEXTURE_FULL` (90).
   Surviving one-shots duck by up to 50% underneath it. The result is the sound of a lot of
   machinery rather than a burst of clicks, and perceived loudness stays roughly constant as speed
   rises. Only the *detail* degrades.

Outcome sounds (objective, verdict, medal) and UI feedback are **protected**: never stretched,
never ducked, never stolen from.

Sounds are scheduled against the audio clock, not the frame boundary: events inside one frame are
spread across a 20ms lookahead in trace order, which keeps a burst from collapsing onto a single
instant and comb-filtering itself.

## 6. Scrub safety — the rules

A frame is treated as a **seek** when the playhead did something playback could not have done:

- it moved backwards;
- it moved at all while paused (more than half a tick);
- it jumped further than a generous multiple of what the current speed allows in one frame.

On a seek the conductor cuts every voice in flight over 8ms, mutes the space network for 200ms
(the only part of the graph that outlives its sources), re-finds the cursor by binary search, and
plays **at most one** very quiet tick — gated to one per 90ms. Dragging across 500 ticks therefore
costs one sound, not 500. Pausing zeroes the event-rate estimate and drops the texture bed
immediately.

While the context is suspended by autoplay policy, its `currentTime` does not advance, so the
conductor tracks the playhead, makes no sound at all, and resyncs cleanly on the frame the context
starts running.

## 7. Ambience — shipped **off**

There is a per-world drone bed for all eight biomes: band-passed noise with a slow wandering
filter, two detuned low oscillators, and two LFOs (0.017–0.067Hz) that never line up. Nothing in it
moves faster than once every fifteen seconds, and it measures around −50dBFS at default volumes.

It defaults to **off** (`ambienceEnabled: false`), and that is a deliberate call rather than an
oversight. It is the one sound a player cannot choose not to hear, the difference between "room
tone" and "a drone" cannot be settled by looking at a buffer, and it was written without anyone
being able to listen to it. Audition it at `/src/audio/__dev__/index.html`, and if it holds up over
twenty minutes of actual work, flip the default in `settings.ts`.

## 8. Sound design notes

Industrial, restrained, slightly cheap-corporate — matching DESIGN.md §8. The rules are
subtractive: nothing above 3kHz carries weight, no action sound is longer than 200ms, the longest
thing in the catalogue is the gold stinger at under a second, and peak levels are calibrated so
loudness tracks importance (`move` < `blocked` < `failed` ≈ `passed` < `medalGold`).

Two things are worth knowing before editing:

- **The reward family is quartal** — D, A, D, A. Stacked fourths read as a machine acknowledging a
  form rather than as a fanfare. `objective` is the top two notes of it, `passed` is the bottom two
  an octave down, and bronze / silver / gold are the same figure at three sizes: two notes; three
  notes with an octave and some air; four notes with a low stamp and a real tail. They layer into
  one chord when they fire together.
- **Variation is seeded by the trace event**, never by `Math.random()`. The noise buffers
  themselves are generated from a fixed seed. A hundred moves are a hundred slightly different
  ticks, and scrubbing back over the same tick produces the bit-identical sound.

## 9. Verification

`npx vitest run src/audio` — 101 tests.

Node has no WebAudio, so `__tests__/offline.ts` implements the slice of it that `src/audio` uses
(oscillators, buffer sources, biquads, delays, gains, full `AudioParam` automation) and renders the
graph to a real buffer. Tests assert on samples: peak inside a calibrated band, no clipping, no DC
offset, envelopes reaching true silence inside each sound's declared duration, nothing audible
after a seek, and the rate limiter turning a synthetic 6000-event 64x storm into fewer than thirty
voices.

The double enforces the browser's `AudioParam` errors — an `exponentialRampToValueAtTime` towards
or away from zero throws, exactly as it does in Chrome — because that is the easiest way to write
a sound that is silent on real hardware and perfect in a mock. It deliberately renders
`DynamicsCompressorNode` as a pass-through, so a "peak ≤ 1" assertion proves the material is safe
*before* the limiter rather than proving the limiter caught it.

The whole catalogue has additionally been constructed against real Chrome WebAudio on a suspended
context with no exceptions, but nobody has heard it yet. The least certain sounds, in order:
the ambience beds, `refuel`, and `spawn`.
