import { confirmModalStyles } from '../utils/styles';

interface ModalBackdropProps {
  onClick: () => void;
}

export default function ModalBackdrop({ onClick }: ModalBackdropProps) {
  return <div className={confirmModalStyles.backdrop} onClick={onClick} />;
}
