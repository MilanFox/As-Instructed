/**
 * The transport, screwed to the monitor's case.
 *
 * Physical keys, a scrub track and a screen-printed readout, in the same 1988 language as the
 * housing they are on — every verb in this game is an object with a reason to exist, and playback
 * is the one verb the site feed owns.
 *
 * Two things here are requirements rather than decoration:
 *
 * **The zoom.** The board is a picture and the SIZE dial is a type scale, so the only honest
 * answer to "make the board bigger" is the camera's own `ZOOM_LADDER`. That is why it is a key on
 * the case and not a chip in a corner or a documented shortcut: the doors to everything in this
 * game used to be 10px chips, and that is the chrome the desk exists to abolish. The wheel still
 * works over the canvas; it is not the only way in.
 *
 * **The word `PLAYHEAD`.** Three tick counters used to show two current values within 700px, all
 * called ticks. This one is the position of the recording. The terminal's rail
 * keeps `par`, `limit` and `shift ends at`; nothing on the desk calls two different numbers by the
 * same noun.
 */
import { useMemo } from 'react';

import { landmarks, playbackFor, progressMarks, segments } from '../../../game/playback.ts';
import { SPEEDS, currentLevel, useGame } from '../../../game/store.ts';

function speedLabel(speed: number): string {
  return speed === Infinity ? 'instant' : `${String(speed)}x`;
}

interface TransportProps {
  /** Rungs up the camera's zoom ladder; `0` frames the whole site. Owned by `Monitor`, which has
      to know when the player has taken the camera. */
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
  const level = useGame(currentLevel);

  const idle = endTick <= 0;

  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const acts = useMemo(() => segments(playback), [playback]);
  const marks = useMemo(() => landmarks(playback), [playback]);
  const steps = useMemo(() => progressMarks(playback), [playback]);
  const percent = (value: number): string => `${String(endTick > 0 ? (value / endTick) * 100 : 0)}%`;

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
          disabled={idle}
          title={playing ? 'Pause (space)' : 'Play (space)'}
          aria-label={playing ? 'Pause' : 'Play'}
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
      </div>

      {/*
       * The run, as acts. A featureless bar tells you nothing about a three-minute solve; this one
       * shows which stretch belonged to which objective and pips the tick each closed on, so "the
       * moment it went wrong" is somewhere to aim at rather than to hunt for.
       */}
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

      {/*
       * The accessibility tree prints `combobox "1x"` because that is the control's *value*.
       * It already has a name from the label below. An `aria-label` here would give it a second one.
       */}
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

      {/*
       * These keys follow the ruling that every door is an object with weight rather than a corner
       * chip. They used to be three unlabelled ~10px glyphs beside a 6px legend: a player who
       * could not read the walls spent two minutes resizing the browser and found `FIT` by
       * reading the accessibility tree, not by looking at the screen. It solved their problem the
       * moment they pressed it. Same place, same three rungs, drawn as keys with words on them.
       */}
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
