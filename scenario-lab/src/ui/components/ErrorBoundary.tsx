import { Component, type ErrorInfo, type ReactNode } from 'react';
import { log } from '@/core/log';

interface Props {
  children: ReactNode;
  /** Reset the boundary when this value changes (e.g. the route). */
  resetKey?: string;
}

/** Catches render errors and shows a readable message instead of a stack trace. */
export class ErrorBoundary extends Component<Props, { failed: boolean; resetKey?: string }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; resetKey?: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('ui.render_failed', { name: error.name, hasStack: Boolean(info.componentStack) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel panel--error" role="alert">
        <h2>This part of the app ran into a problem</h2>
        <p>Your saved projects are not affected. Try going back to the project list, or reload the page.</p>
        <p>
          <a className="btn" href="/">
            Back to projects
          </a>
        </p>
      </div>
    );
  }
}
