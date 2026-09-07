/**
 * The paper on the desk.
 *
 * Three rulings live in this file and they are the reason it exists:
 *
 * 1. **Pick it up to read it.** A sheet at rest does not have to be legible, because paper on a
 *    desk is a thing you pick up. `lift` is a transform on a persistent element, never a portal
 *    or an overlay — implementing it as a modal would reintroduce exactly the self-destroying
 *    ceremony the desk exists to remove.
 * 2. **Pin it to the side.** A different mechanism for a different reason: lifting is for reading
 *    now, pinning is for keeping a specification legible while your hands are on the keyboard.
 *    The pinned form is a second authored view of the same content, not a CSS scale of the sheet.
 * 3. **Paper persists until it is filed.** Nothing here self-destructs and nothing is dismissed
 *    by a backdrop click. The run report used to be one stray click from gone with no reopen
 *    path, and that is the single strongest argument the desk has for existing.
 *
 * Geometry is in design units offset from the centre of the desk frame, matching the prototype —
 * `left: calc(50% + x * var(--u))`. Positions persist because where a player left a sheet is
 * information they put there.
 *
 * Stored in its own `localStorage` key, following `src/ui/art.ts`: no save migration, and tidying
 * the desk cannot corrupt a player's progress.
 */
import { create } from 'zustand';
import type { Budget } from '../../../game/budgets.ts';
import { useGame } from '../../../game/store.ts';

export const DESK_KEY = 'bootstrap.desk';

export type DocKind =
  | 'order'
  | 'certificate'
  | 'halt'
  | 'requisition'
  | 'issue'
  | 'memo'
  | 'standing';

/**
 * One objective as the report draws it — the same four claims the rail makes about the same row.
 *
 * It is the rail's row rather than a rendered string on purpose. `budget` is what decides whether
 * the row is a gauge or a tick-box and whether it is over, and `budget.meter.kind` is what earns
 * the word `limit`; a snapshot that kept only the readout could not reproduce any of those, and
 * `src/ui/__tests__/rail-report-agreement.test.ts` exists to catch exactly that divergence.
 */
export interface ReportRow {
  id: string;
  label: string;
  met: boolean;
  bonus: boolean;
  progress?: [number, number];
  budget?: Budget;
  /** One mark per seed, on a work order that runs more than one. */
  seeds?: readonly { seed: number; met: boolean }[];
}

/** The one thing the game computes about *where* a run went wrong. */
export interface Divergence {
  where: string;
  want: string;
  got: string;
}

/** Why the run failed, worst first. */
export interface ReportCause {
  id: string;
  label: string;
  detail: string;
  budget: Budget | null;
  divergence: Divergence | null;
}

/**
 * What a closed or halted run leaves on the desk. Snapshotted at the moment it is issued: the
 * store's `verdict` is overwritten by the next run, and a certificate that changes when you run
 * again is not paper.
 */
export interface ReportSnapshot {
  levelId: string;
  title: string;
  passed: boolean;
  graded: boolean;
  /** `null` on an ungraded work order (DESIGN §7) — it reads `CLOSED`, not a medal. */
  medal: 'gold' | 'silver' | 'bronze' | 'none' | null;
  /** The flavour line, frozen: `failureCursor` moves on the next failure. */
  headline: string;
  ticks: number | null;
  par: number | null;
  limit: number | null;
  bestTicks: number | null;
  seeds: readonly number[];
  seedLines: readonly { seed: number; passed: boolean; note: string }[];
  objectives: readonly ReportRow[];
  /** Ranked worst-first. Stated once — the failure box does not repeat them. */
  causes: readonly ReportCause[];
  /** The primary divergence, for the seam the site monitor marks the board from. */
  cause: Divergence | null;
  failure: string | null;
  failureCode: string | null;
  failureSeed: number | null;
  failureLine: number | null;
  /** The seed it did pass on, when one did. Generalisation failure is the category that matters. */
  passedSeed: number | null;
  commendations: readonly string[];
  personalBest: { previous: number; now: number } | null;
  points: number | null;
  stars: number;
  /** What the record already says, on a run that changed nothing. */
  onRecord: { word: string; note: string } | null;
  libraryLine: string | null;
  /** Epoch ms. The record carries its date. */
  at: number;
}

export type DocPayload =
  | { kind: 'order'; levelId: string }
  | { kind: 'certificate'; report: ReportSnapshot }
  | { kind: 'halt'; report: ReportSnapshot }
  | { kind: 'requisition'; levelId: string; hardware: readonly string[] }
  | { kind: 'issue' }
  | { kind: 'memo'; rank: number }
  | { kind: 'standing' };

