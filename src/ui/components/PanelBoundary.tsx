import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Keeps one panel's failure inside that panel.
 *
 * The Repository is optional (docs/LIBRARY.md §1), so a fault in it must cost the player their
 * Repository and nothing else. Without a boundary a render error in a mounted panel unmounts the
 * whole tree and the player loses the work order they were in the middle of.
 */
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
