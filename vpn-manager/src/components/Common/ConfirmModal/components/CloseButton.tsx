import { X } from 'lucide-react';
import { confirmModalStyles } from '../utils/styles';

interface CloseButtonProps {
  onClick: () => void;
}

export default function CloseButton({ onClick }: CloseButtonProps) {
  return (
    <button onClick={onClick} className={confirmModalStyles.closeButton}>
      <X className="w-4 h-4" />
    </button>
  );
}
