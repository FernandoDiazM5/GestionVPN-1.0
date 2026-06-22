import { useState, useEffect } from 'react';
import { Trash2, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useVpn } from '../../../../context';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { ProvisionSteps } from '../components';
import type { NodeInfo } from '../../../../types/api';
import type { ProvisionResult } from '../types';

interface EliminarNodoProps {
  node: NodeInfo;
  onClose: () => void;
  onSuccess: (deletedDeviceIds: string[]) => void;
}

export default function EliminarNodo({ node, onClose, onSuccess }: EliminarNodoProps) {
  const { credentials } = useVpn();
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [deletedDeviceIds, setDeletedDeviceIds] = useState<string[]>([]);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [delStep, setDelStep] = useState(0);

  const ifaceName = node.nombre_vrf?.replace(/^VRF-/, 'VPN-SSTP-') ?? '';
  const lanSubnets = node.lan_subnets && node.lan_subnets.length > 0
    ? node.lan_subnets
    : node.segmento_lan ? node.segmento_lan.split(',').map(s => s.trim()) : [];

  const DEL_STEPS = [
    'Reglas Mangle (VRF)',
    'Sesión activa PPP / WG Peers',
    'PPP Secret / WG IP Address',
    'SSTP Interface / WG Interface',
    'Interface Lists (TOWERS + SSTP/WG)',
    'Rutas VRF (ida + vuelta MGMT)',
    'VRF',
    'SQLite (base de datos local)',
  ];

  useEffect(() => {
    if (!deleting) { setDelStep(0); return; }
    setDelStep(0);
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, DEL_STEPS.length - 1);
      setDelStep(i);
    }, 1400);
    return () => clearInterval(id);
  }, [deleting]);

  useEffect(() => {
    // Una respuesta de error (404/500) puede no traer `steps` (p.ej. AppError
    // "Nodo no encontrado en tu workspace"). En ese caso no animamos pasos: el
    // bloque de error ya muestra `result.message`. Sin esta guarda, leer
    // `result.steps.length` reventaba el modal con un TypeError.
    const steps = result?.steps;
    if (!steps || steps.length === 0) { setVisibleSteps(0); return; }
    let i = 0;
    const id = setInterval(() => { i++; setVisibleSteps(i); if (i >= steps.length) clearInterval(id); }, 300);
    return () => clearInterval(id);
  }, [result]);

  const handleDelete = async () => {
    if (!credentials || !node.ppp_user) return;
    setDeleting(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/deprovision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          vrfName: node.nombre_vrf, pppUser: node.ppp_user, lanSubnets, protocol: node.service,
        }),
      }, 60_000);
      const d = await r.json();
      setResult(d as ProvisionResult);
      if (d.deletedDeviceIds) setDeletedDeviceIds(d.deletedDeviceIds);
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Error', steps: [], failedAt: 0 });
    }
    setDeleting(false);
  };

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && !deleting && !result && onClose()}>
      <div className="modal-panel modal-panel-xl">

        <div className="modal-header-decorated modal-header-rose">
          <div className="flex items-center gap-3">
            <div className="modal-header-icon">
              <Trash2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Eliminar Nodo VPN</p>
              <p className="text-2xs text-rose-200 mt-0.5">Reverso completo del provisionamiento — 8 pasos</p>
            </div>
          </div>
          {!deleting && !result && (
            <button onClick={onClose} className="modal-header-close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {deleting && !result && (
            <div className="space-y-3">
              <p className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Eliminando configuración de MikroTik…</p>
              <div className="space-y-1.5">
                {DEL_STEPS.map((label, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border transition-colors
                    ${idx < delStep ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100' : idx === delStep ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0
                      ${idx < delStep ? 'bg-emerald-500 text-white' : idx === delStep ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}>
                      {idx < delStep ? '✓' : idx === delStep ? <Loader2 className="w-3 h-3 animate-spin" /> : idx + 1}
                    </span>
                    <span className={`font-semibold ${idx === delStep ? 'text-rose-700' : idx < delStep ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.success ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200'}`}>
                {result.success
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {result.success ? 'Nodo eliminado correctamente' : 'Error al eliminar'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{result.message}</p>
                </div>
              </div>
              <div>
                <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pasos ejecutados</p>
                <ProvisionSteps steps={result.steps ?? []} failedAt={result.failedAt} visible={visibleSteps} />
              </div>
              <button onClick={() => result.success ? onSuccess(deletedDeviceIds) : onClose()}
                className="btn-danger btn-md w-full">
                {result.success ? 'Listo' : 'Cerrar'}
              </button>
            </div>
          )}

          {!deleting && !result && (
            <div className="space-y-4">
              <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 rounded-xl p-4">
                <p className="text-sm font-bold text-rose-700 mb-1">¿Eliminar permanentemente?</p>
                <p className="text-xs text-rose-600">Se eliminarán todos los objetos de MikroTik asociados a este nodo. Esta acción no se puede deshacer.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Nodo', v: node.nombre_nodo },
                  { l: 'VRF', v: node.nombre_vrf },
                  { l: 'Interfaz', v: ifaceName },
                  { l: 'Usuario PPP', v: node.ppp_user },
                  { l: 'LAN(s)', v: node.segmento_lan || '—' },
                  { l: 'IP Túnel', v: node.ip_tunnel || '—' },
                ].map(row => (
                  <div key={row.l} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                    <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                    <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 truncate">{row.v}</p>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Confirmo que quiero eliminar este nodo y toda su configuración en MikroTik</span>
              </label>
            </div>
          )}
        </div>

        {!deleting && !result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={!confirmed}
              className="btn-danger btn-md flex items-center gap-2">
              <Trash2 className="w-4 h-4" /><span>Eliminar Nodo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
