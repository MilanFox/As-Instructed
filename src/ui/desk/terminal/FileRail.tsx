import { currentLevel, useGame } from '../../../game/store.ts';
import { useLibrary } from '../../../meta/store.ts';

export function FileRail(): React.JSX.Element {
  const level = useGame(currentLevel);
  const unlocked = useLibrary((state) => state.save.unlocked);
  const published = useLibrary((state) => state.save.published.length);
  const loaded = useLibrary((state) => state.panelOpen);
  const setPanelOpen = useLibrary((state) => state.setPanelOpen);

  const order = `~/orders/${level?.id ?? 'none'}`;

  if (!unlocked) return <span className="tb-path">{order}</span>;

  const routines =
    published === 0 ? 'your subroutines · empty' : `your subroutines · ${published} published`;

  return (
    <span className="tb-files">
      <button
        type="button"
        className="tb-file"
        aria-current={loaded ? undefined : 'true'}
        aria-label={`Load ${order}, the work order`}
        onClick={() => {
          setPanelOpen(false);
        }}
      >
        <span className="tbf-path">{order}</span>
        <span className="tbf-legend">work order</span>
      </button>
      <button
        type="button"
        className="tb-file"
        aria-current={loaded ? 'true' : undefined}
        aria-label={`Load ~/lib.ts, ${routines}`}
        onClick={() => {
          setPanelOpen(true);
        }}
      >
        <span className="tbf-path">~/lib.ts</span>
        <span className="tbf-legend">{routines}</span>
      </button>
    </span>
  );
}
