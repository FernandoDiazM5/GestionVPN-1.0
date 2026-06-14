import { useEffect, useState } from 'react';
import { X, Copy, Download, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { WgPeer } from '../../../../types/api';

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
    const blob = new Blob([conf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(peer.name || 'wireguard').replace(/[^\w.-]+/g, '_')}.conf`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel-xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white/20 p-2 rounded-xl shrink-0"><ShieldCheck className="w-5 h-5 text-white" /></div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">Configuración WireGuard</h3>
              <p className="text-2xs text-indigo-200 font-mono truncate">{peer.name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
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
              <pre className="text-2xs font-mono bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre leading-relaxed border border-slate-800">
{conf}
              </pre>
              <p className="text-2xs text-rose-600 dark:text-rose-400">
                ⚠️ La clave privada solo se guarda cifrada. Compártela por un canal seguro.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            Cerrar
          </button>
          <button onClick={downloadConf} disabled={!conf}
            className="btn-outline px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Descargar
          </button>
          <button onClick={copyConf} disabled={!conf}
            className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40">
            <Copy className="w-3.5 h-3.5" /> {copied ? '¡Copiado!' : 'Copiar configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}
