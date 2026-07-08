import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/utils/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', error);
    logger.error('Component stack:', errorInfo.componentStack ? new Error(errorInfo.componentStack) : undefined);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-4">
          <div className="bg-white border-4 border-ink shadow-[6px_6px_0_#1a1a1a] p-8 max-w-md w-full">
            <div className="text-center">
              <div className="text-6xl mb-4">💥</div>
              <h1 className="font-cn text-2xl mb-2">哎呀，出错了！</h1>
              <p className="font-mono text-ink/60 mb-6">
                应用遇到了一个意外错误，请尝试刷新页面。
              </p>
              
              {import.meta.env.DEV && this.state.error && (
                <div className="bg-ink/5 p-4 mb-6 text-left overflow-auto max-h-40">
                  <p className="font-mono text-sm text-pink font-bold mb-2">
                    {this.state.error.message}
                  </p>
                  <pre className="font-mono text-xs text-ink/60 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}

              <button
                onClick={this.resetError}
                className="bg-pink text-cream px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}