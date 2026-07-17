import { Component } from 'react';

/**
 * Generic error boundary. Pass a `key` prop from the parent that changes
 * whenever you want to force-remount the subtree after recovering from an
 * error (this also resets the boundary itself, since React destroys and
 * recreates the whole component instance on key change).
 *
 * @extends {Component<{ children: import('react').ReactNode, fallback?: import('react').ReactNode, onError?: (error: unknown, info: unknown) => void }>}
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
