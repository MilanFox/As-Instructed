/**
 * `~/lib.ts` — the routines the player has written and kept, loaded on the terminal.
 *
 * **Not the bound commendation book.** That is `Binder.tsx`, it is the company's record of what
 * the site has recognised, and the two are deliberately different objects: the campaign has to be
 * finishable by a player who never opens the volume, so no route into a work order may live inside
 * it. This is the other thing — the player's own accumulated subroutines, which are code, and
 * which therefore live on the machine rather than on the desk.
 *
 * The regression this closes: `Workspace.tsx` was the only surface that rendered `LibraryPanel`,
 * and it was deleted with the panel workspace. A player could publish a routine and then had no
 * way to look at it — and the provisioning notice's own `open it` button called `setPanel` into
 * nothing. `useLibrary`'s `panelOpen` was intact the whole time; this is the door, not a rebuild.
 *
 * **It is a desk object with its own boundary, and that is not bookkeeping.** `PanelBoundary` was
 * written for exactly this panel — it compiles TypeScript, mounts a second Monaco model and runs a
 * regression suite, so it is the likeliest thing on the desk to throw. Rendered inside the
 * terminal's own tree a fault would take the program, the objectives rail and the output log with
 * it. Rendered from `DESKWARE` it costs the player their routines and nothing else.
 *
 * The layer is drawn exactly over the terminal's glass — the same box, recomputed from the
 * stylesheets by `src/ui/__tests__/desk-frame.test.ts` — because it is not something laid *on* the
 * machine, it is what the machine is showing. Nothing is ever drawn over the site feed.
 */
import { Suspense, lazy } from 'react';

import { useLibrary } from '../../../meta/store.ts';
import { FileRail } from '../terminal/FileRail.tsx';

/*
 * The second lazy boundary, for the same reason as the first (`terminal/Program.tsx`): the library
 * editor is a real Monaco model, and a static import of it would put 988 kB of gzip back in front
 * of the board. `RoutinesFile.tsx` is the only module on this side that reaches `meta/ui`.
 */
const RoutinesFile = lazy(async () => {
  const module = await import('./RoutinesFile.tsx');
  return { default: module.RoutinesFile };
});

export function Routines(): React.ReactElement {
  const unlocked = useLibrary((state) => state.save.unlocked);
  const loaded = useLibrary((state) => state.panelOpen);

  if (!unlocked || !loaded) return <></>;

  return (
    <section className="routines" aria-label="lib.ts, your subroutines">
      {/*
        The rail is drawn again here rather than left showing through from underneath, because the
        terminal bar's height follows the SIZE dial and a layer pinned to a constant could not
        track it. It is the same component, so the player sees one rail and only the file below it
        changes — and the way back out is on screen at all times, which is the finding the binder's
        head-mounted close button came from.
      */}
      <div className="term-bar">
        <span className="tb-host">station-4471</span>
        <span className="tb-sep">:</span>
        <FileRail />
      </div>
      <Suspense fallback={<p className="prog-opening">opening lib.ts…</p>}>
        <RoutinesFile />
      </Suspense>
    </section>
  );
}
