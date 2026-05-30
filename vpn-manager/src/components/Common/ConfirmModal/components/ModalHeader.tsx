import { AlertTriangle } from 'lucide-react';
import { confirmModalStyles } from '../utils/styles';

interface ModalHeaderProps {
  title: string;
}

export default function ModalHeader({ title }: ModalHeaderProps) {
  return (
    <div className={confirmModalStyles.headerContainer}>
      <div className={confirmModalStyles.iconWrapper}>
        <AlertTriangle className="w-5 h-5 text-rose-500" />
      </div>
      <h3 className={confirmModalStyles.headerTitle}>{title}</h3>
    </div>
  );
}
