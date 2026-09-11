import { useEffect, useRef, useState } from 'react';

import { useGame } from '../../../game/store.ts';
import { useLibrary } from '../../../meta/store.ts';
import { AudioSettings } from '../../screens/AudioSettings.tsx';
import { BezelFoot } from './BezelFoot.tsx';
import { FileRail } from './FileRail.tsx';
import { OutputLog } from './OutputLog.tsx';
import { Program } from './Program.tsx';
import { Rail } from './Rail.tsx';
import { useDeskFocus } from '../focus.ts';
import { KEY_LIST, RUN_HINT } from './keys.ts';

function stateWord(
  running: boolean,
  watching: boolean,
  passed: boolean | undefined,
  mode: 'dispatch' | 'preview' | null,
): string {
  if (running) return 'SENT';
  if (mode !== 'dispatch') return 'EDIT';
  if (passed) return 'CLOSED';
  if (watching) return 'RETURNED';
  return 'EDIT';
}

function usePublishedGlass(): React.RefObject<HTMLDivElement | null> {
  const screen = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = screen.current;
    const desk = element?.closest('.desk');
    if (!element || !(desk instanceof HTMLElement)) return;
    const publish = (): void => {
      const box = element.getBoundingClientRect();
      desk.style.setProperty('--glass-x', `${String(box.left)}px`);
      desk.style.setProperty('--glass-y', `${String(box.top)}px`);
      desk.style.setProperty('--glass-w', `${String(box.width)}px`);
      desk.style.setProperty('--glass-h', `${String(box.height)}px`);
    };
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const glass = new ResizeObserver(publish);
    glass.observe(element);
    const room = new ResizeObserver(publish);
    room.observe(desk);
    return () => {
      glass.disconnect();
      room.disconnect();
    };
  }, []);
  return screen;
}

const CLOSE_HINT = `work order ready to close — ${
  KEY_LIST.find((binding) => binding.id === 'focus')?.keys ?? 'ctrl+shift+f'
} for the desk and the stamp block`;

export function Terminal(): React.JSX.Element {
  const runState = useGame((state) => state.runState);
  const trace = useGame((state) => state.trace);
  const verdict = useGame((state) => state.verdict);
  const runMode = useGame((state) => state.runMode);
  const resetCode = useGame((state) => state.resetCode);
  const focused = useDeskFocus();
  const glass = usePublishedGlass();
  const [problems, setProblems] = useState(0);
  const [sound, setSound] = useState(false);
  const libLoaded = useLibrary((state) => state.save.unlocked && state.panelOpen);

  const state = stateWord(runState === 'running', trace !== null, verdict?.passed, runMode);

  return (
    <section className="display display--term">
      <div className="bezel">
        <div className="screen" ref={glass} inert={libLoaded}>
          <div className="term-bar">
            <span className="tb-host">station-4471</span>
            <span className="tb-sep">:</span>
            <FileRail />
            <span className="tb-spacer" />
            <button
              type="button"
              className="tb-revert"
              onClick={resetCode}
              title="Restore the starter program for this work order"
            >
              revert
            </button>
            <span
              className="tb-saved"
              title="Every keystroke is written to your save automatically."
            >
              autosaves
            </span>
            <span className="tb-state">{state}</span>
          </div>

          <div className="term-body">
            <Program onProblems={setProblems} />
            <Rail />
          </div>

          <OutputLog />

          <div className={`term-status${problems > 0 ? ' err' : ''}`}>
            <span>
              {problems === 0 ? 'no problems' : `${problems} problem${problems === 1 ? '' : 's'}`}
            </span>
            {focused && verdict?.passed ? <span className="ts-close">{CLOSE_HINT}</span> : null}
            <span className="ts-right">{RUN_HINT}</span>
          </div>

          {sound ? (
            <div className="term-panel">
              <AudioSettings
                onClose={() => {
                  setSound(false);
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="glass" />
      </div>

      <BezelFoot
        onSound={() => {
          setSound(true);
        }}
      />

      <div className="stand stand--term" />
    </section>
  );
}
