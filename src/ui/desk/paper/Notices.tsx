/**
 * The three sheets the company sends you that are not about one run.
 *
 * The Repository's delivery note, the Performance Review memo, and the standing sheet — the one
 * piece of paper on this desk that is never filed.
 */
import { BONUS_STAR_POINTS, REVIEW_TIERS, reviewTier } from '../../../game/score.ts';
import { useGame } from '../../../game/store.ts';
import { campaignOrder } from '../../../levels/index.ts';
// Deep imports on purpose: `src/meta/ui/index.ts` re-exports `LibraryPanel`, which pulls Monaco
// into whatever chunk reaches it, and the desk is rendered from the entry chunk.
import { REPOSITORY_ISSUE } from '../../../meta/copy.ts';
import { useLibrary } from '../../../meta/store.ts';
import { nextRequirementAfter, requirementLevelCount } from '../../../meta/unlock.ts';
import { REVIEW } from '../../copy.ts';
import { fillPlaceholders, reportFor, reviewOwed } from '../../screens/review.ts';
import { usePapers } from './papers.ts';

/**
 * The Repository's delivery note.
 *
 * DESIGN.md §7: "Hardware unlocks are a ceremony." The Repository is not hardware, but it is the
 * biggest capability the game hands over, and until this existed it was the only one that arrived
 * without one. Three jobs and nothing else: state that a second file now exists, show what will
 * ask for it, and put the player one click from opening it.
 */
export function RepositoryNote({ docId }: { docId: string }): React.JSX.Element {
  const markBriefed = useLibrary((state) => state.markBriefed);
  const setPanel = useLibrary((state) => state.setPanel);
  const currentLevelId = useGame((state) => state.currentLevelId);
  const file = usePapers((state) => state.file);

  const next = nextRequirementAfter(
    campaignOrder().map((level) => level.id),
    currentLevelId,
  );
  const sample = next?.requirements[0]?.name ?? 'pathTo';

  const acknowledge = (): void => {
    markBriefed();
    file(docId, 'read');
  };

  return (
    <>
      <h1>
        <b>PROVISIONING NOTICE</b>
        <span>LIB-01</span>
      </h1>
      <div className="kicker">{REPOSITORY_ISSUE.from.toUpperCase()}</div>
      <h2>{REPOSITORY_ISSUE.title}</h2>
      <p>{REPOSITORY_ISSUE.intro}</p>

      <div className="crate">
        <div className="nm">
          <code>{REPOSITORY_ISSUE.file}</code>
        </div>
        <div>
          <div className="sp">{REPOSITORY_ISSUE.spec}</div>
          <div className="op">
            <code>{`import { ${sample} } from 'lib';`}</code>
          </div>
        </div>
      </div>

      <p className="quiet">
        {REPOSITORY_ISSUE.asksLabel(requirementLevelCount())} <code>{next?.levelId ?? 'w4-05'}</code>
        . {REPOSITORY_ISSUE.perCall}
      </p>

      <div className="dot">dot: {REPOSITORY_ISSUE.dot}</div>

      <div className="acts">
        <button
          type="button"
          className="act"
          onClick={(event) => {
            event.stopPropagation();
            acknowledge();
            setPanel('library');
          }}
        >
          {REPOSITORY_ISSUE.open}
        </button>
        <button
          type="button"
          className="act ghost"
          onClick={(event) => {
            event.stopPropagation();
            acknowledge();
          }}
        >
          {REPOSITORY_ISSUE.dismiss}
        </button>
      </div>
      <div className="ref">SHARED SUBROUTINES · ISSUE</div>
    </>
  );
}

/**
 * The Performance Review — a memo from Deputy Site Coordinator M. Vance.
 *
 * DESIGN.md §11 A8: it is a memo, not a screen. It used to be a screen behind a top-bar icon with
 * a medal wall that restated the site map, and neither playtester opened it once; then it was a
 * modal on the site map that fired once per tier and was deleted on acknowledgement. It arrives at
 * the desk now, which is where a memo arrives, and it lies there until it is acknowledged.
 *
 * The four tiers are NARRATIVE.md §7 verbatim and live in `REVIEW_TIERS`; this renders that data
 * and never restates it. The grade's arithmetic lives in `src/ui/screens/review.ts`.
 */
