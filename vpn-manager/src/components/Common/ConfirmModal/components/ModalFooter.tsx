import { CANCEL_LABEL, CONFIRM_LABEL_DEFAULT } from '../constants';
import { confirmModalStyles } from '../utils/styles';

interface ModalFooterProps {
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ModalFooter({ confirmLabel = CONFIRM_LABEL_DEFAULT, onCancel, onConfirm }: ModalFooterProps) {
  return (
    <div className={confirmModalStyles.footer}>
      <button onClick={onCancel} className={confirmModalStyles.cancelButton}>
        {CANCEL_LABEL}
      </button>
      <button onClick={onConfirm} className={confirmModalStyles.confirmButton}>
        {confirmLabel}
      </button>
    </div>
  );
}
