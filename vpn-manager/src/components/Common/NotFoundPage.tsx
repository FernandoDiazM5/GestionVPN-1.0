import { ArrowLeft, Home, SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  authenticated?: boolean;
}

export default function NotFoundPage({ authenticated = false }: Props) {
  const navigate = useNavigate();
  const content = (
      <section className="w-full max-w-xl text-center" aria-labelledby="not-found-title">
        <SearchX className="mx-auto h-14 w-14 text-indigo-500" />
        <p className="mt-5 font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">404</p>
        <h1 id="not-found-title" className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Pagina no encontrada</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600 dark:text-slate-300">
          La direccion no existe o fue movida. Puedes volver a una ruta conocida sin perder tu sesion.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-outline inline-flex min-h-11 items-center gap-2 px-4 py-2">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <button type="button" onClick={() => navigate(authenticated ? '/nodes' : '/', { replace: true })} className="btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2">
            <Home className="h-4 w-4" /> {authenticated ? 'Ir a nodos' : 'Ir al inicio'}
          </button>
        </div>
      </section>
  );

  if (authenticated) {
    return <div className="flex min-h-[60vh] items-center justify-center py-10">{content}</div>;
  }

  return (
    <main className="page-bg flex min-h-screen items-center justify-center px-4 py-12">
      {content}
    </main>
  );
}
