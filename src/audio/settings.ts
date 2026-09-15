export const AUDIO_SETTINGS_KEY = 'as-instructed.audio';

export type Bus = 'sfx' | 'ui' | 'ambience';

export interface AudioSettings {
  enabled: boolean;
  muted: boolean;
  master: number;
  sfx: number;
  ui: number;
  ambience: number;
  ambienceEnabled: boolean;
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

export function busGain(settings: AudioSettings, bus: Bus): number {
  if (bus === 'ambience' && !settings.ambienceEnabled) return 0;
  return settings[bus];
}

export function masterGain(settings: AudioSettings): number {
  if (!settings.enabled || settings.muted) return 0;
  return settings.master;
}
