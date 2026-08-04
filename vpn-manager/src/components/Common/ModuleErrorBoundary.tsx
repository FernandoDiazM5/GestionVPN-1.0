import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportFrontendError } from '../../services/errorReporting';
import { isStaleChunkError, reloadOnceForStaleChunk } from '../../utils/moduleRecovery';

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  error: Error | null;
  generation: number;
}

export default class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] module render failed', error.name, info.componentStack);
    reportFrontendError(error, { source: 'render', componentStack: info.componentStack ?? undefined });
    reloadOnceForStaleChunk(error);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState(({ generation }) => ({ error: null, generation: generation + 1 }));
    }
  }

  private retry = () => {
    this.setState(({ generation }) => ({ error: null, generation: generation + 1 }));
  };

  render() {
    if (this.state.error) {
      const staleChunk = isStaleChunkError(this.state.error);
      return (
        <section className="card border-rose-200 p-8 text-center dark:border-rose-500/30" role="alert">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">No se pudo abrir este modulo</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
            {staleChunk
              ? 'Hay una version nueva disponible. Actualiza la pagina para continuar.'
              : 'La vista encontro un error inesperado. Puedes reintentar sin cerrar tu sesion.'}
          </p>
          <button
            type="button"
            onClick={staleChunk ? () => window.location.reload() : this.retry}
            className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 px-4 py-2"
          >
            <RefreshCw className="h-4 w-4" /> {staleChunk ? 'Actualizar pagina' : 'Reintentar'}
          </button>
        </section>
      );
    }

    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
  }
}
