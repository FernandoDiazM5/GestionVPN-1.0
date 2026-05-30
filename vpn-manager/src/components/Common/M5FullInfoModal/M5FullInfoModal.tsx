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

export default function M5FullInfoModal({ dev, onClose }: M5FullInfoModalProps) {
  const { copiedIp, copyIp } = useCopiedIpState(dev.ip);
  const s = dev.cachedStats;
  const family = detectFamily(dev);

  return (
    <div
      className={modalContainerStyles.container}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={modalContainerStyles.modal}>
        <ModalHeader dev={dev} copiedIp={copiedIp} copyIp={copyIp} onClose={onClose} />
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
      </div>
    </div>
  );
}
