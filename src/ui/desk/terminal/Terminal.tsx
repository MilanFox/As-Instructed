/**
 * The terminal. Upper-left, the newer of the two machines, and the largest and brightest object on
 * the desk while a program is being written.
 *
 * One screen holds four things and nothing else: the terminal bar, the program beside the
 * objectives rail, the `OUTPUT` log, and a status strip. Below the glass, on the physical bezel,
 * are the station's controls — see `BezelFoot.tsx`, which is where the settings live because a desk
 * has no settings screen.
 *
 * **No paper texture ever touches the code** (`docs/DESK-CONCEPT.md` §2). The program, the run and
 * the numbers coming back are digital; the work order, the certificate and the record are paper and
 * lie on the desk around the machines.
 */
import { useState } from 'react';

import { currentLevel, useGame } from '../../../game/store.ts';
import { AudioSettings } from '../../screens/AudioSettings.tsx';
import { BezelFoot } from './BezelFoot.tsx';
import { OutputLog } from './OutputLog.tsx';
import { Program } from './Program.tsx';
import { Rail } from './Rail.tsx';
import { RUN_HINT } from './keys.ts';

/**
 * Where the work order stands, in the station's own words.
 *
 * `EDIT` is yours, `SENT` is in flight, `RETURNED` is a run you can watch, `CLOSED` is one the
 * site accepted. It is the same four states the DISPATCH key's lamps carry, said in a word.
 */
function stateWord(running: boolean, watching: boolean, passed: boolean | undefined): string {
  if (running) return 'SENT';
  if (passed) return 'CLOSED';
  if (watching) return 'RETURNED';
  return 'EDIT';
}

export function Terminal(): React.JSX.Element {
  const level = useGame(currentLevel);
  const runState = useGame((state) => state.runState);
  const trace = useGame((state) => state.trace);
  const verdict = useGame((state) => state.verdict);
  const resetCode = useGame((state) => state.resetCode);
  const [problems, setProblems] = useState(0);
  const [sound, setSound] = useState(false);

  const state = stateWord(runState === 'running', trace !== null, verdict?.passed);

  return (
    <section className="display display--term">
      <div className="bezel">
        <div className="screen">
          <div className="term-bar">
            <span className="tb-host">station-4471</span>
            <span className="tb-sep">:</span>
            <span className="tb-path">~/orders/{level?.id ?? 'none'}</span>
            <span className="tb-spacer" />
            {/*
              The starter program, back. It was the editor panel's only header control and the
              desk has no panel headers, so it sits on the bar the path is on — it is an operation
              on this file, and that is what the bar names.
            */}
            <button
              type="button"
              className="tb-revert"
              onClick={resetCode}
              title="Restore the starter program for this work order"
            >
              revert
            </button>
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
            {/*
              One statement of one modifier for the one action that matters (docs/AUDIT-UI.md F17).
              The old RUN button drew `⌘⏎` while this line drew `ctrl+enter to run`, on the same
              screen; there is no second hint now, and the full key list is data in `keys.ts` so
              the REFERENCE manual prints the same bindings this strip does.
            */}
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
