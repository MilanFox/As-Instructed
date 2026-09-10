/**
 * Every key the game binds — the list, and the thing the listener is built from.
 *
 * Ten keys used to be bound and only three of them announced, in tooltips. The fix is a
 * key list the player can reach, in the REFERENCE manual. A list written out in the manual beside
 * a `switch` written out in `useKeyboard.ts` is two sources of truth for one fact — the confessed-
 * duplication class `src/__tests__/confessed-invariants.test.ts` exists to catch — so there is one
 * list, here, and both read it. `useKeyboard` maps `KeyId` to an action through a
 * `Record<KeyId, …>`, which makes an unbound listed key and an unlisted bound key both compile
 * errors rather than a drift nobody notices.
 *
 * There was also a contradiction on one screen: the old RUN button drew `⌘⏎` while the
 * editor's status line drew `ctrl+enter to run`. `RUN_HINT` is the one statement of the one
 * modifier, printed once, on the terminal's status strip.
 */

export type KeyId =
  | 'run'
  | 'escape'
  | 'focus'
  | 'play'
  | 'back'
  | 'forward'
  | 'first'
  | 'last'
  | 'reference';

export interface KeyBinding {
  id: KeyId;
  /** As a player would type it, and as the REFERENCE prints it. */
  keys: string;
  what: string;
  /**
   * Fires with the caret in the program, and away from the work order.
   *
   * Run must work from anywhere including the editor, or the one key the game announces is the one
   * key that does not work where the player's hands are. Escape is the way out of anything.
   * Everything else is the transport, and a transport key that stole a character from the program
   * would be a worse bug than not having it.
   */
  always: boolean;
  matches(event: KeyboardEvent): boolean;
}

/**
 * The one modifier, stated once.
 *
 * `useKeyboard` accepts Meta as well as Control so a Mac keyboard's Command works, but a hint that
 * names both names neither — the audit's finding was two hints disagreeing, not one being narrow.
 */
export const RUN_HINT = 'ctrl+enter dispatches every seed';

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
    id: 'focus',
    keys: 'ctrl+shift+f',
    what: 'widen the terminal and shrink the site feed to a preview',
    /*
     * `always`, because the whole point of it is to be pressed while writing. A player who has to
     * take their hands off the program, find a switch on the bezel and click it has been given a
     * preference rather than a way of working — and Shift plus a letter is a chord no editor
     * command in Monaco's default keymap claims, so nothing is stolen from the caret either.
     */
    always: true,
    matches: (event) =>
      (event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 'f' || event.key === 'F'),
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
