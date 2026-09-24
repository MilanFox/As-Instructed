import type { GameState } from '../game/store.ts';
import { useGame } from '../game/store.ts';
import { getLevel } from '../levels/index.ts';

const BASE = import.meta.env.BASE_URL || '/';
const ORDER = /^order\/([a-z0-9-]+)\/?$/;

const ANNOUNCER_STYLE =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';

function levelOf(pathname: string): string | null {
  const rest = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length)
    : pathname.replace(/^\//, '');
  return ORDER.exec(rest.toLowerCase())?.[1] ?? null;
}

export function pathFor(levelId: string | null): string {
  return levelId === null ? BASE : `${BASE}order/${levelId}`;
}

function levelOfState(state: GameState): string | null {
  if (state.blocked) return state.blocked.levelId;
  return state.screen === 'workspace' ? state.currentLevelId : null;
}

function announcementFor(state: GameState): string {
  if (state.blocked) {
    return state.blocked.reason === 'unknown'
      ? `No level ${state.blocked.levelId}.`
      : `Level ${state.blocked.levelId} is on hold.`;
  }
  const open = levelOfState(state);
  const level = open ? getLevel(open) : undefined;
  return level ? `Level ${level.id}, ${level.title}.` : 'Site map.';
}

// Reopening the order already in hand would throw away its console and loaded trace, and Back
// into the level a player just left is the common case.
function enterRoute(levelId: string | null): void {
  const state = useGame.getState();
  if (levelId === null) {
    state.goto('levels');
    return;
  }
  if (levelId === state.currentLevelId && !state.blocked && getLevel(levelId)) {
    state.goto('workspace');
    return;
  }
  state.openLevel(levelId);
}

function announcer(): { say: (text: string) => void; remove: () => void } {
  if (typeof document === 'undefined') return { say: () => {}, remove: () => {} };
  const region = document.createElement('p');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.style.cssText = ANNOUNCER_STYLE;
  document.body.appendChild(region);
  return {
    say: (text) => {
      region.textContent = text;
    },
    remove: () => {
      region.remove();
    },
  };
}

let detach: (() => void) | null = null;

export function mountRouter(): () => void {
  detach?.();

  const view = window;
  const region = announcer();
  let restoring = false;
  let here = '';

  const arrive = (levelId: string | null): void => {
    restoring = true;
    try {
      enterRoute(levelId);
    } finally {
      restoring = false;
    }
    here = pathFor(levelOfState(useGame.getState()));
    region.say(announcementFor(useGame.getState()));
  };

  const onPopState = (): void => {
    arrive(levelOf(view.location.pathname));
  };

  arrive(levelOf(view.location.pathname));
  if (here !== view.location.pathname) {
    view.history.replaceState(null, '', here + view.location.search + view.location.hash);
  }

  const unsubscribe = useGame.subscribe((state, previous) => {
    if (restoring) return;
    if (
      state.screen === previous.screen &&
      state.currentLevelId === previous.currentLevelId &&
      state.blocked === previous.blocked
    ) {
      return;
    }
    const path = pathFor(levelOfState(state));
    if (path === here) return;
    here = path;
    view.history.pushState(null, '', path);
    region.say(announcementFor(state));
  });

  view.addEventListener('popstate', onPopState);

  const teardown = (): void => {
    view.removeEventListener('popstate', onPopState);
    unsubscribe();
    region.remove();
    if (detach === teardown) detach = null;
  };
  detach = teardown;
  return teardown;
}

if (typeof window !== 'undefined') mountRouter();
