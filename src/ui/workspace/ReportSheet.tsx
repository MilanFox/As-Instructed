import { useEffect, useRef } from 'react';

import { getAchievement } from '../../game/achievements.ts';
import { OverlayPanel, PanelBar, ReportLine, StatCell } from './OverlayPanel.tsx';
import type { ReportSnapshot } from '../report.ts';

export interface ReportSheetProps {
  report: ReportSnapshot;
  onDismiss?: () => void;
  onNext?: () => void;
}

export function ReportSheet({ report, onDismiss, onNext }: ReportSheetProps): React.ReactElement {
  const dismissRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    dismissRef.current?.focus();
  }, []);

  const medal = report.medal && report.medal !== 'none' ? report.medal : null;

  return (
    <OverlayPanel className="report-sheet" label="Run report">
      <PanelBar
        tools={
          <>
            {onNext && report.passed ? (
              <button type="button" className="control control--tight" onClick={onNext}>
                Next order
              </button>
            ) : null}
            <button
              type="button"
              className="control control--tight"
              ref={dismissRef}
              onClick={onDismiss}
            >
              Dismiss
            </button>
          </>
        }
      >
        {report.passed ? 'Run closed' : 'Run diverged'}
      </PanelBar>

      <div className="report-sheet__head">
        <span className="report-sheet__verdict" data-pass={String(report.passed)}>
          {report.passed ? 'Pass' : 'Fail'}
        </span>
        <p className="report-sheet__headline">{report.headline}</p>
        {medal ? (
          <span className="report-sheet__medal" data-medal={medal}>
            {medal}
          </span>
        ) : null}
      </div>

      <div className="scroll-pane">
        <div className="stat-grid">
          <StatCell label="Ticks" value={report.ticks === null ? '—' : String(report.ticks)} />
          <StatCell label="Par" value={report.par === null ? '—' : String(report.par)} />
          <StatCell
            label="Best"
            value={report.bestTicks === null ? '—' : String(report.bestTicks)}
          />
          <StatCell
            label="Points"
            value={`${report.points === null ? '—' : String(report.points)}${
              report.stars > 0 ? ` ${'★'.repeat(report.stars)}` : ''
            }`}
          />
        </div>

        {report.personalBest === null ? null : (
          <ReportLine
            label="Record"
            value={`${String(report.personalBest.previous)} → ${String(report.personalBest.now)}`}
            tone="pass"
          />
        )}
        {report.failure === null ? null : (
          <ReportLine
            label="Fault"
            value={`${report.failure}${report.failureLine === null ? '' : ` · line ${String(report.failureLine)}`}`}
            tone="fail"
          />
        )}
        {report.bonusSeed === null ? null : (
          <ReportLine label="Bonus" value={`Missed on seed ${String(report.bonusSeed)}`} />
        )}

        {report.causes.length === 0 ? null : (
          <>
            <PanelBar sub>Why it failed</PanelBar>
            {report.causes.map((cause) => (
              <div className="report-cause" key={cause.id}>
                <span className="report-cause__label">{cause.label}</span>
                <p className="report-cause__detail">{cause.detail}</p>
                {cause.divergence ? (
                  <span className="divergence">
                    <span>{cause.divergence.where}</span>
                    <span>want {cause.divergence.want}</span>
                    <span>got {cause.divergence.got}</span>
                  </span>
                ) : null}
              </div>
            ))}
          </>
        )}

        {report.seedLines.length === 0 ? null : (
          <>
            <PanelBar sub>Seeds</PanelBar>
            {report.seedLines.map((line) => (
              <ReportLine
                key={line.seed}
                label={`Seed ${String(line.seed)}`}
                value={line.note || (line.passed ? 'closed' : 'diverged')}
                tone={line.passed ? 'pass' : 'fail'}
              />
            ))}
          </>
        )}

        {report.achievements.length === 0 ? null : (
          <>
            <PanelBar sub>Achievements</PanelBar>
            <ul>
              {report.achievements.map((id) => {
                const achievement = getAchievement(id);
                return (
                  <li className="achievement" key={id}>
                    <span className="achievement__seal" aria-hidden="true">
                      ★
                    </span>
                    <div className="achievement__text">
                      <p className="achievement__title">{achievement?.title ?? id}</p>
                      {achievement ? <p className="achievement__note">{achievement.note}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {report.onRecord === null && report.libraryLine === null ? null : (
          <>
            <PanelBar sub>On record</PanelBar>
            {report.onRecord ? (
              <ReportLine label={report.onRecord.word} value={report.onRecord.note} />
            ) : null}
            {report.libraryLine === null ? null : (
              <ReportLine label="Repository" value={report.libraryLine} />
            )}
          </>
        )}
      </div>
    </OverlayPanel>
  );
}
