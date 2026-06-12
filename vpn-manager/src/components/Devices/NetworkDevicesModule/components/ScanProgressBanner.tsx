// ============================================================
//  ScanProgressBanner — barra de progreso + estado del scan
//
//  Muestra una de tres fases (descubriendo / autenticando / done)
//  con la barra animada acorde. Incluye los banners de info/error
//  y el caso "se escanearon X IPs pero ninguna era Ubiquiti".
// ============================================================

import { memo, useMemo } from 'react';
import { CheckCircle2, Loader2, Info, AlertCircle } from 'lucide-react';
import type { ScanState } from '../types';
import { estimateIpCount } from '../constants';

interface ScanProgressBannerProps {
  scanState: ScanState;
  discoveryProgress: number;
  effectiveLan: string;
  debugMsg: string;
  scanError: string;
  scannedCount: number;
  scanResultsCount: number;
}

function ScanProgressBannerImpl({
  scanState, discoveryProgress, effectiveLan, debugMsg, scanError,
  scannedCount, scanResultsCount,
}: ScanProgressBannerProps) {
  const isScanning = scanState.phase === 'discovering' || scanState.phase === 'authenticating';
  // Antes se llamaba 4 veces por render (denominador de progreso + label + 2
  // veces en barra/header). El CIDR es estable mientras dure un escaneo,
  // así que un useMemo con `effectiveLan` como dep es suficiente.
  const totalIps = useMemo(() => estimateIpCount(effectiveLan), [effectiveLan]);

  return (
    <>
      {scanState.phase !== 'idle' && (
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
          <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 uppercase tracking-widest">
            <span className="flex items-center space-x-2">
              {scanState.phase === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Loader2 className="w-4 h-4 motion-safe:animate-spin text-indigo-500" />
              )}
              <span>
                {scanState.phase === 'discovering' ? 'Buscando dispositivos en la red...' :
                  scanState.phase === 'authenticating' ? 'Probando accesos SSH y extrayendo datos...' :
                    'Escaneo finalizado exitosamente'}
              </span>
            </span>
            {scanState.phase === 'discovering' && (
              <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                {discoveryProgress} / {totalIps} IPs
              </span>
            )}
            {scanState.phase === 'authenticating' && (
              <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                {scanState.current} / {scanState.total} dispositivos
              </span>
            )}
          </div>

          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative">
            {scanState.phase === 'discovering' && (
              <div
                className="h-full transition-all duration-150 ease-out bg-indigo-500"
                style={{ width: `${(discoveryProgress / Math.max(1, totalIps)) * 100}%` }}
              />
            )}
            {scanState.phase === 'authenticating' && (
              <div
                className="h-full transition-all duration-300 ease-out shadow-sm bg-indigo-500"
                style={{ width: `${(scanState.current / Math.max(1, scanState.total)) * 100}%` }}
              />
            )}
            {scanState.phase === 'done' && (
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: '100%' }} />
            )}
          </div>
        </div>
      )}

      {debugMsg && !scanError && (
        <div className="flex items-start space-x-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
          <span>{debugMsg}</span>
        </div>
      )}

      {scanError && (
        <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 rounded-xl">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-600 dark:text-rose-300">{scanError}</p>
        </div>
      )}

      {!isScanning && scannedCount > 0 && scanResultsCount === 0 && !scanError && (
        <div className="p-3 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 rounded-xl space-y-1.5">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Se escanearon {scannedCount} IPs en {effectiveLan} pero ninguna respondió como Ubiquiti airOS
          </p>
          <p className="text-2xs text-amber-500 dark:text-amber-300/80">
            Verifica que el túnel VRF esté activo en la pestaña "Nodos" y que los equipos tengan HTTP habilitado en puerto 80
          </p>
        </div>
      )}
    </>
  );
}

export const ScanProgressBanner = memo(ScanProgressBannerImpl);
