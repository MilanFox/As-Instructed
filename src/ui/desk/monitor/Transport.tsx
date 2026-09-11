import { useMemo } from 'react';

import { landmarks, playbackFor, progressMarks, segments } from '../../../game/playback.ts';
import { SPEEDS, currentLevel, useGame } from '../../../game/store.ts';

function speedLabel(speed: number): string {
  return speed === Infinity ? 'instant' : `${String(speed)}x`;
}

interface TransportProps {
  onZoom(rungs: number): void;
}

export function Transport({ onZoom }: TransportProps): React.ReactElement {
  const tick = useGame((state) => state.tick);
  const endTick = useGame((state) => state.endTick);
  const playing = useGame((state) => state.playing);
  const speed = useGame((state) => state.speed);
  const seek = useGame((state) => state.seek);
  const step = useGame((state) => state.step);
  const togglePlay = useGame((state) => state.togglePlay);
  const setSpeed = useGame((state) => state.setSpeed);
  const trace = useGame((state) => state.trace);
  const resetPreview = useGame((state) => state.resetPreview);
  const level = useGame(currentLevel);

  const idle = endTick <= 0;

  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const acts = useMemo(() => segments(playback), [playback]);
  const marks = useMemo(() => landmarks(playback), [playback]);
  const steps = useMemo(() => progressMarks(playback), [playback]);
  const percent = (value: number): string =>
    `${String(endTick > 0 ? (value / endTick) * 100 : 0)}%`;

  return (
    <div className="feed-controls">
      <div className="fc-keys">
        <button
          type="button"
          className="fk"
          onClick={() => step(-1)}
          disabled={idle}
          title="Step back one tick (,)"
          aria-label="Step back one tick"
        >
          ◀
        </button>
        <button
          type="button"
          className="fk fk-wide"
          onClick={togglePlay}
          disabled={!level}
          title={playing ? 'Pause (space)' : trace === null ? 'Try it (space)' : 'Play (space)'}
          aria-label={
            playing ? 'Pause' : trace === null ? 'Try this solution against one seed' : 'Play'
          }
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="fk"
          onClick={() => step(1)}
          disabled={idle}
          title="Step forward one tick (.)"
          aria-label="Step forward one tick"
        >
          ▶
        </button>
        <button
          type="button"
          className="fk"
          onClick={resetPreview}
          disabled={idle}
          title="Reset this run — clear the trace so you can try again"
          aria-label="Reset the run"
        >
          ↺
        </button>
      </div>

      <div className="fc-scrub">
        {acts.length > 0 || steps.length > 0 ? (
          <div className="fc-acts" aria-hidden="true">
            {acts.map((act, index) => (
              <span
                key={act.id}
                className={[
                  'fc-act',
                  tick >= act.from && tick <= act.to ? 'fc-act--current' : '',
                  index % 2 === 1 ? 'fc-act--alt' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: percent(act.from), width: percent(Math.max(0, act.to - act.from)) }}
                title={`${act.label} — ticks ${String(act.from)}–${String(act.to)}`}
              />
            ))}
            {steps.map((mark) => (
              <span
                key={mark.id}
                className="fc-step"
                style={{ left: percent(mark.tick) }}
                title={`${mark.label} — ${String(mark.done)}/${String(mark.total)} at tick ${String(mark.tick)}`}
              />
            ))}
          </div>
        ) : null}

        <input
          type="range"
          id="scrub"
          min={0}
          max={Math.max(1, endTick)}
          step={1}
          value={Math.round(tick)}
          disabled={idle}
          aria-label="Playhead, in ticks"
          aria-valuetext={`playhead at tick ${String(Math.round(tick))} of ${String(endTick)}`}
          onChange={(event) => seek(Number(event.target.value))}
        />

        {marks.length > 0 ? (
          <div className="fc-marks">
            {marks.map((mark) => (
              <button
                key={mark.id}
                type="button"
                className={[
                  'fc-mark',
                  mark.met ? 'fc-mark--met' : 'fc-mark--lost',
                  mark.bonus ? 'fc-mark--bonus' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: percent(mark.tick) }}
                onClick={() => seek(mark.tick)}
                title={`${mark.label} — ${mark.met ? 'met' : 'lost'} at tick ${String(mark.tick)}`}
                aria-label={`Jump to tick ${String(mark.tick)}, ${mark.label} ${mark.met ? 'met' : 'lost'}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="fc-read">
        <em>PLAYHEAD</em>
        <span>{String(Math.floor(tick)).padStart(4, '0')}</span>
        <i>/</i>
        <span>{String(endTick).padStart(4, '0')}</span>
      </div>

      <label className="sr-only" htmlFor="speed">
        Playback speed
      </label>
      <select
        id="speed"
        className="fc-speed"
        value={String(speed)}
        onChange={(event) => setSpeed(Number(event.target.value))}
      >
        {SPEEDS.map((option) => (
          <option key={String(option)} value={String(option)}>
            {speedLabel(option)}
          </option>
        ))}
      </select>

      <div className="fc-zoom">
        <span className="fc-legend">ZOOM</span>
        <button
          type="button"
          className="fk fk-narrow"
          onClick={() => onZoom(-1)}
          title="Smaller tiles"
          aria-label="Zoom out one step"
        >
          OUT
        </button>
        <button
          type="button"
          className="fk fk-narrow"
          onClick={() => onZoom(0)}
          title="Frame the whole site"
          aria-label="Fit the whole site"
        >
          FIT
        </button>
        <button
          type="button"
          className="fk fk-narrow"
          onClick={() => onZoom(1)}
          title="Bigger tiles"
          aria-label="Zoom in one step"
        >
          IN
        </button>
      </div>

      <div className="fc-lamp" />
    </div>
  );
}
