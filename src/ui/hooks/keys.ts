export type KeyId = 'run' | 'escape' | 'play' | 'back' | 'forward' | 'first' | 'last' | 'reference';

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
    what: 'dispatch the program to the site',
    always: true,
    matches: (event) => (event.metaKey || event.ctrlKey) && event.key === 'Enter',
  },
  {
    id: 'escape',
    keys: 'esc',
    what: 'put down what is held, then leave the work order',
    always: true,
    matches: (event) => event.key === 'Escape',
  },
  {
    id: 'play',
    keys: 'space',
    what: 'play or pause the trace',
    always: false,
    matches: (event) => event.key === ' ',
  },
  {
    id: 'back',
    keys: '← or ,',
    what: 'step back one tick — hold shift for ten',
    always: false,
    matches: (event) => event.key === 'ArrowLeft' || event.key === ',',
  },
  {
    id: 'forward',
    keys: '→ or .',
    what: 'step on one tick — hold shift for ten',
    always: false,
    matches: (event) => event.key === 'ArrowRight' || event.key === '.',
  },
  {
    id: 'first',
    keys: 'home',
    what: 'to the first tick',
    always: false,
    matches: (event) => event.key === 'Home',
  },
  {
    id: 'last',
    keys: 'end',
    what: 'to the last tick',
    always: false,
    matches: (event) => event.key === 'End',
  },
  {
    id: 'reference',
    keys: '? or F1',
    what: 'open the reference',
    always: false,
    matches: (event) => event.key === '?' || event.key === 'F1',
  },
];
