import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class PanelBoundary extends Component<
  { label: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.label} failed to render.`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel-boundary" aria-label={`${this.props.label} — unavailable`}>
        <p>{this.props.label} stopped responding and has been taken offline for this session.</p>
        <p>Reload the page to bring it back. Your work order is unaffected.</p>
      </section>
    );
  }
}
