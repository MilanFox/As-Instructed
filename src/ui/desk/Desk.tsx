import { useEffect, useRef, useState } from 'react';

import { useGame } from '../../game/store.ts';
import { storedArt } from '../art.ts';
import { PanelBoundary } from '../components/PanelBoundary.tsx';
import { useDeskFocus } from './focus.ts';
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
  Routines,
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

export type DeskMode = 'write' | 'run' | 'watch';

export type DeskObject = readonly [label: string, render: () => React.ReactElement];

export const STATION: readonly DeskObject[] = [
  ['The terminal', Terminal],
  ['The site feed', Monitor],
];

export const DESKWARE: readonly DeskObject[] = [
  ['The delivery slot', Slot],
  ['The copy stand', CopyStand],
  ['The in-tray', Tray],
  ['The dispatch key', Dispatch],
  ['The site plan', SitePlan],
  ['The Commendation Book', Binder],
  ['The reference', Manual],
  ['The routines', Routines],
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
    typeof window === 'undefined' ? 1 : deskUnit(window.innerWidth, window.innerHeight),
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
  const focused = useDeskFocus();
  const runState = useGame((state) => state.runState);
  const playing = useGame((state) => state.playing);
  const trace = useGame((state) => state.trace);

  const lifted = usePapers((state) => state.lifted);
  const putDown = usePapers((state) => state.putDown);
  const deskRef = useRef<HTMLDivElement>(null);

  const mode: DeskMode = runState === 'running' || playing ? 'run' : trace ? 'watch' : 'write';

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
      data-focus={focused ? 'program' : 'desk'}
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
