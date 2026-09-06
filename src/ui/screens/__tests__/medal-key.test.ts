/**
 * The key to the discs, and whether it works in the direction it was rebuilt for.
 *
 * Every medal in the game is drawn as a ring on a node and was named nowhere, so the three words
 * the whole scoring ladder runs on were on the site map forty times over and defined zero times.
 * The key is drawn in the loaded art direction's own marks rather than in a picture of its own, and
 * that is the part with a way to be wrong: `signal` is monochrome, and a key that separates its
 * three rows by colour alone fails exactly the direction it was rebuilt for.
 *
 * So the file asks two questions a player could answer. **Does the key say the same thing the board
 * says?** — the sample for a medal has to carry the same mark the board gives a node holding that
 * medal, and the test reads both off the same render rather than naming a class. **Can the three be
 * told apart without colour?** — each row is named in words, and the marks themselves separate by
 * hue or by lightness in every direction, which is checked against each direction's own palette.
 *
 * The renderer is `src/ui/__tests__/react-driver.ts`, one hand-cranked React shared by every UI
 * test; the tree walk below is this file's own, because no other file needs a node's marks.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
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
const { Medal, SILVER_FACTOR, medalForLevel } = await import('../../../game/score.ts');
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

/** Boot Sector, with one work order closed at each rung, so the board draws all three marks. */
function boardWithEveryMedal(): void {
  const save = emptySave();
  save.levels['w1-01'] = { completed: true, medal: Medal.Gold, stars: [], attempts: 1 };
  save.levels['w1-03'] = { completed: true, medal: Medal.Silver, stars: [], attempts: 1 };
  save.levels['w1-05'] = { completed: true, medal: Medal.Bronze, stars: [], attempts: 1 };
  useGame.setState({ save, screen: 'levels' });
}

/** The rows of the key, in the order they are drawn, each as the words a player reads. */
function keyRows(tree: Node[]): {
  word: string;
  rule: string;
  sample: Node | undefined;
  /** True when the sample sits inside something the accessibility tree is told to skip. */
  decorative: boolean;
}[] {
  const key = named(tree, 'Medal key');
  if (!key) return [];
  return key.children.map((row) => {
    const sample = all([row], (node) => classes(node).includes('node'))[0];
    const spans = all([row], (node) => node.tag === 'span' && node.children.length > 0);
    const readable = spans.filter(
      (span) =>
        span !== sample &&
        span.props['aria-hidden'] === undefined &&
        !all([span], (node) => node === sample).length,
    );
    const hidden = all(
      [row],
      (node) =>
        String(node.props['aria-hidden']) === 'true' &&
        all([node], (each) => each === sample).length > 0,
    );
    return {
      word: readable[0]?.text.trim() ?? '',
      rule: readable[1]?.text.trim() ?? '',
      sample,
      decorative: sample !== undefined && hidden.length > 0,
    };
  });
}

/** The mark the board gives a node that holds this medal, read off the board itself. */
function boardMark(tree: Node[], levelId: string): string[] {
  const slot = all(tree, (node) => node.tag === 'li' && node.text.includes(levelId))[0];
  if (!slot) return [];
  return classes(all([slot], (node) => classes(node).includes('node'))[0]);
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

beforeEach(() => {
  useGame.setState({ save: emptySave(), screen: 'levels' });
  driver.reset();
});

describe('the site map says what the three discs mean', () => {
  test('there is a key, and it has one row per medal', () => {
    const rows = keyRows(render());

    expect(rows.map((row) => row.word)).toEqual([...MEDALS]);
  });

  test('every rung of the ladder the game awards is on it, and nothing else', () => {
    const rows = keyRows(render());
    const awarded = Object.values(Medal).filter((value) => value !== Medal.None);

    expect([...rows.map((row) => row.word)].sort()).toEqual([...awarded].sort());
  });

  test('each row says what earns it, in its own words', () => {
    const rows = keyRows(render());

    expect(rows.every((row) => row.rule.length > 0)).toBe(true);
    expect(new Set(rows.map((row) => row.rule)).size).toBe(3);
  });

  test('and what it says is what the grader does', () => {
    const level = getLevel('w1-05');
    if (!level) throw new Error('no w1-05');
    const par = level.par.ticks;

    expect(medalForLevel(level, true, par)).toBe(Medal.Gold);
    expect(medalForLevel(level, true, Math.floor(par * SILVER_FACTOR))).toBe(Medal.Silver);
    expect(medalForLevel(level, true, par * 10)).toBe(Medal.Bronze);

    const rows = keyRows(render());
    expect(rows[0]?.rule).toContain('par');
    expect(rows[1]?.rule).toContain('par');
    expect(rows[2]?.rule).not.toContain('par');
  });
});

describe('the key is drawn in the marks the board is drawn in', () => {
  test('each sample carries the mark the board gives that medal, and only that one', () => {
    boardWithEveryMedal();
    const tree = render();
    const rows = keyRows(tree);
    const onBoard: Record<string, string[]> = {
      gold: boardMark(tree, 'w1-01'),
      silver: boardMark(tree, 'w1-03'),
      bronze: boardMark(tree, 'w1-05'),
    };

    for (const [index, medal] of MEDALS.entries()) {
      const sample = classes(rows[index]?.sample);
      const board = onBoard[medal] ?? [];
      expect(board.length, `${medal} on the board`).toBeGreaterThan(0);

      const shared = sample.filter((each) => each !== 'node' && board.includes(each));
      expect(shared, `${medal} sample and ${medal} node`).not.toHaveLength(0);

      for (const other of MEDALS.filter((each) => each !== medal)) {
        expect(shared.some((mark) => (onBoard[other] ?? []).includes(mark))).toBe(false);
      }
    }
  });

  test('the samples are decoration; the words carry the meaning', () => {
    const rows = keyRows(render());

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.decorative, `${row.word} sample`).toBe(true);
      expect(row.word).not.toBe('');
    }
  });
});

/**
 * `signal` is one hue at three lightnesses. That is the direction the key had to survive, so the
 * premise is pinned first — a palette change that gave silver a different hue would make the rest
 * of this section pass for a reason that no longer holds.
 */
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

  test('and the words work when neither does', () => {
    const rows = keyRows(render());

    expect(new Set(rows.map((row) => row.word)).size).toBe(3);
    expect(rows.every((row) => row.word.trim().length > 0)).toBe(true);
  });
});
