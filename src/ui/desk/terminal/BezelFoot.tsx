import { useRef, useState } from 'react';
import type { ArtId } from '../../../render/theme.ts';
import { useGame } from '../../../game/store.ts';
import { chooseArt, storedArt } from '../../art.ts';
import { toggleDeskFocus, useDeskFocus } from '../focus.ts';
import { SIZE_STOPS, turnDeskSize, useDeskSize } from '../scale.ts';

type ArtRenderer = { setArt?(id: ArtId): void };

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
