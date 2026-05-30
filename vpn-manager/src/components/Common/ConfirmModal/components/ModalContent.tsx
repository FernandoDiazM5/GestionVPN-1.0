import { confirmModalStyles } from '../utils/styles';

interface ModalContentProps {
  message: string;
}

export default function ModalContent({ message }: ModalContentProps) {
  return <p className={confirmModalStyles.content}>{message}</p>;
}
