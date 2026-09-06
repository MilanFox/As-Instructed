/**
 * The furniture along the bottom edge of the desk, and the two bound volumes.
 *
 * These are **the doors**. `docs/AUDIT-UI.md` F12 found four of the game's five information
 * surfaces reachable only through 10px dim uppercase chips in a corner; the desk's answer is that
 * a door should weigh what is behind it. A bound Repository is not a chip.
 */
export { Dispatch } from './Dispatch.tsx';
export { SitePlan } from './SitePlan.tsx';
export { StampBlock } from './StampBlock.tsx';
export { Pen } from './Pen.tsx';
export { Binder } from './Binder.tsx';
export { Manual } from './Manual.tsx';
export { Slot, Tray, DeskKeyboard } from './Deskware.tsx';
