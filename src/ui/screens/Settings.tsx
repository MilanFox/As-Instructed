import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AudioSettings as Settings } from '../../audio/index.ts';
import type { ArtId } from '../../render/index.ts';
import { ART_OPTIONS, chooseArt, storedArt } from '../art.ts';
import { audio } from '../audio.ts';
import { IconSliders, IconSound } from '../components/Icons.tsx';

const BUSES: { key: 'master' | 'sfx' | 'ui' | 'ambience'; label: string; note: string }[] = [
  { key: 'master', label: 'master', note: 'everything' },
  { key: 'sfx', label: 'site', note: 'moves, tools, machinery' },
  { key: 'ui', label: 'console', note: 'buttons and reports' },
  { key: 'ambience', label: 'ambience', note: 'the room tone of the biome' },
];

let open = false;
let trigger: HTMLButtonElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function settingsOpen(): boolean {
  return open;
}

export function openSettings(): void {
  if (open) return;
  open = true;
  for (const listener of listeners) listener();
}

export function closeSettings(): void {
  if (open) {
    open = false;
    for (const listener of listeners) listener();
  }
  trigger?.focus();
}

export function Settings(): React.JSX.Element {
  const showing = useSyncExternalStore(subscribe, settingsOpen, settingsOpen);

  return (
    <>
      <button
        type="button"
        className="icon-btn settings-trigger"
        ref={(element) => {
          trigger = element;
        }}
        onClick={() => (showing ? closeSettings() : openSettings())}
        aria-haspopup="dialog"
        aria-expanded={showing}
        aria-label="Settings"
        title="Settings"
      >
        <IconSliders />
      </button>
      {showing ? <SettingsFlyout /> : null}
    </>
  );
}

function SettingsFlyout(): React.JSX.Element {
  const [settings, setSettings] = useState<Readonly<Settings>>(audio.settings);
  const [art, setArt] = useState<ArtId>(storedArt());
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const apply = (patch: Partial<Settings>): void => {
    setSettings(audio.update(patch));
    void audio.unlock();
  };

  const pick = (id: ArtId): void => {
    chooseArt(id);
    setArt(id);
  };

  return (
    <div
      className="overlay overlay--corner"
      role="presentation"
      onClick={closeSettings}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        closeSettings();
      }}
    >
      <div
        className="modal modal--narrow settings-flyout"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="modal__verdict">SETTINGS</h2>
            <p className="modal__line">Kept in this browser, alongside your progress.</p>
          </div>
        </header>

        <div className="modal__body">
          <div className="settings">
            <fieldset className="settings__group">
              <legend className="settings__legend">Art direction</legend>
              <p className="settings__note">
                Applies to the board at once. Standard is palette only, with no site painters.
              </p>
              {ART_OPTIONS.map((option) => (
                <label className="settings__toggle" key={option.id}>
                  <input
                    type="radio"
                    name="art-direction"
                    value={option.id}
                    checked={art === option.id}
                    onChange={() => pick(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="settings__group">
              <legend className="settings__legend">
                <IconSound />
                Sound
              </legend>
              <p className="settings__note">
                Synthesized on site. There are no audio files and there is no budget for any.
              </p>

              <label className="settings__toggle">
                <input
                  type="checkbox"
                  checked={settings.enabled && !settings.muted}
                  onChange={(event) => apply({ enabled: event.target.checked, muted: false })}
                />
                <span>sound</span>
                <span className="settings__note">off builds no audio graph at all</span>
              </label>

              {BUSES.map((bus) => (
                <div className="settings__row" key={bus.key}>
                  <label className="settings__label" htmlFor={`volume-${bus.key}`}>
                    {bus.label}
                  </label>
                  <input
                    id={`volume-${bus.key}`}
                    type="range"
                    className="settings__slider"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(settings[bus.key] * 100)}
                    disabled={!settings.enabled}
                    onChange={(event) => apply({ [bus.key]: Number(event.target.value) / 100 })}
                  />
                  <span className="settings__value">{Math.round(settings[bus.key] * 100)}</span>
                  <span className="settings__note">{bus.note}</span>
                </div>
              ))}

              <label className="settings__toggle">
                <input
                  type="checkbox"
                  checked={settings.ambienceEnabled}
                  disabled={!settings.enabled}
                  onChange={(event) => apply({ ambienceEnabled: event.target.checked })}
                />
                <span>ambience bed</span>
                <span className="settings__note">off by default; a drone, at length</span>
              </label>

              <label className="settings__toggle">
                <input
                  type="checkbox"
                  checked={settings.scrubTicks}
                  disabled={!settings.enabled}
                  onChange={(event) => apply({ scrubTicks: event.target.checked })}
                />
                <span>scrub ticks</span>
                <span className="settings__note">a quiet tick while dragging the timeline</span>
              </label>
            </fieldset>
          </div>
        </div>

        <footer className="modal__foot">
          <button type="button" className="btn btn--run" onClick={closeSettings}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
