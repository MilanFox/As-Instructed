import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { Medal as MedalValue } from '../../../game/score.ts';
import { reactDriver as driver } from '../../__tests__/react-driver.ts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, ...driver.hooks };
});

vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla');
  const vanilla = createStore as unknown as (initialiser: unknown) => {
    subscribe: (notify: () => void) => () => void;
    getState: () => unknown;
  };
  const bind = (initialiser: unknown): unknown => {
    const api = vanilla(initialiser);
    const useBoundStore = (selector: (state: unknown) => unknown = (state) => state): unknown =>
      driver.hooks.useSyncExternalStore(api.subscribe, () => selector(api.getState()));
    return Object.assign(useBoundStore, api);
  };
  return {
    create: (initialiser?: unknown) => (initialiser ? bind(initialiser) : bind),
    createStore,
  };
});

const { LevelSelect } = await import('../LevelSelect.tsx');
const { useGame } = await import('../../../game/store.ts');
const { emptySave } = await import('../../../game/save.ts');
const { Medal, isGraded } = await import('../../../game/score.ts');
const { getLevel } = await import('../../../levels/index.ts');
const { ART_IDS, DIRECTIONS, luminance } = await import('../../../render/theme.ts');

type Props = Record<string, unknown>;

interface Node {
  tag: string;
  props: Props;
  children: Node[];
  text: string;
}

function build(node: unknown): Node[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ tag: '#text', props: {}, children: [], text: String(node) }];
  }
  if (Array.isArray(node)) return node.flatMap(build);
  const element = node as { type?: unknown; props?: Props };
  const props = element.props;
  if (!props) return [];
  const type = element.type;
  if (typeof type === 'function') return build((type as (props: Props) => unknown)(props));
  if (typeof type !== 'string') return build(props['children']);
  const children = build(props['children']);
  return [{ tag: type, props, children, text: children.map((child) => child.text).join(' ') }];
}

function render(): Node[] {
  driver.reset();
  return build(LevelSelect());
}

