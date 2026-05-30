import { createPortal } from 'react-dom';
import type { ConfirmModalProps } from './types';
import CloseButton from './components/CloseButton';
import ModalBackdrop from './components/ModalBackdrop';
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

  return createPortal(
    <div className={confirmModalStyles.container}>
      <ModalBackdrop onClick={onCancel} />
      <div className={confirmModalStyles.modal}>
        <CloseButton onClick={onCancel} />
        <ModalHeader title={title} />
        <ModalContent message={message} />
        <ModalFooter confirmLabel={confirmLabel} onCancel={onCancel} onConfirm={onConfirm} />
      </div>
    </div>,
    document.body
  );
}
