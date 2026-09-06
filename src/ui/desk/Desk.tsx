/**
 * The desk.
 *
 * The player is a remote contract programmer at Kessler & Daughters and the screen is their
 * workstation. Nothing here is chrome: there is a terminal, a site monitor, a dispatch key, a
 * stamp block, a copy stand, a bound Repository, a wire-bound reference, an in-tray, a keyboard
 * and loose paper. `docs/DESK-CONCEPT.md` is the design; this is the wiring.
 *
 * **The screen is the work; the paper is the company.** The program, the site view, the run and
 * the numbers are digital and live on two screens. The work order, the requisition, the memo and
 * the record are paper and lie on the desk *around* the machines. No paper texture ever touches
 * the code.
 *
 * The composition is a fixed arrangement on one unit, `--u`, fitted to the viewport. Every
 * position in the stylesheets is written in design units against `DESK_FRAME`. It is not a
 * responsive layout and it is not meant to be: the arrangement is the approved one and moving the
 * furniture is not polish.
 */
import { useEffect, useRef, useState } from 'react';

import { useGame } from '../../game/store.ts';
import { storedArt } from '../art.ts';
import { PanelBoundary } from '../components/PanelBoundary.tsx';
import { DESK_FRAME, deskUnit, useDeskSize } from './scale.ts';
import { Terminal } from './terminal/Terminal.tsx';
import { Monitor } from './monitor/Monitor.tsx';
import { PaperLayer } from './paper/PaperLayer.tsx';
import { CopyStand } from './paper/CopyStand.tsx';
import { usePapers } from './paper/papers.ts';
import {
  Binder,
  Dispatch,
  DeskKeyboard,
  Manual,
  Pen,
  SitePlan,
  Slot,
  StampBlock,
  Tray,
} from './furniture/index.tsx';

import '../styles/desk/desk.css';
import '../styles/desk/terminal.css';
import '../styles/desk/monitor.css';
import '../styles/desk/paper.css';
import '../styles/desk/furniture.css';

/**
 * What the room is doing. The lamp dims and the site feed throws light back onto the desk while a
 * run is playing — the mode change is a change of *light*, never of geometry. An early build
 * pushed the monitor back on a CSS `perspective` and it broke DESIGN §8's "no curvature", which
 * is a gameplay rule wearing an aesthetic hat and applies to the chrome too.
 */
export type DeskMode = 'write' | 'run' | 'watch';

/**
 * Every object on the desk, each with the name its boundary reports it by.
 *
 * These are lists rather than markup on purpose. A `<Binder>` that threw once took the *whole desk*
 * black — the site view, the paperwork and the program the player was in the middle of writing —
 * which is `docs/AUDIT-UI.md` F21 returning in furniture rather than in a modal. One boundary per
 * object fixes it, but a boundary applied by hand is a convention, and the next object added
 * re-opens the hole silently. Rendering from a list means there is exactly one place a boundary
 * can be omitted, and `src/ui/__tests__/desk-boundaries.test.ts` fails if an object is missing
 * from these lists at all.
 *
 * The program itself is safe independently: `setCode` writes through to `localStorage` on every
 * keystroke, so a boundary trip costs the object and never the work.
 */
export type DeskObject = readonly [label: string, render: () => React.ReactElement];

/** The two machines. They sit inside `.station`, which positions them against each other. */
export const STATION: readonly DeskObject[] = [
  ['The terminal', Terminal],
  ['The site feed', Monitor],
];

/** Everything loose on the desk around them. */
export const DESKWARE: readonly DeskObject[] = [
  ['The delivery slot', Slot],
  ['The copy stand', CopyStand],
  ['The in-tray', Tray],
  ['The dispatch key', Dispatch],
  /*
   * The way back to the campaign, and it is an object because it has to be findable. A player
   * opened a work order and could not return to the site map — they said so — and a game you
   * cannot get out of a level in is broken. The same complaint as `docs/AUDIT-UI.md` F12: the
   * doors were 10px chips, and a door nobody can see is a door that is not there.
   */
  ['The site plan', SitePlan],
  ['The Repository', Binder],
  ['The reference', Manual],
  ['The stamp block', StampBlock],
  ['The pen', Pen],
  ['The keyboard', DeskKeyboard],
  ['The paperwork', PaperLayer],
];

function contained([label, Render]: DeskObject): React.ReactElement {
  return (
    <PanelBoundary key={label} label={label}>
      <Render />
    </PanelBoundary>
  );
}

function useDeskUnit(): number {
  const [unit, setUnit] = useState(() =>
    typeof window === 'undefined'
      ? 1
      : deskUnit(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const measure = (): void => {
      setUnit(deskUnit(window.innerWidth, window.innerHeight));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);
  return unit;
}

export function Desk(): React.ReactElement {
  const unit = useDeskUnit();
  const size = useDeskSize();
  const runState = useGame((state) => state.runState);
  const playing = useGame((state) => state.playing);
  const trace = useGame((state) => state.trace);

  const lifted = usePapers((state) => state.lifted);
  const putDown = usePapers((state) => state.putDown);
  const deskRef = useRef<HTMLDivElement>(null);

  const mode: DeskMode =
    runState === 'running' || playing ? 'run' : trace ? 'watch' : 'write';

  /*
   * The shell does not retire paper. It used to clear the last order's sheet from here, which
   * raced `usePaperwork`'s issuer: the clear ran on the desk's own mount, the issue is keyed on the
   * work order, and `issueOnce` will not re-issue an id it has already seen — so the clear could
   * win and the player arrived at a desk with no work order on it. A player who cannot find the
   * brief cannot play. Issuing and retiring are one decision and they live together, in
   * `paper/usePaperwork.ts`.
   */

  /*
   * Clicking the desk puts down whatever is being held up to the lamp. This is the whole of the
   * put-down gesture — there is no backdrop, no scrim and no dismiss button, because a sheet that
   * can be dismissed is a sheet that can be lost.
   */
  const onDeskClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!lifted) return;
    const target = event.target as HTMLElement;
    if (target.closest('.doc, button, input, textarea, canvas, .cs-page')) return;
    putDown();
  };

  return (
    <div
      className="desk"
      ref={deskRef}
      data-mode={mode}
      data-art={storedArt()}
      data-doc={lifted ? 'up' : 'none'}
      style={
        {
          '--u': `${unit}px`,
          '--ts': size,
          '--frame-w': DESK_FRAME.w,
          '--frame-h': DESK_FRAME.h,
        } as React.CSSProperties
      }
      onClick={onDeskClick}
    >
      <div className="room" aria-hidden="true">
        <div className="wall" />
        <div className="wall-rail" />
        <div className="desk-surface">
          <div className="desk-edge" />
          <div className="desk-top" />
        </div>
        <div className="lamp" />
        <div className="spill" />
        <div className="vignette" />
      </div>

      <div className="station">{STATION.map(contained)}</div>

      {DESKWARE.map(contained)}
    </div>
  );
}
