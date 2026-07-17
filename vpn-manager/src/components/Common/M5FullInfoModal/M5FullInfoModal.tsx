import type { M5FullInfoModalProps } from './types';
import { useCopiedIpState } from './hooks/useCopiedIpState';
import ModalHeader from './components/ModalHeader';
import ModalContent from './components/ModalContent';
import EmptyState from './components/EmptyState';
import SystemSection from './components/SystemSection';
import WirelessSection from './components/WirelessSection';
import InterfacesSection from './components/InterfacesSection';
import ServicesSection from './components/ServicesSection';
import { detectFamily } from './utils/deviceFamily';
import { modalContainerStyles } from './utils/styles';
import Dialog from '../Dialog';

export default function M5FullInfoModal({ dev, onClose, onAnalyzeWithAi }: M5FullInfoModalProps) {
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
      <ModalContent>
        {!s ? (
          <EmptyState />
        ) : (
          <>
            <SystemSection s={s} family={family} />
            <WirelessSection s={s} family={family} />
            <InterfacesSection s={s} />
            <ServicesSection s={s} />
          </>
        )}
      </ModalContent>
    </Dialog>
  );
}
