// ============================================================
//  ScanControls — selector de subred + botón "Escanear"
//
//  Si hay túnel activo (activeNode), muestra la torre y un select
//  de subredes disponibles del nodo (autocompletadas). Sin túnel,
//  permite ingresar CIDR manual. También muestra el estado de
//  credenciales SSH del nodo (para que el operador sepa si hay
//  con qué autenticar).
// ============================================================

import { memo } from 'react';
import { Radio, AlertCircle, KeyRound, RefreshCw, Loader2 } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';
import type { ScanCred } from '../types';
import { estimateIpCount } from '../constants';

interface ScanControlsProps {
  isTunnelActive: boolean;
  activeNode: NodeInfo | null;
  availableSubnets: string[];
  manualLan: string;
  setManualLan: (s: string) => void;
  nodeSshCreds: ScanCred[];
  effectiveLan: string;
  canScan: boolean;
  isScanning: boolean;
  onScan: () => void;
}

function ScanControlsImpl({
  isTunnelActive, activeNode, availableSubnets, manualLan, setManualLan,
  nodeSshCreds, effectiveLan, canScan, isScanning, onScan,
}: ScanControlsProps) {
  return (
    <>
      {isTunnelActive && activeNode ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 rounded-xl">
            <Radio className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{activeNode.nombre_nodo}</p>
              <p className="text-2xs font-mono text-slate-400 dark:text-slate-500 truncate">{activeNode.nombre_vrf}</p>
            </div>
          </div>

          <div>
            <label className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
              Subred LAN a escanear
              {availableSubnets.length > 1 && (
                <span className="ml-1.5 normal-case font-normal text-slate-300">({availableSubnets.length} disponibles)</span>
              )}
            </label>
            {availableSubnets.length > 1 ? (
              <select
                value={manualLan}
                onChange={e => setManualLan(e.target.value)}
                className="input-field w-full text-sm font-mono"
              >
                {availableSubnets.map((s, idx) => (
                  <option key={`${s}-${idx}`} value={s}>{s} ({estimateIpCount(s)} hosts)</option>
                ))}
              </select>
            ) : availableSubnets.length === 1 ? (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl">
                <span className="font-mono text-sm font-bold text-sky-600 dark:text-sky-400">{availableSubnets[0]}</span>
                <span className="text-2xs text-slate-400 dark:text-slate-500 ml-1">· {estimateIpCount(availableSubnets[0])} hosts</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-600">No hay subredes configuradas en este nodo</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <label className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
            Subred LAN (CIDR) — manual
          </label>
          <input
            value={manualLan}
            onChange={e => setManualLan(e.target.value)}
            placeholder="ej: 10.5.5.0/24"
            className="input-field w-full text-sm font-mono"
          />
          <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1">Activa un túnel en la pestaña Nodos para autocompletar la subred.</p>
        </div>
      )}

      {isTunnelActive && activeNode && (
        <div className="border-t border-slate-100 pt-3 mt-1 flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${nodeSshCreds.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            {nodeSshCreds.length > 0
              ? <span>SSH: <strong>{nodeSshCreds.map(c => c.user).join(', ')}</strong> · {nodeSshCreds.length} credencial{nodeSshCreds.length > 1 ? 'es' : ''}</span>
              : <span>Sin credenciales SSH — configúralas en el nodo (ícono <KeyRound className="w-3 h-3 inline" />)</span>
            }
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={onScan} disabled={!canScan}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
            ${canScan
              ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>{isScanning ? `Escaneando ${effectiveLan}...` : 'Escanear dispositivos'}</span>
        </button>
      </div>
    </>
  );
}

export const ScanControls = memo(ScanControlsImpl);
