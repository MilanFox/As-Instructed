import { useCallback, useEffect, useRef, useState } from 'react';

import { PanelBoundary } from '../components/PanelBoundary.tsx';
import { closeOverlay, useOverlay } from '../hooks/useOverlay.ts';
import { COMPACT_QUERY } from './breakpoints.ts';
import { ClosedBanner } from './ClosedBanner.tsx';
import type { DrawerTab } from './Drawer.tsx';
import { Drawer } from './Drawer.tsx';
import { FeedCanvas } from './FeedCanvas.tsx';
import { Postings } from './Postings.tsx';
import { ReportSheet } from './ReportSheet.tsx';
import { TelemetryPanel } from './TelemetryPanel.tsx';
import { TransportDeck } from './TransportDeck.tsx';
import { useFeedZoom } from './useFeedZoom.ts';
import { useWorkspace } from './useWorkspace.ts';
import { WorkOrderCard } from './WorkOrderCard.tsx';

import '../styles/workspace/workspace.css';
import '../styles/workspace/panel.css';
import '../styles/workspace/order.css';
import '../styles/workspace/telemetry.css';
import '../styles/workspace/deck.css';
import '../styles/workspace/drawer.css';
import '../styles/workspace/report.css';
import '../styles/workspace/banner.css';
import '../styles/workspace/reflow.css';

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const sync = (): void => {
      setMatches(list.matches);
    };
    sync();
    list.addEventListener('change', sync);
    return () => {
      list.removeEventListener('change', sync);
    };
  }, [query]);
  return matches;
}

export function Workspace(): React.ReactElement {
  const workspace = useWorkspace();
  const zoom = useFeedZoom();
  const compact = useMedia(COMPACT_QUERY);

  // Arriving with nothing to watch means the job is to write; arriving with a trace
  // means the job is to look at it.
  const [open, setOpen] = useState(
    () => !window.matchMedia(COMPACT_QUERY).matches && workspace.trace === null,
  );
  const [tab, setTab] = useState<DrawerTab>('program');
  const [orderOpen, setOrderOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [problems, setProblems] = useState(0);
  const [readout, setReadout] = useState<string | null>(null);

  const handleRef = useRef<HTMLButtonElement | null>(null);

  const openDrawer = useCallback((): void => {
    setOpen(true);
    setTelemetryOpen(false);
    setOrderOpen(false);
  }, []);

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  const toggle = useCallback((): void => {
    setOpen((was) => {
      if (!was) {
        setTelemetryOpen(false);
        setOrderOpen(false);
      }
      return !was;
    });
  }, []);

  const openTo = useCallback(
    (next: DrawerTab): void => {
      setTab(next);
      openDrawer();
    },
    [openDrawer],
  );

  const toggleTelemetry = useCallback((): void => {
    setTelemetryOpen((was) => {
      if (!was) {
        setOpen(false);
        setOrderOpen(false);
      }
      return !was;
    });
  }, []);

  const toggleOrder = useCallback((): void => {
    setOrderOpen((was) => {
      if (!was) {
        setOpen(false);
        setTelemetryOpen(false);
      }
      return !was;
    });
  }, []);

  const dispatch = useCallback((): void => {
    setOpen(false);
    workspace.run();
  }, [workspace]);

  const running = workspace.runState === 'running';
  useEffect(() => {
    if (running) setOpen(false);
  }, [running]);

  const fresh = workspace.showResults;
  useEffect(() => {
    if (fresh) setSheetOpen(true);
  }, [fresh]);

  useEffect(() => {
    if (open) return;
    const active = document.activeElement;
    const drawer = document.getElementById('workspace-drawer');
    if (active && drawer?.contains(active)) handleRef.current?.focus();
  }, [open]);

  // The shortcut store drives the drawer, and shutting the drawer by any route drives the
  // store back. The ref tells an incoming request apart from our own echo of it.
  const referenceRequested = useOverlay().open === 'docs';
  const requestHandled = useRef(referenceRequested);

  useEffect(() => {
    if (referenceRequested !== requestHandled.current) {
      requestHandled.current = referenceRequested;
      if (referenceRequested) openTo('manual');
      else setOpen(false);
      return;
    }
    if (referenceRequested && (!open || tab !== 'manual')) {
      requestHandled.current = false;
      closeOverlay();
    }
  }, [referenceRequested, open, tab, openTo]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen((was) => {
        if (was) handleRef.current?.focus();
        return false;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const dismissSheet = useCallback((): void => {
    setSheetOpen(false);
    workspace.dismissResults();
  }, [workspace]);

  const watching = running || workspace.playing;
  const report = sheetOpen ? workspace.report : null;

  return (
    <div
      className="workspace"
      data-drawer={open ? 'open' : 'shut'}
      data-watch={String(watching)}
      data-sheet={report ? 'open' : 'shut'}
    >
      {/* Renderer is one canvas for the whole app (src/ui/adapters.ts), so the feed is
          hidden rather than unmounted and stays outside every boundary. */}
      <div className="workspace__map">
        <FeedCanvas onReadout={setReadout} />
      </div>
      <div className="workspace__scrim" aria-hidden="true" onClick={close} />

      <PanelBoundary label="The work order">
        <WorkOrderCard
          workspace={workspace}
          compact={compact}
          open={!compact || orderOpen}
          statusOpen={telemetryOpen}
          onToggle={toggleOrder}
          onStatus={toggleTelemetry}
          onRead={() => openTo('dossier')}
        />
      </PanelBoundary>

      <PanelBoundary label="Telemetry">
        <TelemetryPanel
          workspace={workspace}
          compact={compact}
          open={!compact || telemetryOpen}
          onClose={() => setTelemetryOpen(false)}
          onReport={() => setSheetOpen(true)}
          reportHidden={!sheetOpen}
        />
      </PanelBoundary>

      <PanelBoundary label="The postings">
        <Postings workspace={workspace} onManual={() => openTo('manual')} />
      </PanelBoundary>

      <PanelBoundary label="The transport deck">
        <TransportDeck
          workspace={workspace}
          zoom={zoom}
          logOpen={logOpen}
          onLog={() => setLogOpen((was) => !was)}
          readout={readout}
        />
      </PanelBoundary>

      <PanelBoundary label="The program drawer">
        <Drawer
          workspace={workspace}
          open={open}
          tab={tab}
          onTab={setTab}
          onToggle={toggle}
          onRun={dispatch}
          onProblems={setProblems}
          problems={problems}
        />
      </PanelBoundary>

      <button
        type="button"
        className="drawer-handle"
        ref={handleRef}
        aria-expanded={open}
        aria-controls="workspace-drawer"
        aria-label="Program drawer"
        onClick={toggle}
      >
        <span className="drawer-handle__text">Program</span>
      </button>

      {report ? (
        <PanelBoundary label="The run report">
          <ReportSheet
            report={report}
            onDismiss={dismissSheet}
            onNext={workspace.advanceToNextLevel}
          />
        </PanelBoundary>
      ) : null}

      {workspace.closePending ? (
        <PanelBoundary label="The closing banner">
          <ClosedBanner workspace={workspace} />
        </PanelBoundary>
      ) : null}
    </div>
  );
}
