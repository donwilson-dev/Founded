import React, { Component } from 'react';
import EmptyState from './EmptyState.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-fallback">
          <EmptyState
            title="Founded hit a rendering issue"
            body="Refresh the page to retry. If it persists, check the browser console and backend status."
          />
        </div>
      );
    }

    return this.props.children;
  }
}
