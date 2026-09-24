import { useCallback, useEffect, useRef, useState } from 'react';

import { PanelBoundary } from '../components/PanelBoundary.tsx';
import { useInspect } from '../hooks/useInspect.ts';
import { closeLibrary, closeOverlay, overlayState, useOverlay } from '../hooks/useOverlay.ts';
import { COMPACT_QUERY } from './breakpoints.ts';
import { ClosedBanner } from './ClosedBanner.tsx';
import type { DrawerTab } from './Drawer.tsx';
import { Drawer } from './Drawer.tsx';
import {
  clampDrawer,
  deckIsCrowded,
  rememberDrawerWidth,
  storedDrawerWidth,
} from './drawerSize.ts';
import { FeedCanvas } from './FeedCanvas.tsx';
import { flyoutOpensOnArrival, rememberFlyoutOpen } from './flyoutMemory.ts';
import { Postings } from './Postings.tsx';
import { ReportSheet } from './ReportSheet.tsx';
import { Subroutines } from './Subroutines.tsx';
import { TelemetryPanel } from './TelemetryPanel.tsx';
import { TransportDeck } from './TransportDeck.tsx';
import { useFeedZoom } from './useFeedZoom.ts';
import { useWorkspace } from './useWorkspace.ts';
import { WidthGrip } from './WidthGrip.tsx';
import { WorkOrderCard } from './WorkOrderCard.tsx';

import '../styles/workspace/workspace.css';
import '../styles/workspace/panel.css';
import '../styles/workspace/order.css';
import '../styles/workspace/telemetry.css';
import '../styles/workspace/deck.css';
import '../styles/workspace/drawer.css';
import '../styles/workspace/report.css';
import '../styles/workspace/banner.css';
import '../styles/workspace/library.css';
import '../styles/workspace/reflow.css';

