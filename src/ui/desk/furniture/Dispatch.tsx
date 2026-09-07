/**
 * DISPATCH — the commitment act, as an object.
 *
 * *You throw it.* Running a program is the one irreversible thing the
 * player does in a session, and a toolbar button with a triangle on it says nothing about that. A
 * guarded key on the desk with three lamps says the program leaves the room, travels forty
 * light-minutes and comes back as a trace, which is what actually happens.
 *
 * The travel is load-bearing rather than decorative: it is the feedback that the throw registered,
 * and `ctrl+enter` throws the same key, so the keyboard and the hand agree about what happened.
 */
import { useEffect, useRef, useState } from 'react';

import { useGame } from '../../../game/store.ts';

/** How long the key stays down. Long enough to see, short enough not to be a wait. */
const THROW_MS = 170;

type Lamp = 'ready' | 'flight' | 'returned';

/** What the company says the run is doing. Its own voice, not the engine's. */
const LEGEND: Record<Lamp, string> = {
  ready: 'program not yet sent',
  flight: 'in flight · 41 min',
  returned: 'trace returned',
};

export function Dispatch(): React.ReactElement {
  const runState = useGame((state) => state.runState);
  const trace = useGame((state) => state.trace);
  const run = useGame((state) => state.run);
  const cancel = useGame((state) => state.cancel);
  const [down, setDown] = useState(false);
  const wasRunning = useRef(false);
  const settle = useRef(0);

  const running = runState === 'running';
  const lamp: Lamp = running ? 'flight' : trace ? 'returned' : 'ready';

  /*
   * The key throws whoever threw it. `ctrl+enter` calls `run()` straight off the window, so
   * watching the store rather than the pointer is what keeps the two from disagreeing.
   */
  useEffect(() => {
    if (running === wasRunning.current) return;
    wasRunning.current = running;
    if (!running) return;
    setDown(true);
    /*
     * The timer outlives this effect on purpose. A short run ends inside the throw, and hanging
     * the timeout off the effect's cleanup meant `running` going false cancelled the key's return
     * — it stayed down for the rest of the session.
     */
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setDown(false), THROW_MS);
  }, [running]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  return (
    <div className="dispatch">
      <button
        type="button"
        className={down ? 'dsp-key down' : 'dsp-key'}
        aria-label={running ? 'Recall the program' : 'Dispatch program to site'}
        onClick={() => {
          if (running) cancel();
          else run();
        }}
      >
        <span className="dsp-face" />
        <span className="dsp-collar" />
      </button>
      <div className="dsp-legend">
        <b>DISPATCH</b>
        <span>{LEGEND[lamp]}</span>
      </div>
      <div className="dsp-lamps">
        <i className={lamp === 'ready' ? 'lamp-r on' : 'lamp-r'} title="ready" />
        <i className={lamp === 'flight' ? 'lamp-o on' : 'lamp-o'} title="in flight" />
        <i className={lamp === 'returned' ? 'lamp-b on' : 'lamp-b'} title="returned" />
      </div>
    </div>
  );
}
