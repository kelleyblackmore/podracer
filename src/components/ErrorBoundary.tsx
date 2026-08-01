import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * A WebGL context failure or a bad driver used to blank the whole page. Now it
 * surfaces the error and offers a way back to the menu.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Podracer crashed:', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-lg rounded-2xl border border-red-500/40 bg-red-950/30 p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h1 className="font-display text-2xl font-bold text-white">Engine failure</h1>
          <p className="mt-3 text-slate-300">
            Something went wrong rendering the race. This usually means WebGL is unavailable or
            disabled in your browser.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950/80 p-3 text-left text-xs text-red-300">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            className="mt-6 rounded-lg bg-white px-6 py-3 font-display font-bold text-slate-900 transition-colors hover:bg-slate-200"
          >
            Back to the paddock
          </button>
        </div>
      </div>
    );
  }
}

/** Cheap capability probe so we can warn before mounting a Canvas that will fail. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}
