import type { ConfirmModalProps } from './types';
import Dialog from '../Dialog';
import CloseButton from './components/CloseButton';
import ModalHeader from './components/ModalHeader';
import ModalContent from './components/ModalContent';
import ModalFooter from './components/ModalFooter';
import { confirmModalStyles } from './utils/styles';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      overlayClassName={confirmModalStyles.container}
      panelClassName={confirmModalStyles.modal}
    >
      <CloseButton onClick={onCancel} />
      <ModalHeader title={title} />
      <ModalContent message={message} />
      <ModalFooter confirmLabel={confirmLabel} onCancel={onCancel} onConfirm={onConfirm} />
    </Dialog>
  );
}
