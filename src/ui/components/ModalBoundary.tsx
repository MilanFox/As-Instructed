import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class ModalBoundary extends Component<
  { label: string; onDismiss: () => void; children: ReactNode },
  { failed: boolean; dismissed: boolean }
> {
  override state = { failed: false, dismissed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.label} failed to render.`, error, info.componentStack);
  }

  private readonly dismiss = (): void => {
    try {
      this.props.onDismiss();
    } catch (error) {
      console.error(`${this.props.label} could not be closed cleanly.`, error);
    }
    this.setState({ dismissed: true });
  };

  override render(): ReactNode {
    if (this.state.dismissed) return null;
    if (!this.state.failed) return this.props.children;
    return (
      <div className="overlay" role="presentation">
        <div
          className="modal modal--narrow"
          role="alertdialog"
          aria-modal="true"
          aria-label={`${this.props.label} — error`}
        >
          <header className="modal__head">
            <h2 className="modal__verdict modal__verdict--fail">ERROR</h2>
          </header>
          <div className="modal__body">
            <p className="modal__line">{this.props.label} stopped working.</p>
            <p className="modal__line">Your code and progress are safe.</p>
          </div>
          <footer className="modal__foot">
            <button
              type="button"
              className="btn btn--run"
              ref={(element) => element?.focus({ preventScroll: true })}
              onClick={this.dismiss}
            >
              Close
            </button>
          </footer>
        </div>
      </div>
    );
  }
}