export interface DeskDoc {
  id: string;
  kind: DocKind;
  /** Where it landed, in design units from the centre of the frame. */
  home: { x: number; y: number; rot: number };
  /** Where the player dragged it to, in the same units. `null` means it is still where it landed. */
  moved: { x: number; y: number } | null;
  z: number;
  /** Filed paper is off the desk and in the Repository. It is never deleted. */
  filed: boolean;
  /**
   * In the in-tray rather than out on the desk. Retrievable, not gone — paper still persists until
   * it is filed; it is just not lying across the work.
   */
  stowed: boolean;
  /**
   * Whether the player has ever held this sheet up to the lamp. A sheet at rest does not have to
   * be legible (ruling 1 above), so lifting it is the only moment the desk learns a document has
   * been read — and what has not been read is what eviction may not take.
   */
  read: boolean;
  /** Set by the stamp block or the pen. What filing a sheet actually looks like. */
  mark: string | null;
  payload: DocPayload;
}

/**
 * The desk surface below the two screens. **No document may ever be placed above this line.**
 *
 * Read off the stylesheets rather than eyeballed: the terminal is at `top: 50% - 502u` with its
 * stand at `716u`, so it occupies y ∈ [-502, +214]; the feed is at `50% - 486u` with its stand at
 * `600u`, so it occupies y ∈ [-486, +114]. A sheet at a smaller `y` than this is lying across a
 * screen.
 *
 * This is the same rule that already protects the drawn board, extended to both machines, and it
 * is guarded rather than trusted — `src/ui/__tests__/paper-clearance.test.ts` recomputes the screen
 * extents from the CSS and fails if any home rises above them.
 */
export const DESK_SURFACE_Y = 220;

/**
 * Where each kind lands, all of it lower-right and overlapping, as the approved composition asks.
 *
 * Five of these used to sit *on top of the monitor* — the certificate at `y 46`, the HALT notice at
 * `52`, the requisition at `30`, the Repository note at `60` and the memo at `10`, against a feed
 * whose housing runs to `y +114`. With every kind issued at once that buried both screens: a player
 * opening `w1-03` got five sheets stacked over the terminal and said so — *"I literally can't see
 * anything anymore."* The program is the largest thing on the desk while it is being written, and
 * paper on top of it is paper in the way.
 */
export const DOC_HOME: Record<DocKind, { x: number; y: number; rot: number }> = {
  order: { x: 214, y: 226, rot: -3.4 },
  certificate: { x: 196, y: 246, rot: 1.6 },
  halt: { x: 204, y: 240, rot: -2.2 },
  requisition: { x: 188, y: 234, rot: 1.2 },
  issue: { x: 210, y: 252, rot: -2.0 },
  memo: { x: 200, y: 230, rot: -1.4 },
  standing: { x: 300, y: 288, rot: 2.6 },
};

/** Where a sheet lands when it is taken out of the tray. */
export const DOC_ARRIVAL = { x: 170, y: 236, rot: -1.4 } as const;

/**
 * How much unfiled paper the desk holds before the oldest sheet you have already read is filed for
 * you. The desk is tidy on purpose, and an unbounded pile is the cramped Papers, Please desk
 * that was tried and cut.
 */
export const DESK_CAPACITY = 6;

/**
 * The work order for the level that is open. Nothing but the player takes that one off the desk.
 */
function briefId(): string | null {
  const open = useGame.getState().currentLevelId;
  return open ? `order:${open}` : null;
}

/**
 * What the desk may file for you when it runs out of room: paper the player has read, waiting in
 * the tray, that is neither the standing sheet nor the brief for the level that is open.
 *
 * Eviction used to take the oldest unfiled sheet whatever it was, and `issueOnce` in
 * `usePaperwork.ts` will not re-issue an id it has already handed out. So a Performance Review
 * that arrived and was pushed under by five HALT NOTICEs went to the Repository unread — and
 * nothing on this desk draws filed paper, so for the player it was destroyed. It is the last
 * thing the game says to somebody who has closed all 33 work orders, and the only way back to it
 * was clearing `bootstrap.desk` by hand, which a player cannot do. An unread document is not the
 * oldest thing on the desk in any sense the player cares about.
 */
function evictable(doc: DeskDoc, brief: string | null): boolean {
  return doc.read && doc.stowed && doc.kind !== 'standing' && doc.id !== brief;
}

/**
 * A HALT NOTICE is about the run you just did, and the one before it is worthless the moment a
 * new one exists. So a halt notice replaces its predecessor on the same work order rather than
 * stacking beside it: five failed dispatches on `w8-01` left five sheets in the tray, and the
 * fifth said everything the first four did. The replaced sheet is filed, not deleted.
 */
function supersedes(next: DeskDoc, doc: DeskDoc): boolean {
  return (
    next.payload.kind === 'halt' &&
    doc.payload.kind === 'halt' &&
    next.payload.report.levelId === doc.payload.report.levelId
  );
}

