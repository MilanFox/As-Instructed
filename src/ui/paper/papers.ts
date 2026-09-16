import { create } from 'zustand';
import { useGame } from '../../game/store.ts';

export const DESK_KEY = 'as-instructed.desk';

export type DocKind = 'order' | 'requisition' | 'issue' | 'memo';

export type DocPayload =
  | { kind: 'order'; levelId: string }
  | { kind: 'requisition'; levelId: string; hardware: readonly string[] }
  | { kind: 'issue' }
  | { kind: 'memo'; rank: number };

export interface DeskDoc {
  id: string;
  kind: DocKind;
  home: { x: number; y: number; rot: number };
  moved: { x: number; y: number } | null;
  z: number;
  filed: boolean;
  stowed: boolean;
  mark: string | null;
  payload: DocPayload;
}

export const DOC_HOME: Record<DocKind, { x: number; y: number; rot: number }> = {
  order: { x: 214, y: 226, rot: -3.4 },
  requisition: { x: 188, y: 234, rot: 1.2 },
  issue: { x: 210, y: 252, rot: -2.0 },
  memo: { x: 200, y: 230, rot: -1.4 },
};

export const DOC_ARRIVAL = { x: 170, y: 236, rot: -1.4 } as const;

function belongsTo(doc: DeskDoc, open: string | null): boolean {
  if (open === null) return false;
  switch (doc.payload.kind) {
    case 'order':
    case 'requisition':
      return doc.payload.levelId === open;
    default:
      return false;
  }
}

const REISSUED: ReadonlySet<DocKind> = new Set<DocKind>(['order', 'requisition']);

export interface PinnedPage {
  head: readonly [string, string];
  ask: string;
  facts: readonly { label: string; value: string }[];
}

interface PaperState {
  docs: DeskDoc[];
  lifted: string | null;
  pinned: string | null;
  pinnedPage: PinnedPage | null;
  top: number;

  issue(
    doc: Omit<DeskDoc, 'z' | 'filed' | 'stowed' | 'read' | 'mark' | 'moved'> & Partial<DeskDoc>,
  ): void;
  lift(id: string): void;
  putDown(): void;
  pin(id: string): void;
  pinPage(page: PinnedPage): void;
  unpin(): void;
  moveTo(id: string, x: number, y: number): void;
  raise(id: string): void;
  file(id: string, mark?: string): void;
  stow(id: string, mark?: string): void;
  takeOut(id: string): void;
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
    const next: DeskDoc = { moved: null, filed: false, stowed: false, mark: null, ...doc, z };
    const docs = state.docs.filter((d) => d.id !== next.id).concat(next);
    set({ docs, top: z });
    persist(get());
  },

  lift(id) {
    set((state) => ({ lifted: state.lifted === id ? null : id }));
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
      docs: state.docs.map((d) => (d.id === id ? { ...d, filed: true, mark: mark ?? d.mark } : d)),
      lifted: state.lifted === id ? null : state.lifted,
      pinned: state.pinned === id ? null : state.pinned,
      pinnedPage: state.pinned === id ? null : state.pinnedPage,
    }));
    persist(get());
  },

  stow(id, mark) {
    set((state) => ({
      docs: state.docs.map((d) => (d.id === id ? { ...d, stowed: true, mark: mark ?? d.mark } : d)),
      lifted: state.lifted === id ? null : state.lifted,
    }));
    persist(get());
  },

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
    const open = useGame.getState().currentLevelId;
    set((state) => {
      const adrift = state.docs.filter((d) => !d.filed && !belongsTo(d, open));
      const dropped = new Set(adrift.filter((d) => REISSUED.has(d.kind)).map((d) => d.id));
      const stale = new Set(adrift.filter((d) => !REISSUED.has(d.kind)).map((d) => d.id));
      const docs = state.docs
        .filter((d) => !dropped.has(d.id))
        .map((d) => (stale.has(d.id) ? { ...d, filed: true } : d));
      const gone = state.lifted !== null && !docs.some((d) => d.id === state.lifted && !d.filed);
      return { docs, lifted: gone ? null : state.lifted };
    });
    persist(get());
  },
}));

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

export function looseDocs(state: PaperState): DeskDoc[] {
  return derive(loose, state.docs, (docs) =>
    docs.filter((d) => !d.filed && !d.stowed).sort((a, b) => a.z - b.z),
  );
}

export function trayDocs(state: PaperState): DeskDoc[] {
  return derive(trayed, state.docs, (docs) => docs.filter((d) => !d.filed && d.stowed).reverse());
}

export function filedDocs(state: PaperState): DeskDoc[] {
  return derive(filed, state.docs, (docs) => docs.filter((d) => d.filed).reverse());
}