export function PerformanceMemo({
  docId,
  rank,
}: {
  docId: string;
  rank: number;
}): React.JSX.Element | null {
  const save = useGame((state) => state.save);
  const fileReview = useGame((state) => state.fileReview);
  const file = usePapers((state) => state.file);

  const report = reportFor(save);
  /*
   * The tier the memo was issued for, not the tier the player is on now. A grade is a quality
   * average and it moves both ways, so a memo written for rank 4 must not silently become a
   * different memo because a later silver pulled the average down.
   */
  const tier = REVIEW_TIERS.find((entry) => entry.rank === rank) ?? reviewOwed(save);
  if (!tier) return null;

  const footnotes = tier.legal ?? [];
  const paragraphs = tier.body.split('\n\n');

  return (
    <>
      <h1>
        <b>PERFORMANCE REVIEW</b>
        <span>#4471</span>
      </h1>
      <div className="kicker">{REVIEW.from.toUpperCase()}</div>
      <h2>{tier.grade}</h2>

      <dl className="meta">
        <dt>FROM</dt>
        <dd>{REVIEW.author}</dd>
        <dt>REVIEWED</dt>
        <dd>{report.closed} work orders</dd>
        <dt>GRADE</dt>
        <dd className="numeric">{Math.round(report.percent)}%</dd>
      </dl>

      {paragraphs.map((paragraph, index) => (
        <p key={paragraph.slice(0, 24)}>
          {fillPlaceholders(paragraph, tier, report)}
          {footnotes[index] !== undefined ? <sup>{index + 1}</sup> : null}
        </p>
      ))}

      <div className="dot">dot: {tier.dot}</div>

      {footnotes.length > 0 ? (
        <div className="foot">
          {footnotes.map((note, index) => (
            <p key={note.slice(0, 24)}>
              <sup>{index + 1}</sup> {note}
            </p>
          ))}
        </div>
      ) : null}

      <div className="acts">
        <button
          type="button"
          className="act"
          onClick={(event) => {
            event.stopPropagation();
            fileReview(tier.rank);
            file(docId, 'acknowledged');
          }}
        >
          {REVIEW.dismiss}
        </button>
      </div>
      <div className="ref">PERSONNEL &amp; SCHEDULING</div>
    </>
  );
}

/**
 * The standing sheet. Never filed, never dismissed, always on the desk.
 *
 * `docs/AUDIT-UI.md` F18: the grade was shown once, ever, and then it was unreachable — *a grade
 * delivered once and then deleted is not a grade, it is an event*. `reportFor` already computed it
 * on the site map, for the memo's delivery check, and nothing displayed it.
 *
 * **The header follows `reportFor`.** Points, the maximum they were scored against and the
 * percentage are one fraction read three ways; a second denominator beside points would be the
 * disagreeing-tick-counter bug in miniature. And this is a persistent readout, not permission to
 * rebuild the Performance Review screen (DESIGN.md §11 A8).
 */
export function StandingSheet(): React.JSX.Element {
  const save = useGame((state) => state.save);
  const report = reportFor(save);
  const issued = campaignOrder().length;
  const tier = report.graded ? reviewTier(report.percent) : null;

  return (
    <>
      <h1>
        <b>STANDING</b>
        <span>#4471</span>
      </h1>
      <div className="kicker">PERSONNEL &amp; SCHEDULING · RUNNING RECORD</div>

      {report.graded ? (
        <h2 className="numeric">
          {Math.round(report.percent)}%<span className="quiet"> {tier?.grade}</span>
        </h2>
      ) : (
        <h2>NO RESULT ON FILE</h2>
      )}

      <div className="facts">
        <div>
          <b>points</b>
          <span className="numeric">
            {report.points} of {report.maxPoints}
            <span className="quiet"> over {report.closed} closed work orders</span>
          </span>
        </div>
        <div>
          <b>medals</b>
          <span className="numeric">
            {report.gold} gold · {report.silver} silver · {report.bronze} bronze
          </span>
        </div>
        <div>
          <b>stars</b>
          <span className="numeric">
            {report.stars}
            <span className="quiet"> · {BONUS_STAR_POINTS} pt each</span>
          </span>
        </div>
        <div>
          <b>issued</b>
          <span className="numeric">{issued} work orders on this site</span>
        </div>
      </div>

      <p className="quiet">
        {/* The middle state the sheet used to skip: work closed, none of it graded. Telling a
            contractor who has closed two work orders to go and close a work order reads the
            three zeros above as a failure rather than as A7 (DESIGN.md §11 A7). */}
        {report.graded
          ? 'A quality average over what is closed, not a progress bar. It moves both ways.'
          : report.ungraded > 0
            ? 'Nothing closed so far was graded. A grade appears with the first that is.'
            : 'Close a work order and a grade appears here. Nothing is graded before that.'}
      </p>
      <div className="ref">K&amp;D FORM 9 · RUNNING RECORD</div>
    </>
  );
}
