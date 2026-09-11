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