/** What may go on the copy stand. The specification, never the memo. */
export const PINNABLE: ReadonlySet<DocKind> = new Set<DocKind>(['order', 'requisition']);

/**
 * The pinned form of a document: a second authored view of the same content, not a CSS scale of
 * the sheet. The ask and the site data, set larger than the sheet itself carries; the flavour
 * paragraph stays on the paper.
 *
 * `value` is inline markdown, the same dialect `src/ui/components/Markdown.tsx` reads, because the
 * levels already write their facts that way. Anything outside the paper lane that wants the copy
 * stand — the reference manual is the one asked for — builds one of these and calls `pinPage`.
 */
export interface PinnedPage {
  head: readonly [string, string];
  ask: string;
  facts: readonly { label: string; value: string }[];
}

interface PaperState {
  docs: DeskDoc[];
  /** The sheet currently held up to the lamp. At most one. */
  lifted: string | null;
  /** The sheet on the copy stand. Persists across runs — that is the point. */
  pinned: string | null;
  /**
   * The page on the stand when what is pinned is not a sheet on this desk — the reference manual
   * is the case this exists for. A pinned *document* is projected live instead, so that pinning a
   * work order and then revealing a hint updates the stand.
   */
  pinnedPage: PinnedPage | null;
  top: number;

  issue(
    doc: Omit<DeskDoc, 'z' | 'filed' | 'stowed' | 'read' | 'mark' | 'moved'> & Partial<DeskDoc>,
  ): void;
  lift(id: string): void;
  putDown(): void;
  pin(id: string): void;
  /** Pin something that is not paper on this desk. Clears any pinned sheet. */
  pinPage(page: PinnedPage): void;
  unpin(): void;
  moveTo(id: string, x: number, y: number): void;
  raise(id: string): void;
  /** File it. The sheet leaves the desk for the Repository; it is not destroyed. */
  file(id: string, mark?: string): void;
  /** Put it away. It goes to the in-tray and can be taken out again. */
  stow(id: string): void;
  /** Take it out of the tray. Whatever was out goes back in — the desk holds one sheet. */
  takeOut(id: string): void;
  /** Take away the *other* work orders. The one for the level that is open is never dropped. */
  clearLevelPaper(): void;
}

interface StoredDesk {
  docs: DeskDoc[];
  pinned: string | null;
  pinnedPage: PinnedPage | null;
  top: number;
}

