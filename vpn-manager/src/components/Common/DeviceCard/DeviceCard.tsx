import type { SavedDevice } from '../../../types/devices';
import DeviceHeader from './components/DeviceHeader';
import InfoStrip from './components/InfoStrip';
import LoadButton from './components/LoadButton';
import LoadingSection from './components/LoadingSection';
import ErrorSection from './components/ErrorSection';
import EmptyState from './components/EmptyState';
import AntennaSectionMain from './components/AntennaSectionMain';
import DeviceParams from './components/DeviceParams';
import WirelessParams from './components/WirelessParams';
import AcParams from './components/AcParams';
import AdvancedParams from './components/AdvancedParams';
import InterfacesSection from './components/InterfacesSection';
import StationsList from './components/StationsList';
import RawOutput from './components/RawOutput';
import { useAntennaData } from './hooks/useAntennaData';

interface DeviceCardProps {
  device: SavedDevice;
  onRemove?: () => void;
  onUpdate?: (updated: SavedDevice) => void;
  isPreview?: boolean;
  compact?: boolean;
}

export default function DeviceCard({ device, onRemove, onUpdate, isPreview, compact }: DeviceCardProps) {
  const { antennaStats, isLoadingAntenna, antennaError, handleLoadAntenna } = useAntennaData(device, isPreview, compact);

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col bg-white">
      <DeviceHeader device={device} antennaStats={antennaStats} onRemove={onRemove} isPreview={isPreview} />
      <InfoStrip device={device} antennaStats={antennaStats} />

      <div className="flex-1 bg-white dark:bg-slate-900 relative transition-colors">
        <LoadingSection isLoading={isLoadingAntenna} />
        <LoadButton isLoading={isLoadingAntenna} antennaStats={antennaStats} device={device} isPreview={isPreview} onLoad={handleLoadAntenna} />
        <ErrorSection error={antennaError} />

        {!antennaStats && !isLoadingAntenna && !antennaError && <EmptyState />}

        {antennaStats && !antennaStats.raw && (
          <div className="px-4 pb-5 space-y-4">
            <AntennaSectionMain antennaStats={antennaStats} />

            {!compact && (
              <>
                <DeviceParams antennaStats={antennaStats} />
                <WirelessParams antennaStats={antennaStats} />
                <AcParams antennaStats={antennaStats} />
                <AdvancedParams antennaStats={antennaStats} />
                <InterfacesSection antennaStats={antennaStats} />
                <StationsList antennaStats={antennaStats} />
              </>
            )}
          </div>
        )}

        <RawOutput antennaStats={antennaStats} />
      </div>
    </div>
  );
}
