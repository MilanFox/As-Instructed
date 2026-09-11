import { useEffect, useRef, useState } from 'react';

import { useGame } from '../../../game/store.ts';

const THROW_MS = 170;

type Lamp = 'ready' | 'flight' | 'returned';

const LEGEND: Record<Lamp, string> = {
  ready: 'send this solution against every seed',
  flight: 'in flight · 41 min',
  returned: 'trace returned',
};

export function Dispatch(): React.ReactElement {
  const runState = useGame((state) => state.runState);
  const trace = useGame((state) => state.trace);
  const runMode = useGame((state) => state.runMode);
  const run = useGame((state) => state.run);
  const cancel = useGame((state) => state.cancel);
  const [down, setDown] = useState(false);
  const wasRunning = useRef(false);
  const settle = useRef(0);

  const running = runState === 'running';
  const lamp: Lamp = running ? 'flight' : runMode === 'dispatch' && trace ? 'returned' : 'ready';

  useEffect(() => {
    if (running === wasRunning.current) return;
    wasRunning.current = running;
    if (!running) return;
    setDown(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setDown(false), THROW_MS);
  }, [running]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  return (
    <div className="dispatch">
      <button
        type="button"
        className={down ? 'dsp-key down' : 'dsp-key'}
        aria-label={
          running ? 'Recall the program' : 'Dispatch — run this solution against every seed'
        }
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
