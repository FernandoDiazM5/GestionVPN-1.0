import type { ReactNode } from 'react';
import { contentStyles } from '../utils/styles';

interface ModalContentProps {
  children: ReactNode;
}

export default function ModalContent({ children }: ModalContentProps) {
  return <div className={contentStyles.container}>{children}</div>;
}
