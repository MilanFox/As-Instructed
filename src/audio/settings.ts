/**
 * Mixer state, persisted to localStorage.
 *
 * `enabled: false` is a hard off-switch, not a volume: with it clear nothing in `src/audio`
 * ever constructs an `AudioContext`, so a player who does not want sound pays no CPU, no
 * autoplay prompt and no memory for the noise buffers.
 *
 * Reads are deliberately paranoid. A settings blob is not worth a crash, so anything that is not
 * understood falls back to the default for that field alone.
 */

export const AUDIO_SETTINGS_KEY = 'bootstrap.audio';

export type Bus = 'sfx' | 'ui' | 'ambience';

export interface AudioSettings {
  /** Master off-switch. When false the engine holds no audio resources at all. */
  enabled: boolean;
  /** Temporary silence that keeps the context alive. Survives a reload. */
  muted: boolean;
  /** 0..1, applied after the per-bus gains and before the limiter. */
  master: number;
  sfx: number;
  ui: number;
  ambience: number;
  /**
   * The per-world drone bed. Off by default: it is the one sound the player cannot choose not to
   * hear, so it opts in rather than out.
   */
  ambienceEnabled: boolean;
  /** A very quiet tick as the playhead crosses events while scrubbing. */
  scrubTicks: boolean;
}

export const DEFAULT_SETTINGS: Readonly<AudioSettings> = {
  enabled: true,
  muted: false,
  master: 0.7,
  sfx: 0.8,
  ui: 0.6,
  ambience: 0.35,
  ambienceEnabled: false,
  scrubTicks: true,
};

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Narrows anything at all into a complete, in-range `AudioSettings`. Never throws. */
export function normalizeSettings(raw: unknown): AudioSettings {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<
    Record<keyof AudioSettings, unknown>
  >;
  return {
    enabled: bool(source.enabled, DEFAULT_SETTINGS.enabled),
    muted: bool(source.muted, DEFAULT_SETTINGS.muted),
    master: clamp01(source.master, DEFAULT_SETTINGS.master),
    sfx: clamp01(source.sfx, DEFAULT_SETTINGS.sfx),
    ui: clamp01(source.ui, DEFAULT_SETTINGS.ui),
    ambience: clamp01(source.ambience, DEFAULT_SETTINGS.ambience),
    ambienceEnabled: bool(source.ambienceEnabled, DEFAULT_SETTINGS.ambienceEnabled),
    scrubTicks: bool(source.scrubTicks, DEFAULT_SETTINGS.scrubTicks),
  };
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): AudioSettings {
  const store = storage();
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AudioSettings): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A full or blocked quota costs the player their volume preference, nothing more.
  }
}

/** Gain for one bus node. Mute and master live on the master node, one level down the chain. */
export function busGain(settings: AudioSettings, bus: Bus): number {
  if (bus === 'ambience' && !settings.ambienceEnabled) return 0;
  return settings[bus];
}

/** Gain for the master node, which is where mute is applied. */
export function masterGain(settings: AudioSettings): number {
  if (!settings.enabled || settings.muted) return 0;
  return settings.master;
}
