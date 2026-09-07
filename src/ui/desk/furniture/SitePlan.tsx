/**
 * THE SITE PLAN — the way back to the campaign, as an object.
 *
 * A player entered a work order and could not get out of it: the desk had a door in and no door
 * out. That is the same defect — the control that summons a surface has to be proportionate to
 * the surface — and the site map is the largest surface the game has.
 *
 * So it is a folded plan of the works, lying on the desk under the stamp block, always there,
 * never a chip in a corner. It is the same object the site map screen already is.
 */
import { useGame } from '../../../game/store.ts';

export function SitePlan(): React.ReactElement {
  const goto = useGame((state) => state.goto);
  const save = useGame((state) => state.save);
  const closed = Object.values(save.levels).filter((level) => level.completed).length;

  return (
    <button
      type="button"
      className="siteplan"
      aria-label="Back to the site map"
      onClick={() => goto('levels')}
    >
      <span className="sp-sheet">
        <span className="sp-title">SITE PLAN</span>
        <span className="sp-sub">KESSLER &amp; DAUGHTERS — THE WORKS</span>
        <span className="sp-count numeric">{closed} CLOSED</span>
      </span>
      <span className="sp-fold" />
      <span className="sp-crease" />
    </button>
  );
}
