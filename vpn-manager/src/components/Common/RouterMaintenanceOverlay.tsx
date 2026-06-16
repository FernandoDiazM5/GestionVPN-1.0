// ============================================================
//  RouterMaintenanceOverlay — PANTALLA COMPLETA BLOQUEANTE.
//
//  Se muestra cuando cualquier llamada al backend responde
//  503 MIKROTIK_UNREACHABLE (router de gestión configurado pero sin
//  respuesta: timeout/refused). apiClient dispara 'router_unreachable'.
//
//  A diferencia de un modal, NO es cerrable: bloquea toda la app
//  mientras el túnel WireGuard de gestión no esté activo. Se renderiza
//  vía portal a document.body (top-level garantizado) y bloquea el
//  scroll del body. Único camino: activar el WireGuard y recargar.
//
//  No reemplaza el banner NEEDS_CONFIG (router NO configurado, que es
//  responsabilidad del Administrador).
// ============================================================
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, RefreshCw, Download, Wifi, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { API_BASE_URL } from '../../config';

export default function RouterMaintenanceOverlay() {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState('');
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    const onDown = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (typeof msg === 'string' && msg) setDetail(msg);
      setVisible(true);
    };
    window.addEventListener('router_unreachable', onDown);
    return () => window.removeEventListener('router_unreachable', onDown);
  }, []);

  // Verifica de verdad si el router ya responde antes de recargar. Si sí →
  // entra a la app; si no → persiste la pantalla con un aviso. Evita el
  // "recargar a ciegas" que devolvía a la misma pantalla sin comprobar nada.
  const handleVerify = async () => {
    setChecking(true);
    setNotYet(false);
    try {
      const r = await apiFetch(`${API_BASE_URL}/api/router/check`);
      const d = await r.json();
      if (d?.reachable) {
        window.location.reload();   // conexión OK → recargar y entrar
        return;
      }
    } catch { /* tratamos como no-alcanzable */ }
    setChecking(false);
    setNotYet(true);                // sigue sin responder → persiste el bloqueo
  };

  // Bloquea el scroll del body mientras la pantalla está activa.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Acceso restringido: se requiere conexión WireGuard"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.25) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* Capa de verificación: tapa todo mientras se comprueba la conexión */}
      {checking && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/85 dark:bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="h-16 w-16 rounded-full border-4 border-rose-200 dark:border-rose-500/20 border-t-rose-600 dark:border-t-rose-400 animate-spin mb-6" />
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 animate-pulse">Verificando conexión VPN…</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">Por favor espera un momento</p>
        </div>
      )}

      <main className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-slate-900/20 dark:shadow-black/50
                       overflow-hidden border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        {/* Barra superior de alerta */}
        <div className="h-1.5 w-full bg-rose-600" />

        <div className="p-8 sm:p-12 text-center">
          {/* Logo WireGuard (asset local en /public; cae al icono si falta) */}
          <div className="mx-auto mb-8 flex items-center justify-center">
            {logoFailed ? (
              <div className="relative w-24 h-24">
                <span className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
                <div className="absolute inset-0 rounded-full bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/30 flex items-center justify-center">
                  <ShieldAlert className="w-11 h-11 text-rose-600 dark:text-rose-400" />
                </div>
              </div>
            ) : (
              <img
                src={`${import.meta.env.BASE_URL}logo_wg.png`}
                alt="WireGuard"
                onError={() => setLogoFailed(true)}
                className="w-44 h-auto select-none drop-shadow-sm animate-in fade-in zoom-in-95 duration-300"
              />
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            Acceso Restringido
          </h1>
          <h2 className="text-lg font-semibold text-rose-600 dark:text-rose-400 mt-2 mb-6">
            Se requiere conexión WireGuard
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
            Para administrar la plataforma es obligatorio estar conectado a la red de gestión.
            Activa tu <strong className="font-semibold text-slate-800 dark:text-slate-100">cliente WireGuard</strong> y
            vuelve a cargar la página.
          </p>

          {detail && (
            <p className="data-muted text-2xs mt-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 break-words">
              {detail}
            </p>
          )}

          {/* Aviso: verificación previa sin éxito */}
          {notYet && (
            <div className="mt-5 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-left">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Aún no detectamos la conexión. Confirma que tu <strong>WireGuard de gestión</strong> esté activo y vuelve a intentar.
              </p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-col gap-3 mt-8">
            <button
              onClick={handleVerify}
              disabled={checking}
              className="btn-primary btn-md w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {checking
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</>
                : <><RefreshCw className="w-4 h-4" /> Ya lo activé, recargar página</>}
            </button>
            <a
              href="https://www.wireguard.com/install/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline btn-md w-full inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> ¿No tienes WireGuard? Descargar
            </a>
          </div>

          {/* Pie: ayuda + código de error */}
          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
            <p className="flex items-center justify-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              Si el problema persiste tras activar la VPN, contacta a Soporte.
            </p>
            <p className="mt-1.5 font-mono text-3xs">
              Error: ROUTER_UNREACHABLE · router de gestión sin respuesta
            </p>
          </div>
        </div>
      </main>
    </div>,
    document.body
  );
}
