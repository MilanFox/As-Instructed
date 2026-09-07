/**
 * The chin of the monitor, which is where the settings are.
 *
 * It is the one place a player looks for preferences, with everything configurable in it. On a
 * desk that place cannot be a screen — there is no menu anywhere — so it is the terminal's own
 * bezel, where a 1988 monitor carried H-SIZE and V-SIZE. Four legends screen-printed on a brushed
 * plate:
 *
 * - `SIZE`     — the character-size dial (`src/ui/desk/scale.ts`).
 * - `DISPLAY`  — the art direction (§6.4). Deep Site, or Signal, which is a high-contrast mode.
 * - `REPORTS`  — the setting that used to be an 11px dotted-underline footnote in the corner of
 *                the run report, which read as "skip *this* animation" and was not.
 * - `SOUND`    — its own dialog, opened onto the terminal's screen rather than over the desk.
 *
 * Every one of them is hardware at rest: a knurled dial, two throw switches and a key. An enabled
 * control must be visibly a control without being hovered, and a moulded object is the strongest
 * form of that — you can see which of these can be pressed in a still.
 */
import { useRef, useState } from 'react';
import type { ArtId } from '../../../render/theme.ts';
import { useGame } from '../../../game/store.ts';
import { chooseArt, storedArt } from '../../art.ts';
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
