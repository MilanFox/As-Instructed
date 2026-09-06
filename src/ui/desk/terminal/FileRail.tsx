/**
 * The station's file rail — which of the two files this terminal has loaded.
 *
 * The routines the player publishes are **code**, and `docs/DESK-CONCEPT.md` §2 is the ruling that
 * decides where code lives: the screen is the work and the paper is the company, and no paper
 * texture ever touches a program. So `lib.ts` is not a document, not a volume and not a modal — it
 * is a second file on the machine the player already writes in, and the door is the machine saying
 * which file is loaded. `Binder.tsx` said as much in its own first paragraph before this existed:
 * the routines "keep their name inside the terminal".
 *
 * It is a rail rather than a chip because of `docs/AUDIT-UI.md` F12, which found every reading
 * surface in the old interface behind a 10px dim uppercase corner control. Each file here is a
 * moulded key carrying its full path, a legend saying what the file is, and — for `lib.ts` — the
 * count of what is in it, so a player who has just published sees the number go up on the machine
 * they are already looking at.
 *
 * Before the Repository is provisioned there is no second file and the rail is not drawn at all:
 * `src/meta/unlock.ts` keeps Worlds 1 and 2 strictly a one-file game and the whole on-ramp depends
 * on it.
 */
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
