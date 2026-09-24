export type KeyId = 'run' | 'play' | 'back' | 'forward' | 'first' | 'last' | 'reference';

export interface KeyBinding {
  id: KeyId;
  keys: string;
  what: string;
  always: boolean;
  matches(event: KeyboardEvent): boolean;
}

export const KEY_LIST: readonly KeyBinding[] = [
  {
    id: 'run',
    keys: 'ctrl+enter',
    what: 'run the program',
    always: true,
    matches: (event) => (event.metaKey || event.ctrlKey) && event.key === 'Enter',
  },
  {
    id: 'play',
    keys: 'space',
    what: 'play or pause',
    always: false,
    matches: (event) => event.key === ' ',
  },
  {
    id: 'back',
    keys: '← or ,',
    what: 'back one tick (shift: ten)',
    always: false,
    matches: (event) => event.key === 'ArrowLeft' || event.key === ',',
  },
  {
    id: 'forward',
    keys: '→ or .',
    what: 'forward one tick (shift: ten)',
    always: false,
    matches: (event) => event.key === 'ArrowRight' || event.key === '.',
  },
  {
    id: 'first',
    keys: 'home',
    what: 'first tick',
    always: false,
    matches: (event) => event.key === 'Home',
  },
  {
    id: 'last',
    keys: 'end',
    what: 'last tick',
    always: false,
    matches: (event) => event.key === 'End',
  },
  {
    id: 'reference',
    keys: '? or F1',
    what: 'open the Manual',
    always: false,
    matches: (event) => event.key === '?' || event.key === 'F1',
  },
];
