/**
 * The terminal. Upper-left, the newer of the two machines, and the largest and brightest object on
 * the desk while a program is being written.
 *
 * One screen holds four things and nothing else: the terminal bar, the program beside the
 * objectives rail, the `OUTPUT` log, and a status strip. Below the glass, on the physical bezel,
 * are the station's controls — see `BezelFoot.tsx`, which is where the settings live because a desk
 * has no settings screen.
 *
 * **No paper texture ever touches the code.** The program, the run and
 * the numbers coming back are digital; the work order, the certificate and the record are paper and
 * lie on the desk around the machines.
 */
import { useState } from 'react';

import { useGame } from '../../../game/store.ts';
import { useLibrary } from '../../../meta/store.ts';
import { AudioSettings } from '../../screens/AudioSettings.tsx';
import { BezelFoot } from './BezelFoot.tsx';
import { FileRail } from './FileRail.tsx';
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
  const runState = useGame((state) => state.runState);
  const trace = useGame((state) => state.trace);
  const verdict = useGame((state) => state.verdict);
  const resetCode = useGame((state) => state.resetCode);
  const [problems, setProblems] = useState(0);
  const [sound, setSound] = useState(false);
  /*
   * `~/lib.ts` is drawn on this glass, so while it is the loaded file everything under it — the
   * program, the objectives rail, the log and this bar's own copy of the file rail — is covered.
   * Covered is not hidden: without `inert` a screen reader still walks all of it, and the file rail
   * in particular reads out twice.
   */
  const libLoaded = useLibrary((state) => state.save.unlocked && state.panelOpen);

  const state = stateWord(runState === 'running', trace !== null, verdict?.passed);

  return (
    <section className="display display--term">
      <div className="bezel">
        <div className="screen" inert={libLoaded}>
          <div className="term-bar">
            <span className="tb-host">station-4471</span>
            <span className="tb-sep">:</span>
            {/*
              Which file the station has loaded. One path until the Repository is provisioned, and
              a rail of two once it is — see `FileRail.tsx`.
            */}
            <FileRail />
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
              One statement of one modifier for the one action that matters.
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
