import { SPEEDS, useGame } from '../../game/store.ts';
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

/** Scrubber, transport and speed. Scrubbing is a pure `seek`, so it is immediate at any speed. */
export function TimelineBar(): React.JSX.Element {
  const tick = useGame((state) => state.tick);
  const endTick = useGame((state) => state.endTick);
  const playing = useGame((state) => state.playing);
  const speed = useGame((state) => state.speed);
  const seek = useGame((state) => state.seek);
  const step = useGame((state) => state.step);
  const togglePlay = useGame((state) => state.togglePlay);
  const setSpeed = useGame((state) => state.setSpeed);

  const idle = endTick <= 0;
  const fill = idle ? 0 : (tick / endTick) * 100;

  return (
    <div className="timeline">
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

      <span className="timeline__tick">
        {String(Math.floor(tick)).padStart(4, '0')}
        <span className="timeline__tick-end"> / {endTick}</span>
      </span>

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
  );
}
