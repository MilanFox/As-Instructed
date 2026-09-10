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

/**
 * Where the work order stands, in the station's own words.
 *
 * `EDIT` is yours, `SENT` is in flight, `RETURNED` is a run you can watch, `CLOSED` is one the
 * site accepted. It is the same four states the DISPATCH key's lamps carry, said in a word.
 *
 * `CLOSED` and `RETURNED` both hinge on `mode === 'dispatch'`: a preview leaves `trace`/`verdict`
 * set too, but it never went to site, so it must never claim either word — it falls through to
 * `EDIT`, same as a work order nothing has run yet.
 */
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

/**
 * The glass, publishing its own box.
 *
 * `~/lib.ts` is drawn on this screen and is not a child of it: it is on `Desk.tsx`'s `DESKWARE`
 * list, with its own `PanelBoundary`, because it compiles TypeScript and runs a regression suite and
 * a fault in it must never cost the player the program they are writing. On the desk that costs
 * nothing — the panel's box is arithmetic, the bezel's padding off the terminal's stated width and
 * the screen's stated height, and `src/ui/__tests__/desk-frame.test.ts` recomputes both from the
 * stylesheets so the two cannot drift.
 *
 * In the FOCUS view there is no arithmetic to do. The screen is as tall and as wide as the window
 * left it after the station's grid, and no `calc()` in `--u` can name that. So the glass measures
 * itself on every layout change and writes its box onto `.desk`, where `.routines` reads it back.
 * The identity is the same identity — the panel is the glass and nothing else, so it still cannot
 * reach the desk, the paper or the site feed — established the only way it can be once a box is
 * laid out rather than placed.
 *
 * It publishes in both views. Writing the properties only while focused would leave the two views
 * disagreeing about where the glass is, and the next person to read `.routines` with two answers in
 * front of them would have to work out which one was the live one.
 */
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
    /*
     * The box moves without changing size, and a resize observer on the element hears nothing about
     * that: throwing the FOCUS switch walks the glass's left edge from `50% - 747u` over to the
     * station's own padding, and there are viewports where the width and the height survive the
     * trip. The desk is the thing that changed, so the desk is watched for it too.
     */
    const room = new ResizeObserver(publish);
    room.observe(desk);
    return () => {
      glass.disconnect();
      room.disconnect();
    };
  }, []);
  return screen;
}

/** The way back to the stamp block, said once, on the strip that already says how to run. */
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
  /*
   * `~/lib.ts` is drawn on this glass, so while it is the loaded file everything under it — the
   * program, the objectives rail, the log and this bar's own copy of the file rail — is covered.
   * Covered is not hidden: without `inert` a screen reader still walks all of it, and the file rail
   * in particular reads out twice.
   */
  const libLoaded = useLibrary((state) => state.save.unlocked && state.panelOpen);

  const state = stateWord(runState === 'running', trace !== null, verdict?.passed, runMode);

  return (
    <section className="display display--term">
      <div className="bezel">
        <div className="screen" ref={glass} inert={libLoaded}>
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
            {/*
              One statement of one modifier for the one action that matters.
              The old RUN button drew `⌘⏎` while this line drew `ctrl+enter to run`, on the same
              screen; there is no second hint now, and the full key list is data in `keys.ts` so
              the REFERENCE manual prints the same bindings this strip does.
            */}
            {/*
              The stamp block is on the desk and the FOCUS view has no desk, so a passing verdict
              would otherwise land on a surface the player cannot see. DESIGN §11 does not let the
              way to finish a level be a thing you have to already know. One sentence, on the strip
              that already carries the one procedural hint in the game, in the strip's own register —
              NARRATIVE §0 keeps the jokes off status text — and the key is read out of `KEY_LIST`
              so it cannot disagree with the binding or with what the REFERENCE prints.
            */}
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