// Both faces stand in the same box at --ws-flyout and the workbench is the one always mounted,
// so it is the ruler for the flyout's edge whichever face is actually up.
function drawerWidth(): number {
  const drawer = document.getElementById('workspace-drawer');
  return drawer ? drawer.getBoundingClientRect().width : 0;
}

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

  const levelId = workspace.level?.id ?? null;
  const [open, setOpen] = useState(() =>
    flyoutOpensOnArrival(
      levelId,
      workspace.trace !== null,
      window.matchMedia(COMPACT_QUERY).matches,
    ),
  );
  const [tab, setTab] = useState<DrawerTab>('dossier');
  const [orderOpen, setOrderOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [problems, setProblems] = useState(0);
  const [readout, setReadout] = useState<string | null>(null);
  const [measured, setMeasured] = useState(0);
  const [width, setWidth] = useState(storedDrawerWidth);

  const handleRef = useRef<HTMLButtonElement | null>(null);

  // One flyout showing one of two faces. Everything that has to stand clear of it — the deck,
  // the flaps, the grip — reads this rather than asking which face is up. The manual counts
  // as open from the moment it is asked for, so arriving from lib.ts swaps the face instead
  // of shutting the panel for the frame before the workbench catches up.
  const overlayOpen = useOverlay().open;
  const libraryOpen = overlayOpen === 'library';
  const referenceRequested = overlayOpen === 'docs';
  const flyoutOpen = open || libraryOpen || referenceRequested;
  const workbenchOn = flyoutOpen && !libraryOpen;

  // The flyout draws over the board rather than pushes it aside, but its measured width is
  // still what the deck folds on and what the Site map button is parked beside.
  useEffect(() => {
    const measure = (): void => {
      setMeasured(drawerWidth());
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [open, compact, width]);

  const [viewport, setViewport] = useState(() => window.innerWidth);
  useEffect(() => {
    const measure = (): void => {
      setViewport(window.innerWidth);
    };
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);
  const crowded = flyoutOpen && !compact && measured > 0 && deckIsCrowded(measured, viewport);

  // A stored width outlives the viewport it was chosen on, so it is pulled back inside the
  // one in front of us rather than left to overhang it.
  useEffect(() => {
    if (width === null || compact) return;
    const fit = (): void => {
      setWidth((was) => (was === null ? was : clampDrawer(was, window.innerWidth)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
    };
  }, [width, compact]);

  const resize = useCallback((next: number): void => {
    setWidth(next);
    rememberDrawerWidth(next);
  }, []);

  const openDrawer = useCallback((): void => {
    setOpen(true);
    setTelemetryOpen(false);
    setOrderOpen(false);
    closeLibrary();
    rememberFlyoutOpen(levelId, true);
  }, [levelId]);

  const toggle = useCallback((): void => {
    setOpen((was) => {
      if (!was) {
        setTelemetryOpen(false);
        setOrderOpen(false);
        closeLibrary();
      }
      rememberFlyoutOpen(levelId, !was);
      return !was;
    });
  }, [levelId]);

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

  const { reveal } = useInspect();
  const revealed = useRef(reveal);
  useEffect(() => {
    if (revealed.current === reveal) return;
    revealed.current = reveal;
    if (!compact) return;
    setTelemetryOpen(true);
    setOpen(false);
    setOrderOpen(false);
  }, [reveal, compact]);

  const running = workspace.runState === 'running';
  useEffect(() => {
    if (running) setOpen(false);
  }, [running]);

  const fresh = workspace.showResults;
  useEffect(() => {
    if (fresh) setSheetOpen(true);
  }, [fresh]);

  // Keyed on the same flag that makes the face inert, so focus is taken back in the commit
  // that takes the face away rather than a render later, with nowhere left to take it from.
  useEffect(() => {
    if (workbenchOn) return;
    const active = document.activeElement;
    const drawer = document.getElementById('workspace-drawer');
    if (active && drawer?.contains(active)) handleRef.current?.focus();
  }, [workbenchOn]);

  // The shortcut store drives the drawer, and shutting the drawer by any route drives the
  // store back. The ref tells an incoming request apart from our own echo of it.
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
    if (libraryOpen) setOpen(false);
  }, [libraryOpen]);

  // The screen outlives the level, so the next one gets the arrival rule applied to it rather
  // than inheriting wherever the last one left the flyout.
  const arrivedAt = useRef(levelId);
  useEffect(() => {
    if (arrivedAt.current === levelId) return;
    arrivedAt.current = levelId;
    setOpen(flyoutOpensOnArrival(levelId, workspace.trace !== null, compact));
  }, [levelId, workspace.trace, compact]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // lib.ts and the workbench are never open together, so escape has one of them to dismiss.
      if (overlayState().open === 'library') {
        closeOverlay();
        return;
      }
      setOpen((was) => {
        if (was) {
          handleRef.current?.focus();
          rememberFlyoutOpen(levelId, false);
        }
        return false;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [levelId]);

  const dismissSheet = useCallback((): void => {
    setSheetOpen(false);
    workspace.dismissResults();
  }, [workspace]);

  const watching = running || workspace.playing;
  const report = sheetOpen && !workspace.closePending ? workspace.report : null;

  return (
    <div
      className="workspace"
      data-flyout={flyoutOpen ? 'open' : 'shut'}
      data-watch={String(watching)}
      data-sheet={report ? 'open' : 'shut'}
      data-deck={crowded ? 'folded' : 'shown'}
      style={
        width === null
          ? undefined
          : ({ '--ws-flyout-user': `${String(width)}px` } as React.CSSProperties)
      }
    >
      {/* Renderer is one canvas for the whole app (src/ui/adapters.ts), so the feed is
          hidden rather than unmounted and stays outside every boundary. */}
      <div className="workspace__map">
        <FeedCanvas onReadout={setReadout} />
      </div>

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

      <div className="hud-right">
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
      </div>

      <PanelBoundary label="The transport deck">
        <TransportDeck
          workspace={workspace}
          zoom={zoom}
          logOpen={logOpen}
          onLog={() => setLogOpen((was) => !was)}
          readout={readout}
        />
      </PanelBoundary>

      <PanelBoundary label="The workbench">
        <Drawer
          workspace={workspace}
          on={workbenchOn}
          tab={tab}
          onTab={setTab}
          onToggle={toggle}
          onRun={dispatch}
          onProblems={setProblems}
          problems={problems}
        />
      </PanelBoundary>

      <PanelBoundary label="Shared Subroutines">
        <Subroutines />
      </PanelBoundary>

      {/* One grip for one edge, parked on the viewport rather than inside either face, so the
          same strip is the grab whichever face the flyout is showing. */}
      {compact ? null : (
        <WidthGrip
          label={libraryOpen ? 'lib.ts width' : 'Workbench width'}
          controls={libraryOpen ? 'workspace-library' : 'workspace-drawer'}
          open={flyoutOpen}
          width={width ?? measured}
          onWidth={resize}
        />
      )}

      {/* The flyout stands over the work order card and takes its Site map button with it.
          Same action, parked in the strip of board the flyout leaves — and once that strip is
          down to the telemetry column there is no room for it, the same as at compact. */}
      {flyoutOpen && !compact && !crowded ? (
        <button
          type="button"
          className="control control--tight drawer-escape"
          style={{ '--ws-escape-x': `${String(measured)}px` } as React.CSSProperties}
          onClick={() => workspace.goto('levels')}
        >
          Site map
        </button>
      ) : null}

      <button
        type="button"
        className="drawer-handle"
        ref={handleRef}
        aria-expanded={open && !libraryOpen}
        aria-controls="workspace-drawer"
        aria-label="Workbench drawer"
        onClick={toggle}
      >
        <span className="drawer-handle__text">Workbench</span>
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
