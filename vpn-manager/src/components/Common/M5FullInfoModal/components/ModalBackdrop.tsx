interface ModalBackdropProps {
  onClick: (e: React.MouseEvent) => void;
}

export default function ModalBackdrop({ onClick }: ModalBackdropProps) {
  return <div className="fixed inset-0 -z-10" onClick={onClick} />;
}
