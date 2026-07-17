import { useState } from 'react';
import { Database, History } from 'lucide-react';
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
import { detectFamily } from './utils/deviceFamily';
import { modalContainerStyles } from './utils/styles';
import Dialog from '../Dialog';

export default function M5FullInfoModal({ dev, onClose, onAnalyzeWithAi }: M5FullInfoModalProps) {
  const [activeTab, setActiveTab] = useState<'data' | 'history'>('data');
  const { copiedIp, copyIp } = useCopiedIpState(dev.ip);
  const s = dev.cachedStats;
  const family = detectFamily(dev);

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
          {!s ? (
            <EmptyState />
          ) : (
            <>
              <DeviceOverview stats={s} />
              <SystemSection s={s} family={family} />
              <WirelessSection s={s} family={family} />
              <InterfacesSection s={s} />
              <ServicesSection s={s} />
            </>
          )}
        </ModalContent>
      ) : (
        <ModalContent><AirOsDeviceHistory device={dev} /></ModalContent>
      )}
    </Dialog>
  );
}
