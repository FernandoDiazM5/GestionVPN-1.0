import { useEffect, useState } from 'react';
import { AlertCircle, Database, History, Loader2, TerminalSquare } from 'lucide-react';
import type { M5FullInfoModalProps } from './types';
import { useCopiedIpState } from './hooks/useCopiedIpState';
import ModalHeader from './components/ModalHeader';
import ModalContent from './components/ModalContent';
import EmptyState from './components/EmptyState';
import SystemSection from './components/SystemSection';
import WirelessSection from './components/WirelessSection';
import InterfacesSection from './components/InterfacesSection';
import ServicesSection from './components/ServicesSection';
import DeviceOverview from './components/DeviceOverview';
import AirOsDeviceHistory from './components/AirOsDeviceHistory';
import TechnicalDataSection from './components/TechnicalDataSection';
import { detectFamily } from './utils/deviceFamily';
import { modalContainerStyles } from './utils/styles';
import Dialog from '../Dialog';

export default function M5FullInfoModal({ dev, onClose, onAnalyzeWithAi, loadStats }: M5FullInfoModalProps) {
  const [activeTab, setActiveTab] = useState<'data' | 'technical' | 'history'>('data');
  const [stats, setStats] = useState(dev.cachedStats);
  const [loadingStats, setLoadingStats] = useState(!dev.cachedStats && !!loadStats);
  const [statsError, setStatsError] = useState('');
  const { copiedIp, copyIp } = useCopiedIpState(dev.ip);
  const s = stats;
  const family = detectFamily(dev);

  useEffect(() => {
    if (dev.cachedStats) {
      setStats(dev.cachedStats);
      setLoadingStats(false);
      setStatsError('');
      return;
    }
    if (!loadStats || !('id' in dev)) return;

    let active = true;
    setLoadingStats(true);
    setStatsError('');
    void loadStats(dev)
      .then(freshStats => { if (active) setStats(freshStats); })
      .catch(cause => {
        if (active) setStatsError(cause instanceof Error ? cause.message : 'No se pudo consultar el equipo');
      })
      .finally(() => { if (active) setLoadingStats(false); });
    return () => { active = false; };
  }, [dev, loadStats]);

  const dataContent = loadingStats ? (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
      <span>Consultando datos actuales del equipo…</span>
    </div>
  ) : statsError ? (
    <div role="alert" className="mx-auto my-8 flex max-w-xl items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{statsError}</span>
    </div>
  ) : null;

  return (
    <Dialog
      title={`Información completa de ${dev.name || dev.ip}`}
      onClose={onClose}
      overlayClassName={modalContainerStyles.container}
      panelClassName={modalContainerStyles.modal}
    >
      <ModalHeader dev={dev} copiedIp={copiedIp} copyIp={copyIp} onClose={onClose} onAnalyzeWithAi={onAnalyzeWithAi} />
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 dark:border-slate-700 dark:bg-slate-900">
        <div role="tablist" aria-label="Secciones del informe AirOS" className="flex gap-1 overflow-x-auto">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'data'}
            onClick={() => setActiveTab('data')}
            className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-xs font-bold transition-colors ${activeTab === 'data' ? 'border-sky-500 text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Database className="h-4 w-4" /> Datos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'technical'}
            onClick={() => setActiveTab('technical')}
            className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-xs font-bold transition-colors ${activeTab === 'technical' ? 'border-slate-500 text-slate-700 dark:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <TerminalSquare className="h-4 w-4" /> Datos técnicos
          </button>
          {onAnalyzeWithAi && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-xs font-bold transition-colors ${activeTab === 'history' ? 'border-violet-500 text-violet-700 dark:text-violet-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <History className="h-4 w-4" /> Historial de resultados
            </button>
          )}
        </div>
      </div>
      {activeTab === 'data' ? (
        <ModalContent>
          {dataContent ?? (!s ? (
            <EmptyState />
          ) : (
            <>
              <DeviceOverview stats={s} />
              <SystemSection s={s} family={family} />
              <WirelessSection s={s} family={family} />
              <InterfacesSection s={s} />
              <ServicesSection s={s} />
            </>
          ))}
        </ModalContent>
      ) : activeTab === 'technical' ? (
        <ModalContent>{dataContent ?? (s ? <TechnicalDataSection stats={s} /> : <EmptyState />)}</ModalContent>
      ) : (
        <ModalContent><AirOsDeviceHistory device={dev} /></ModalContent>
      )}
    </Dialog>
  );
}
