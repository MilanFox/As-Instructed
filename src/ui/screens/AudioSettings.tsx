import { useEffect, useRef, useState } from 'react';
import type { AudioSettings as Settings } from '../../audio/index.ts';
import { audio } from '../audio.ts';

const BUSES: { key: 'master' | 'sfx' | 'ui' | 'ambience'; label: string; note: string }[] = [
  { key: 'master', label: 'master', note: 'everything' },
  { key: 'sfx', label: 'site', note: 'moves, tools, machinery' },
  { key: 'ui', label: 'console', note: 'buttons and reports' },
  { key: 'ambience', label: 'ambience', note: 'the room tone of the biome' },
];

export function AudioSettings({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [settings, setSettings] = useState<Readonly<Settings>>(audio.settings);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const apply = (patch: Partial<Settings>): void => {
    setSettings(audio.update(patch));
    void audio.unlock();
  };

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal--narrow"
        role="dialog"
        aria-modal="true"
        aria-label="Sound settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="modal__verdict">SOUND</h2>
            <p className="modal__line">
              Synthesized on site. There are no audio files and there is no budget for any.
            </p>
          </div>
        </header>

        <div className="modal__body">
          <div className="settings">
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
          </div>
        </div>

        <footer className="modal__foot">
          <button type="button" className="btn btn--run" ref={closeRef} onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