function readStored(): StoredDesk | null {
  try {
    const raw = localStorage.getItem(DESK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const shape = parsed as Partial<StoredDesk>;
    if (!Array.isArray(shape.docs)) return null;
    return {
      docs: shape.docs as DeskDoc[],
      pinned: typeof shape.pinned === 'string' ? shape.pinned : null,
      pinnedPage: (shape.pinnedPage as PinnedPage | undefined) ?? null,
      top: typeof shape.top === 'number' ? shape.top : 20,
    };
  } catch {
    // A corrupt desk is a tidy desk. Never a white screen.
    return null;
  }
}

function persist(state: PaperState): void {
  try {
    const payload: StoredDesk = {
      docs: state.docs,
      pinned: state.pinned,
      pinnedPage: state.pinnedPage,
      top: state.top,
    };
    localStorage.setItem(DESK_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal: the desk still holds its paper for this session.
  }
}

const initial = readStored();

export const usePapers = create<PaperState>((set, get) => ({
  docs: initial?.docs ?? [],
  lifted: null,
  pinned: initial?.pinned ?? null,
  pinnedPage: initial?.pinnedPage ?? null,
  top: initial?.top ?? 20,

  issue(doc) {
    const state = get();
    const z = state.top + 1;
    const next: DeskDoc = {
      moved: null,
      filed: false,
      stowed: false,
      read: false,
      mark: null,
      ...doc,
      z,
    };
    const brief = briefId();
    const without = state.docs.filter((d) => d.id !== next.id);
    const loose = without.filter((d) => !d.filed);
    const stale = new Set(loose.filter((d) => supersedes(next, d)).map((d) => d.id));
    const held = loose.filter((d) => !stale.has(d.id));
    const overflow = Math.max(0, held.length + 1 - DESK_CAPACITY);
    const retired = new Set(
      held
        .filter((d) => evictable(d, brief))
        .slice(0, overflow)
        .map((d) => d.id),
    );
    const docs = without
      .map((d) => (stale.has(d.id) || retired.has(d.id) ? { ...d, filed: true } : d))
      .concat(next);
    set({ docs, top: z });
    persist(get());
  },

  lift(id) {
    set((state) => {
      const unread = state.docs.some((d) => d.id === id && !d.read);
      return {
        lifted: state.lifted === id ? null : id,
        docs: unread ? state.docs.map((d) => (d.id === id ? { ...d, read: true } : d)) : state.docs,
      };
    });
    persist(get());
  },

  putDown() {
    set({ lifted: null });
  },

  pin(id) {
    set({ pinned: id, pinnedPage: null });
    persist(get());
  },

  pinPage(page) {
    set({ pinned: null, pinnedPage: page });
    persist(get());
  },

  unpin() {
    set({ pinned: null, pinnedPage: null });
    persist(get());
  },

  moveTo(id, x, y) {
    set((state) => ({
      docs: state.docs.map((d) => (d.id === id ? { ...d, moved: { x, y } } : d)),
    }));
    persist(get());
  },

  raise(id) {
    set((state) => {
      const z = state.top + 1;
      return {
        docs: state.docs.map((d) => (d.id === id ? { ...d, z } : d)),
        top: z,
      };
    });
    persist(get());
  },

  file(id, mark) {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id ? { ...d, filed: true, mark: mark ?? d.mark } : d,
      ),
      lifted: state.lifted === id ? null : state.lifted,
      pinned: state.pinned === id ? null : state.pinned,
      pinnedPage: state.pinned === id ? null : state.pinnedPage,
    }));
    persist(get());
  },

  /*
   * The current level's order is kept by id rather than by timing. `Desk` calls this on a level
   * change and `usePaperwork` issues the new order from `App`, and React does not promise which
   * of those two effects runs first — a version of this that dropped every order deleted the
   * sheet it had just been handed, roughly half the time, and left the desk with no work order
   * on it at all.
   */
  stow(id) {
    set((state) => ({
      docs: state.docs.map((d) => (d.id === id ? { ...d, stowed: true } : d)),
      lifted: state.lifted === id ? null : state.lifted,
    }));
    persist(get());
  },

  /*
   * One sheet on the desk at a time. A corporate workplace hands you one form and waits; five at
   * once is what buried the terminal.
   */
  takeOut(id) {
    set((state) => {
      const z = state.top + 1;
      return {
        docs: state.docs.map((d) =>
          d.id === id ? { ...d, stowed: false, z } : d.filed ? d : { ...d, stowed: true },
        ),
        top: z,
      };
    });
    persist(get());
  },

  clearLevelPaper() {
    const keep = briefId();
    set((state) => {
      const docs = state.docs.filter((d) => d.kind !== 'order' || d.filed || d.id === keep);
      /*
       * Only the sheet that actually left is put down. Clearing `lifted` unconditionally dropped
       * whatever the player was holding every time the paperwork was re-delivered — and it is
       * re-delivered on any store nudge, so asking for a hint took the work order out of your
       * hand while you were reading it.
       */
      const gone = state.lifted !== null && !docs.some((d) => d.id === state.lifted);
      return { docs, lifted: gone ? null : state.lifted };
    });
    persist(get());
  },
}));

/**
 * A selector read through `useSyncExternalStore` must return the **same reference** until its input
 * genuinely changes. Both of these filter and sort, so a fresh array every call makes React's
 * `Object.is` check fail on every read and the component re-renders forever — `PaperLayer` died on
 * exactly that with `Maximum update depth exceeded`, and the desk lost its paperwork.
 *
 * `src/meta/store.ts` hit this first and its `reports()` and `structure()` carry the same note.
 * Keyed on `docs` identity, which is what every action in this store replaces wholesale.
 */
interface Derived {
  from: DeskDoc[] | null;
  value: DeskDoc[];
}

const loose: Derived = { from: null, value: [] };
const filed: Derived = { from: null, value: [] };
const trayed: Derived = { from: null, value: [] };

function derive(cache: Derived, docs: DeskDoc[], build: (docs: DeskDoc[]) => DeskDoc[]): DeskDoc[] {
  if (cache.from !== docs) {
    cache.from = docs;
    cache.value = build(docs);
  }
  return cache.value;
}

/** The loose sheets, back to front. Filed paper is in the Repository and is not drawn here. */
export function looseDocs(state: PaperState): DeskDoc[] {
  return derive(loose, state.docs, (docs) =>
    docs.filter((d) => !d.filed && !d.stowed).sort((a, b) => a.z - b.z),
  );
}

/** What is waiting in the in-tray, newest first. Not gone — put away. */
export function trayDocs(state: PaperState): DeskDoc[] {
  return derive(trayed, state.docs, (docs) => docs.filter((d) => !d.filed && d.stowed).reverse());
}

/** Everything ever filed, newest first. The Repository reads this. */
export function filedDocs(state: PaperState): DeskDoc[] {
  return derive(filed, state.docs, (docs) => docs.filter((d) => d.filed).reverse());
}

export function docById(state: PaperState, id: string | null): DeskDoc | null {
  if (!id) return null;
  return state.docs.find((d) => d.id === id) ?? null;
}
