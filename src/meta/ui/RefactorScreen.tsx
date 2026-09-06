import { useState } from 'react';
import type * as React from 'react';
import { REFACTOR } from '../copy.ts';
import type { FunctionReport } from '../profile.ts';
import { bestProjection, upgradeSummary } from '../profile.ts';
import { useLibrary } from '../store.ts';
import './library.css';

/**
 * Cost analysis: what each published subroutine is costing across the whole campaign.
 *
 * This is the screen the feature lives or dies on, so it is deliberately plain. One row per
 * subroutine, sorted by ticks charged, and under the expanded row the actual work orders with
 * their actual numbers. No sparklines, no gauges — the number *is* the drama.
 *
 * The projection line under a row is the hook: "2 ticks off `pathTo` improves 7 work orders, 3 of
 * them to a better medal." It is built from measured call counts and the real medal thresholds,
 * and it is omitted entirely when nothing would change bracket, because a made-up target is worse
 * than none.
 */

function Row({ report }: { report: FunctionReport }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const projection = bestProjection(report);

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
        <td className="numeric">{report.callers.length}</td>
        <td className="numeric">{report.calls}</td>
        <td className="numeric">{report.ticks}</td>
        <td className="numeric">{report.perCall}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5}>
            {report.callers.length === 0 ? (
              <p className="lib__empty">
                {report.stale.length > 0 ? REFACTOR.stale : REFACTOR.neverCalled}
              </p>
            ) : (
              <>
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

  return (
    <div>
      <p className="lib__note">{REFACTOR.lede}</p>
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
