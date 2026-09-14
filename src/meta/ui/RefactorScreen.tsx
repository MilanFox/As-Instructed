import { useState } from 'react';
import type * as React from 'react';
import { REFACTOR } from '../copy.ts';
import type { FunctionReport } from '../profile.ts';
import { bestProjection, upgradeSummary } from '../profile.ts';
import { useLibrary } from '../store.ts';
import './library.css';

function perCallCell(report: FunctionReport): string {
  const range = report.range;
  if (!range) return '—';
  return range.low === range.high ? `${range.low}` : `${range.low}–${range.high}`;
}

function emptyReason(report: FunctionReport): string {
  if (report.unmeasured.length > 0) return REFACTOR.neverCalled(report.unmeasured);
  if (report.stale.length > 0) return REFACTOR.stale;
  return REFACTOR.neverMeasured;
}

function Row({ report }: { report: FunctionReport }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const projection = bestProjection(report);
  const measured = report.callers.length > 0;
  const range = report.range;

  return (
    <>
      <tr
        className="lib-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(!open);
          }
        }}
      >
        <td>
          <span className="lib-name">{report.name}</span>
          {report.origin ? (
            <span className="lib__note"> — published from {report.origin.fromLevel}</span>
          ) : null}
        </td>
        <td className="numeric">{measured ? report.callers.length : '—'}</td>
        <td className="numeric">{measured ? report.calls : '—'}</td>
        <td className="numeric">{measured ? report.ticks : '—'}</td>
        <td className="numeric">{perCallCell(report)}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5}>
            {!measured ? (
              <p className="lib__empty">{emptyReason(report)}</p>
            ) : (
              <>
                {range && range.low !== range.high ? (
                  <p className="lib__note">
                    {REFACTOR.varies(range.low, range.lowLevel, range.high, range.highLevel)}
                  </p>
                ) : null}
                {projection ? (
                  <div className="lib-projection">
                    {projection.headline}
                    {projection.upgrades.length > 0 ? (
                      <ul className="lib-projection__upgrades">
                        {upgradeSummary(projection).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <p className="lib__note">{REFACTOR.noProjection(report.name)}</p>
                )}
                <table className="lib-table">
                  <thead>
                    <tr>
                      <th>Work order</th>
                      <th className="numeric">Calls</th>
                      <th className="numeric">Ticks in {report.name}</th>
                      <th className="numeric">{REFACTOR.columns.perCall}</th>
                      <th className="numeric">Ticks total</th>
                      <th className="numeric">Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.callers.map((caller) => (
                      <tr key={caller.levelId}>
                        <td>
                          {caller.levelId} — {caller.title}
                        </td>
                        <td className="numeric">{caller.calls}</td>
                        <td className="numeric">{caller.ticks}</td>
                        <td className="numeric">{caller.perCall}</td>
                        <td className="numeric">{caller.totalTicks}</td>
                        <td className="numeric">{caller.parTicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.stale.length > 0 ? (
                  <p className="lib__warn">
                    {REFACTOR.stale} ({report.stale.join(', ')})
                  </p>
                ) : null}
              </>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function RefactorScreen(): React.JSX.Element {
  const reports = useLibrary((state) => state.reports());

  if (reports.length === 0) {
    return <p className="lib__empty">{REFACTOR.nothingToCost}</p>;
  }

  const measured = reports.some((report) => report.callers.length > 0);

  return (
    <div>
      <p className="lib__note">{measured ? REFACTOR.lede : REFACTOR.nothingMeasured}</p>
      <p className="lib__note">{REFACTOR.perCallNote}</p>
      <table className="lib-table">
        <thead>
          <tr>
            <th>{REFACTOR.columns.name}</th>
            <th className="numeric">{REFACTOR.columns.callers}</th>
            <th className="numeric">{REFACTOR.columns.calls}</th>
            <th className="numeric">{REFACTOR.columns.ticks}</th>
            <th className="numeric">{REFACTOR.columns.perCall}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <Row key={report.name} report={report} />
          ))}
        </tbody>
      </table>
      <p className="lib-modal__footnote">{REFACTOR.footnote}</p>
    </div>
  );
}
