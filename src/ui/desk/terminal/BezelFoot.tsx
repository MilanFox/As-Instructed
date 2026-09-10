/**
 * The chin of the monitor, which is where the settings are.
 *
 * It is the one place a player looks for preferences, with everything configurable in it. On a
 * desk that place cannot be a screen — there is no menu anywhere — so it is the terminal's own
 * bezel, where a 1988 monitor carried H-SIZE and V-SIZE. Four legends screen-printed on a brushed
 * plate:
 *
 * - `SIZE`     — the character-size dial (`src/ui/desk/scale.ts`).
 * - `FOCUS`    — which view the station is in (`src/ui/desk/focus.ts`). `DESK` is the arrangement
 *                you are looking at; `PROGRAM` takes the desk off screen and leaves the terminal
 *                and the site feed as a preview. The one control on this plate that changes what
 *                is on screen rather than its colours, its type or its noise — and in that view it
 *                is the only way back, which is why the plate itself is load-bearing there.
 * - `DISPLAY`  — the art direction (§6.4). Deep Site, or Signal, which is a high-contrast mode.
 * - `REPORTS`  — the setting that used to be an 11px dotted-underline footnote in the corner of
 *                the run report, which read as "skip *this* animation" and was not.
 * - `SOUND`    — its own dialog, opened onto the terminal's screen rather than over the desk.
 *
 * Every one of them is hardware at rest: a knurled dial, two throw switches and a key. An enabled
 * control must be visibly a control without being hovered, and a moulded object is the strongest
 * form of that — you can see which of these can be pressed in a still.
 *
 * Five controls, the maker legend and the power lamp on a plate 806 design units wide, and the
 * binding case is SIZE 1.5 where the type scales and the hardware does not. Measured there, the
 * five wanted 857u of it and wrapped a second row onto the DISPATCH key. The room came out of the
 * plate's own spacing and out of the controls' *readings*: the gap 10u to 7u, the side padding 14u
 * to 10u, and the readings' tracking `.22em` to `.08em` — the readings only, because `REPORTS`
 * reads `ONE LINE AT A TIME` and at `.22em` a quarter of that string's width is tracking. The
 * silkscreen labels keep `.22em`, which is the half of this plate that reads as moulded case
 * rather than as a toolbar. That brings it to 779.1u, which is the four-control plate's own margin
 * back again; the arithmetic is in `terminal.css` beside the rules and in
 * `docs/audits/focus-mode.md`. Nothing was removed to make room.
 */
import { useRef, useState } from 'react';
import type { ArtId } from '../../../render/theme.ts';
import { useGame } from '../../../game/store.ts';
import { chooseArt, storedArt } from '../../art.ts';
import { toggleDeskFocus, useDeskFocus } from '../focus.ts';
import { SIZE_STOPS, turnDeskSize, useDeskSize } from '../scale.ts';

/**
 * `setArt` is on the renderer and deliberately not on `RendererPort`, the same way `setPreview` is
 * (`src/ui/panels/ViewportPanel.tsx`): the port is shared with `FakeRenderer`, which exists so the
 * store can be tested without a canvas and would only ever no-op a repaint. Narrowed structurally
 * at the one call site that wants it.
 */
type ArtRenderer = { setArt?(id: ArtId): void };

/** Two directions ship. `standard` and `survey` are cut. */
const DISPLAY_NAMES: Record<'deepsite' | 'signal', string> = {
  deepsite: 'DEEP SITE',
  signal: 'SIGNAL',
};

export function BezelFoot({ onSound }: { onSound: () => void }): React.JSX.Element {
  const size = useDeskSize();
  const focused = useDeskFocus();
  const renderer = useGame((state) => state.renderer);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const setCelebrations = useGame((state) => state.setCelebrations);
  const [art, setArt] = useState<ArtId>(storedArt);
  const plateRef = useRef<HTMLDivElement | null>(null);

  const detent = Math.max(0, SIZE_STOPS.indexOf(size));

  const turnDisplay = (): void => {
    const next: ArtId = art === 'signal' ? 'deepsite' : 'signal';
    setArt(next);
    chooseArt(next);
    (renderer() as ArtRenderer).setArt?.(next);
    /*
     * `chooseArt` writes the palette and `data-art` onto the document element; the desk carries its
     * own `data-art` for the rules scoped under `.desk`, and it is rendered from a plain read of
     * localStorage rather than from a subscription. Writing it here is what makes the switch's own
     * knob move on the click that moved it.
     */
    plateRef.current?.closest('.desk')?.setAttribute('data-art', next);
  };

  const displayName = DISPLAY_NAMES[art === 'signal' ? 'signal' : 'deepsite'];
  const reportsNow = celebrations ? 'ONE LINE AT A TIME' : 'ALL AT ONCE';
  const reportsNext = celebrations ? 'all at once' : 'one line at a time';

  return (
    <div className="bezel-foot" ref={plateRef}>
      <span className="maker">ISOMER 21 · TERMINAL</span>

      <button
        type="button"
        className="sizeknob"
        onClick={() => turnDeskSize()}
        title="Character size — turn for the next size"
        aria-label={`Character size, ${size.toFixed(2).replace(/0$/, '')} — turn for the next size`}
      >
        <span className="sk-dial" aria-hidden="true">
          <i style={{ '--a': `${String(-50 + detent * 33)}deg` } as React.CSSProperties} />
        </span>
        <span className="sk-legend">
          SIZE <b>{size.toFixed(2).replace(/0$/, '')}</b>
        </span>
      </button>

      <button
        type="button"
        className="focussw"
        onClick={() => toggleDeskFocus()}
        aria-pressed={focused}
        title="Program leaves the terminal and a preview of the site, and takes the desk off screen"
        aria-label={`Focus: ${focused ? 'program' : 'desk'}. Switch to ${
          focused
            ? 'desk, the two machines on the desk with your paperwork'
            : 'program, the terminal and the site feed as a preview, with the desk off screen'
        }`}
      >
        <span className="fsw-track" aria-hidden="true">
          <i />
        </span>
        <span className="fsw-legend">
          FOCUS <b>{focused ? 'PROGRAM' : 'DESK'}</b>
        </span>
      </button>

      <button
        type="button"
        className="dispsw"
        onClick={turnDisplay}
        aria-pressed={art === 'signal'}
        title="Signal is a high-contrast display for the site view"
        aria-label={`Display: ${displayName.toLowerCase()}. Switch to ${
          art === 'signal' ? 'deep site, the standard display' : 'signal, a high-contrast display'
        }`}
      >
        <span className="dsw-track" aria-hidden="true">
          <i />
        </span>
        <span className="dsw-legend">
          DISPLAY <b>{displayName}</b>
        </span>
      </button>

      <button
        type="button"
        className="repsw"
        onClick={() => {
          setCelebrations(!celebrations);
        }}
        aria-pressed={!celebrations}
        title="How a closed work order reports itself"
        aria-label={`Reports: ${reportsNow.toLowerCase()}. Switch to ${reportsNext}`}
      >
        <span className="rsw-track" aria-hidden="true">
          <i />
        </span>
        <span className="rsw-legend">
          REPORTS <b>{reportsNow}</b>
        </span>
      </button>

      <button type="button" className="footkey" onClick={onSound}>
        SOUND
      </button>

      <span className="pwr" aria-hidden="true" />
    </div>
  );
}
