import { BONUS_STAR_POINTS, REVIEW_TIERS, reviewTier } from '../../../game/score.ts';
import { useGame } from '../../../game/store.ts';
import { campaignOrder } from '../../../levels/index.ts';
import { REPOSITORY_ISSUE } from '../../../meta/copy.ts';
import { useLibrary } from '../../../meta/store.ts';
import { nextRequirementAfter, requirementLevelCount } from '../../../meta/unlock.ts';
import { REVIEW } from '../../copy.ts';
import { fillPlaceholders, reportFor, reviewOwed } from '../../screens/review.ts';
import { usePapers } from './papers.ts';

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
        {REPOSITORY_ISSUE.asksLabel(requirementLevelCount())}{' '}
        <code>{next?.levelId ?? 'w4-05'}</code>. {REPOSITORY_ISSUE.perCall}
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
        <dd>{report.closed} graded work orders</dd>
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
            <span className="quiet"> over {report.closed} graded work orders</span>
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
