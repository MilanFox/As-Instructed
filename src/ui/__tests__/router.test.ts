import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyProgress, emptySave } from '../../game/save.ts';
import type { SaveFile } from '../../game/save.ts';
import { useGame } from '../../game/store.ts';
import { campaignOrder } from '../../levels/index.ts';
import { mountRouter } from '../router.ts';

interface FakeElement {
  tag: string;
  attributes: Record<string, string>;
  style: { cssText: string };
  textContent: string;
  attached: boolean;
  setAttribute(name: string, value: string): void;
  remove(): void;
}

class FakeHistory {
  entries: string[] = ['/'];
  at = 0;

  pushState(_state: unknown, _title: string, url: string): void {
    this.entries = [...this.entries.slice(0, this.at + 1), url];
    this.at = this.entries.length - 1;
  }

  replaceState(_state: unknown, _title: string, url: string): void {
    this.entries[this.at] = url;
  }

  get url(): string {
    return this.entries[this.at] ?? '/';
  }
}

const history = new FakeHistory();
const listeners = new Map<string, Set<() => void>>();
const elements: FakeElement[] = [];

const fakeDocument = {
  createElement(tag: string): FakeElement {
    const element: FakeElement = {
      tag,
      attributes: {},
      style: { cssText: '' },
      textContent: '',
      attached: false,
      setAttribute(name: string, value: string): void {
        element.attributes[name] = value;
      },
      remove(): void {
        element.attached = false;
      },
    };
    elements.push(element);
    return element;
  },
  body: {
    appendChild(element: FakeElement): void {
      element.attached = true;
    },
  },
};

function opensAt(path: string): void {
  history.entries = [path];
  history.at = 0;
}

function back(): void {
  if (history.at > 0) history.at -= 1;
  for (const listener of listeners.get('popstate') ?? []) listener();
}

function forward(): void {
  if (history.at < history.entries.length - 1) history.at += 1;
  for (const listener of listeners.get('popstate') ?? []) listener();
}

function region(): FakeElement | undefined {
  return elements.find((element) => element.attached);
}

const order = campaignOrder();
const FIRST = order[0]?.id ?? '';
const SECOND = order[1]?.id ?? '';
const DEEP = order[order.length - 1]?.id ?? '';

function saveClosing(...ids: string[]): SaveFile {
  const save = emptySave();
  for (const id of ids) save.levels[id] = { ...emptyProgress(), completed: true };
  return save;
}

beforeEach(() => {
  history.entries = ['/'];
  history.at = 0;
  listeners.clear();
  elements.length = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get location() {
        const url = new URL(history.url, 'https://kessler.test');
        return { pathname: url.pathname, search: url.search, hash: url.hash };
      },
      history,
      addEventListener(kind: string, listener: () => void): void {
        const set = listeners.get(kind) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(kind, set);
      },
      removeEventListener(kind: string, listener: () => void): void {
        listeners.get(kind)?.delete(listener);
      },
    },
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  useGame.setState({ save: emptySave(), screen: 'levels', currentLevelId: FIRST, blocked: null });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});

describe('the URL the page was opened on', () => {
  it('lands the site map on the root', () => {
    const detach = mountRouter();
    expect(useGame.getState().screen).toBe('levels');
    expect(history.url).toBe('/');
    detach();
  });

  it('opens the work order a deep link names', () => {
    opensAt(`/order/${FIRST}`);
    const detach = mountRouter();
    expect(useGame.getState().screen).toBe('workspace');
    expect(useGame.getState().currentLevelId).toBe(FIRST);
    detach();
  });

  it('corrects a path it does not serve rather than pushing over it', () => {
    opensAt('/order/');
    const detach = mountRouter();
    expect(history.entries).toEqual(['/']);
    expect(useGame.getState().screen).toBe('levels');
    detach();
  });

  it('holds a locked work order on the locked screen', () => {
    opensAt(`/order/${DEEP}`);
    const detach = mountRouter();
    expect(useGame.getState().blocked).toEqual({ levelId: DEEP, reason: 'locked' });
    expect(useGame.getState().screen).toBe('levels');
    expect(history.url).toBe(`/order/${DEEP}`);
    detach();
  });

  it('reads a work order that does not exist differently', () => {
    opensAt('/order/w9-99');
    const detach = mountRouter();
    expect(useGame.getState().blocked).toEqual({ levelId: 'w9-99', reason: 'unknown' });
    detach();
  });

  it('opens a locked work order once the save has opened it', () => {
    useGame.setState({ save: saveClosing(FIRST) });
    opensAt(`/order/${SECOND}`);
    const detach = mountRouter();
    expect(useGame.getState().blocked).toBeNull();
    expect(useGame.getState().currentLevelId).toBe(SECOND);
    detach();
  });
});

describe('navigating inside the app', () => {
  it('pushes an entry when a work order is opened', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(FIRST);
    expect(history.entries).toEqual(['/', `/order/${FIRST}`]);
    detach();
  });

  it('pushes nothing for a state change that is not a navigation', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(FIRST);
    useGame.getState().setCode('move(Dir.South);');
    useGame.getState().setPanel('console');
    expect(history.entries).toEqual(['/', `/order/${FIRST}`]);
    detach();
  });

  it('names the locked work order in the URL, so the link stays shareable', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(DEEP);
    expect(history.entries).toEqual(['/', `/order/${DEEP}`]);
    detach();
  });
});

describe('the back button', () => {
  it('leaves a work order for the site map, and returns to it', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(FIRST);

    back();
    expect(useGame.getState().screen).toBe('levels');
    expect(history.url).toBe('/');

    forward();
    expect(useGame.getState().screen).toBe('workspace');
    expect(useGame.getState().currentLevelId).toBe(FIRST);
    detach();
  });

  it('does not push the entry the popstate itself produced', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(FIRST);
    const entries = [...history.entries];

    back();
    expect(history.entries).toEqual(entries);
    detach();
  });

  it('leaves the locked screen for the site map', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(DEEP);
    expect(useGame.getState().blocked).not.toBeNull();

    back();
    expect(useGame.getState().blocked).toBeNull();
    expect(useGame.getState().screen).toBe('levels');
    detach();
  });

  it('keeps the loaded run when it returns to the order in hand', () => {
    const detach = mountRouter();
    useGame.getState().openLevel(FIRST);
    const code = useGame.getState().code;
    useGame.setState({ code: `${code}\n// working` });

    back();
    forward();
    expect(useGame.getState().code).toBe(`${code}\n// working`);
    detach();
  });
});

describe('what the router announces and what it leaves behind', () => {
  it('names the destination in a live region', () => {
    const detach = mountRouter();
    expect(region()?.attributes['role']).toBe('status');
    expect(region()?.attributes['aria-live']).toBe('polite');
    expect(region()?.textContent).toBe('Site map.');

    useGame.getState().openLevel(DEEP);
    expect(region()?.textContent).toBe(`Work order ${DEEP} is on hold.`);
    detach();
  });

  it('takes its listeners, its subscription and its live region away', () => {
    const detach = mountRouter();
    detach();

    expect(listeners.get('popstate')?.size ?? 0).toBe(0);
    expect(region()).toBeUndefined();

    const entries = [...history.entries];
    useGame.getState().openLevel(FIRST);
    expect(history.entries).toEqual(entries);
  });
});
