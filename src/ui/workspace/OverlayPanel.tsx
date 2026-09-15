export interface OverlayPanelProps {
  className: string;
  children: React.ReactNode;
  open?: boolean;
  label?: string;
  id?: string;
  inert?: boolean;
}

export function OverlayPanel({
  className,
  children,
  open,
  label,
  id,
  inert,
}: OverlayPanelProps): React.ReactElement {
  return (
    <section
      className={`overlay-panel ${className}`}
      id={id}
      data-open={open === undefined ? undefined : String(open)}
      aria-label={label}
      {...(inert === true ? { inert: true } : {})}
    >
      <div className="overlay-panel__body">{children}</div>
    </section>
  );
}

export interface PanelBarProps {
  children: React.ReactNode;
  tools?: React.ReactNode;
  sub?: boolean;
}

export function PanelBar({ children, tools, sub }: PanelBarProps): React.ReactElement {
  return (
    <div className={sub === true ? 'panel-bar panel-bar--sub' : 'panel-bar'}>
      <span>{children}</span>
      {tools ? <span className="panel-bar__tools">{tools}</span> : null}
    </div>
  );
}

export interface StatCellProps {
  label: string;
  value: React.ReactNode;
  tone?: 'over' | 'good';
}

export function StatCell({ label, value, tone }: StatCellProps): React.ReactElement {
  return (
    <div className="stat-cell">
      <span className="stat-cell__label">{label}</span>
      <span className="stat-cell__value" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

export interface ReportLineProps {
  label: string;
  value: React.ReactNode;
  tone?: 'fail' | 'pass';
}

export function ReportLine({ label, value, tone }: ReportLineProps): React.ReactElement {
  return (
    <div className="report-line">
      <span className="report-line__label">{label}</span>
      <span className="report-line__value" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}
