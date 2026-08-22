import { useEffect, useState } from 'react';
import { X, Copy, Download, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { WgPeer } from '../../../../types/api';
import Dialog from '../../../Common/Dialog';

/**
 * Modal que muestra la configuración WireGuard COMPLETA de un peer
 * (con PrivateKey real si fue generada server-side). Solo accesible para
 * el moderador propietario del workspace donde está el peer.
 */
export default function WgConfigModal({ peer, onClose }: { peer: WgPeer; onClose: () => void }) {
  const [conf, setConf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    teamApi.wireguardByKey(peer.publicKey)
      .then(r => {
        if (!alive) return;
        if (r.wireguard?.conf) setConf(r.wireguard.conf);
        else setError('Este peer no tiene una configuración guardada (probablemente fue creado importando una clave pública externa).');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'No se pudo obtener la configuración');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [peer.publicKey]);

  const copyConf = () => {
    if (!conf) return;
    navigator.clipboard.writeText(conf).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadConf = () => {
    if (!conf) return;
    // octet-stream (no text/plain): evita que el navegador añada ".txt" al .conf.
    const blob = new Blob([conf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(peer.name || 'wireguard').replace(/[^\w.-]+/g, '_')}.conf`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      title="Configuración WireGuard"
      onClose={onClose}
      panelClassName="modal-panel modal-panel-xl"
    >
        {/* Header — usa gradient indigo-600→800 intencional para destacar
            del modal-header-indigo (color sólido) que tienen otros modales.
            Mantiene .modal-header-decorated para layout y .modal-header-close. */}
        <div className="modal-header-decorated bg-gradient-to-br from-indigo-600 to-indigo-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white/20 p-2 rounded-xl shrink-0"><ShieldCheck className="w-5 h-5 text-white" /></div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white sm:text-base">Configuración WireGuard</h3>
              <p className="text-2xs text-indigo-200 font-mono truncate">{peer.name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="modal-header-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-w-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Cargando configuración…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">{error}</p>
            </div>
          )}

          {conf && !loading && (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Pega esta configuración en la app WireGuard del usuario:
              </p>
              <pre className="max-h-[42dvh] max-w-full overflow-auto whitespace-pre rounded-xl border border-slate-800 bg-slate-900 p-3 font-mono text-2xs leading-relaxed text-slate-100 sm:p-4">
{conf}
              </pre>
              <p className="text-2xs text-rose-600 dark:text-rose-400">
                ⚠️ La clave privada solo se guarda cifrada. Compártela por un canal seguro.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex sm:items-center sm:justify-end sm:px-6 sm:py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <button onClick={onClose}
            className="hidden btn-ghost btn-md sm:inline-flex">
            Cerrar
          </button>
          <button onClick={downloadConf} disabled={!conf}
            className="btn-outline flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Descargar
          </button>
          <button onClick={copyConf} disabled={!conf}
            className="btn-primary flex min-h-11 min-w-0 items-center justify-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40 sm:px-4">
            <Copy className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{copied ? '¡Copiado!' : 'Copiar configuración'}</span>
          </button>
        </div>
    </Dialog>
  );
}
