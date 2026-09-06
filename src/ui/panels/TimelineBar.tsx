import { useMemo } from 'react';
import { landmarks, playbackFor, progressMarks, segments } from '../../game/playback.ts';
import { SPEEDS, currentLevel, useGame } from '../../game/store.ts';
import {
  IconPause,
  IconPlay,
  IconSkipEnd,
  IconSkipStart,
  IconStepBack,
  IconStepForward,
} from '../components/Icons.tsx';

function speedLabel(speed: number): string {
  return speed === Infinity ? 'instant' : `${speed}x`;
}

/**
 * Scrubber, transport and speed. Scrubbing is a pure `seek`, so it is immediate at any speed.
 *
 * It floats at the foot of the program rig rather than spanning the workspace, so the track gets
 * its own row: a 300-tick trace scrubbed through a 100px slot is not a control, and the board is
 * not paying for the width either way.
 */
export function TimelineBar(): React.JSX.Element {
  const tick = useGame((state) => state.tick);
  const endTick = useGame((state) => state.endTick);
  const playing = useGame((state) => state.playing);
  const speed = useGame((state) => state.speed);
  const seek = useGame((state) => state.seek);
  const step = useGame((state) => state.step);
  const togglePlay = useGame((state) => state.togglePlay);
  const setSpeed = useGame((state) => state.setSpeed);
  const trace = useGame((state) => state.trace);
  const level = useGame(currentLevel);

  const idle = endTick <= 0;
  const fill = idle ? 0 : (tick / endTick) * 100;

  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const acts = useMemo(() => segments(playback), [playback]);
  const marks = useMemo(() => landmarks(playback), [playback]);
  const steps = useMemo(() => progressMarks(playback), [playback]);
  const percent = (value: number): string => `${endTick > 0 ? (value / endTick) * 100 : 0}%`;

  return (
    <div className="timeline">
      <div className="timeline__row">
        <div className="timeline__transport">
          <button
            type="button"
            className="icon-btn"
            onClick={() => seek(0)}
            disabled={idle}
            title="Jump to the start (Home)"
            aria-label="Jump to the start"
          >
            <IconSkipStart />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => step(-1)}
            disabled={idle}
            title="Step back one tick (,)"
            aria-label="Step back one tick"
          >
            <IconStepBack />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={togglePlay}
            disabled={idle}
            title={playing ? 'Pause (space)' : 'Play (space)'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => step(1)}
            disabled={idle}
            title="Step forward one tick (.)"
            aria-label="Step forward one tick"
          >
            <IconStepForward />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => seek(endTick)}
            disabled={idle}
            title="Jump to the end (End)"
            aria-label="Jump to the end"
          >
            <IconSkipEnd />
          </button>
        </div>

        <span className="timeline__tick">
          {String(Math.floor(tick)).padStart(4, '0')}
          <span className="timeline__tick-end"> / {endTick}</span>
        </span>

        <span className="panel__head-spacer" />

        <label className="sr-only" htmlFor="speed">
          Playback speed
        </label>
        <select
          id="speed"
          className="select"
          value={String(speed)}
          onChange={(event) => setSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((option) => (
            <option key={String(option)} value={String(option)}>
              {speedLabel(option)}
            </option>
          ))}
        </select>
      </div>

      {/*
       * The run, as acts.
       *
       * A featureless bar tells you nothing about a three-minute solve; this one shows which
       * stretch of it belonged to which objective and pips the tick each one closed on, so
       * "the moment it went wrong" is somewhere you can aim at rather than hunt for.
       */}
      <div className="timeline__track">
        {acts.length > 0 || steps.length > 0 ? (
          <div className="timeline__acts" aria-hidden="true">
            {acts.map((act, index) => (
              <span
                key={act.id}
                className={[
                  'timeline__act',
                  tick >= act.from && tick <= act.to ? 'timeline__act--current' : '',
                  index % 2 === 1 ? 'timeline__act--alt' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: percent(act.from),
                  width: percent(Math.max(0, act.to - act.from)),
                }}
                title={`${act.label} — ticks ${act.from}–${act.to}`}
              />
            ))}
            {steps.map((mark) => (
              <span
                key={mark.id}
                className="timeline__step"
                style={{ left: percent(mark.tick) }}
                title={`${mark.label} — ${mark.done}/${mark.total} at tick ${mark.tick}`}
              />
            ))}
          </div>
        ) : null}

        <input
          type="range"
          className="timeline__scrub"
          style={{ ['--fill' as string]: `${fill}%` }}
          min={0}
          max={Math.max(1, endTick)}
          step={1}
          value={Math.round(tick)}
          disabled={idle}
          aria-label="Trace position, in ticks"
          aria-valuetext={`tick ${Math.round(tick)} of ${endTick}`}
          onChange={(event) => seek(Number(event.target.value))}
        />

        {marks.length > 0 ? (
          <div className="timeline__marks">
            {marks.map((mark) => (
              <button
                key={mark.id}
                type="button"
                className={[
                  'timeline__mark',
                  mark.met ? 'timeline__mark--met' : 'timeline__mark--lost',
                  mark.bonus ? 'timeline__mark--bonus' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: percent(mark.tick) }}
                onClick={() => seek(mark.tick)}
                title={`${mark.label} — ${mark.met ? 'met' : 'lost'} at tick ${mark.tick}`}
                aria-label={`Jump to tick ${mark.tick}, ${mark.label} ${mark.met ? 'met' : 'lost'}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