function all(nodes: Node[], match: (node: Node) => boolean): Node[] {
  const found: Node[] = [];
  const walk = (list: Node[]): void => {
    for (const node of list) {
      if (match(node)) found.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

function named(nodes: Node[], name: string): Node | undefined {
  return all(nodes, (node) => node.props['aria-label'] === name)[0];
}

function classes(node: Node | undefined): string[] {
  return String(node?.props['className'] ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

function part(row: Node, className: string): Node | undefined {
  return all([row], (node) => classes(node).includes(className))[0];
}

function orderRows(tree: Node[]): Node[] {
  const dossier = named(tree, 'Levels on this site');
  return dossier ? all([dossier], (node) => classes(node).includes('order-row')) : [];
}

interface Mark {
  glyph: string;
  medal: string;
  status: string;
  word: string;
  marks: string[];
}

function markFor(tree: Node[], levelId: string): Mark {
  const row = orderRows(tree).find((each) => part(each, 'order-row__id')?.text.trim() === levelId);
  if (!row) throw new Error(`${levelId} is not on the dossier`);
  const medal = part(row, 'order-row__medal');
  return {
    glyph: medal?.text.trim() ?? '',
    medal: String(medal?.props['data-medal'] ?? ''),
    status: String(row.props['data-status'] ?? ''),
    word: part(row, 'order-row__status')?.text.trim() ?? '',
    marks: classes(medal),
  };
}

// The dossier shows the site the player is being sent to next, so a fixture reaches a site by
// closing everything before it and leaving one order on that site open.
function dossierOnWorldFour(): void {
  const save = emptySave();
  const close = (id: string, medal: MedalValue): void => {
    save.levels[id] = { completed: true, medal, stars: [], attempts: 1 };
  };
  for (const id of ['w1-01', 'w1-02']) close(id, Medal.None);
  for (const id of ['w1-03', 'w2-01', 'w2-02', 'w2-03', 'w3-01', 'w3-02', 'w3-03']) {
    close(id, Medal.Gold);
  }
  close('w4-01', Medal.Gold);
  close('w4-02', Medal.Silver);
  close('w4-03', Medal.Bronze);
  useGame.setState({ save, screen: 'levels' });
}

function hueOf(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  if (spread === 0) return 0;
  const sixth =
    max === r ? ((g - b) / spread) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return (((sixth * 60) % 360) + 360) % 360;
}

function apart(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;

const UNGRADED = 'w1-01';
const STILL_OPEN = 'w1-02';

beforeEach(() => {
  useGame.setState({ save: emptySave(), screen: 'levels' });
  driver.reset();
});

describe('the dossier draws a medal as a glyph, not as a hue', () => {
  test('each rung of the ladder gets its own mark', () => {
    dossierOnWorldFour();
    const tree = render();
    const marks = ['w4-01', 'w4-02', 'w4-03'].map((id) => markFor(tree, id));

    expect(marks.map((mark) => mark.medal)).toEqual([...MEDALS]);
    for (const mark of marks) expect(mark.glyph).not.toBe('');
    expect(new Set(marks.map((mark) => mark.glyph)).size).toBe(MEDALS.length);
  });

  test('the glyph is the only thing left when the colour goes', () => {
    dossierOnWorldFour();
    const tree = render();
    const marks = ['w4-01', 'w4-02', 'w4-03'].map((id) => markFor(tree, id));
    const [gold, silver, bronze] = marks;
    if (!gold || !silver || !bronze) throw new Error('world 4 is not on the dossier');

    expect(silver.marks).toEqual(gold.marks);
    expect(bronze.marks).toEqual(gold.marks);
    expect(new Set(marks.map((mark) => mark.glyph)).size).toBe(MEDALS.length);
  });
});

describe('the dossier marks the close that is not a medal', () => {
  test('the fixture is a work order the site really does not grade', () => {
    const level = getLevel(UNGRADED);

    expect(level && isGraded(level)).toBe(false);
  });

  test('an ungraded close is not stamped with a rung it never won', () => {
    const save = emptySave();
    save.levels[UNGRADED] = { completed: true, medal: Medal.None, stars: [], attempts: 1 };
    useGame.setState({ save, screen: 'levels' });
    const mark = markFor(render(), UNGRADED);

    expect(mark.status).toBe('CLOSED');
    expect(MEDALS).not.toContain(mark.medal);
    expect(mark.glyph).not.toBe('');
  });

  test('and it is marked apart from an ungraded order still open', () => {
    const save = emptySave();
    save.levels[UNGRADED] = { completed: true, medal: Medal.None, stars: [], attempts: 1 };
    useGame.setState({ save, screen: 'levels' });
    const tree = render();
    const closed = markFor(tree, UNGRADED);
    const open = markFor(tree, STILL_OPEN);

    expect(open.status).toBe('OPEN');
    expect(closed.status).not.toBe(open.status);
    expect(closed.word).not.toBe(open.word);
    expect(closed.word).not.toBe('');
    expect(open.word).not.toBe('');
  });
});

describe('the three are distinguishable without colour', () => {
  test('signal really is monochrome — its three medals share a hue', () => {
    const hues = MEDALS.map((medal) => hueOf(DIRECTIONS.signal.palette[medal]));

    expect(apart(hues[0] as number, hues[1] as number)).toBeLessThan(10);
    expect(apart(hues[1] as number, hues[2] as number)).toBeLessThan(10);
  });

  test('so signal separates them by lightness instead, and by a real margin', () => {
    const [gold, silver, bronze] = MEDALS.map((medal) =>
      luminance(DIRECTIONS.signal.palette[medal]),
    ) as [number, number, number];

    expect(gold - silver).toBeGreaterThan(0.1);
    expect(silver - bronze).toBeGreaterThan(0.1);
  });

  test('and every direction separates its three by hue or by lightness', () => {
    for (const id of ART_IDS) {
      const palette = DIRECTIONS[id].palette;
      for (const [a, b] of [
        ['gold', 'silver'],
        ['silver', 'bronze'],
        ['gold', 'bronze'],
      ] as const) {
        const byHue = apart(hueOf(palette[a]), hueOf(palette[b]));
        const byLight = Math.abs(luminance(palette[a]) - luminance(palette[b]));
        expect(byHue > 20 || byLight > 0.1, `${id}: ${a} against ${b}`).toBe(true);
      }
    }
  });
});
