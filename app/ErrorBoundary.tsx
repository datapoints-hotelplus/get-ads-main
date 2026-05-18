"use client";

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-8 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 text-2xl mb-2">⚠️</div>
          <h2 className="text-base font-semibold text-red-800 mb-1">
            เกิดข้อผิดพลาด
          </h2>
          <p className="text-sm text-red-600 mb-4 max-w-md text-center">
            {this.state.error?.message ?? "Unknown error"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              ลองใหม่
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
            >
              รีโหลดหน้า
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
