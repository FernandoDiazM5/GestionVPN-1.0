import type { ReactNode } from 'react';
import Dialog from '../Dialog';

interface DrawerProps {
  children: ReactNode;
  title: string;
  onClose: () => void;
  panelClassName?: string;
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

export default function Drawer({
  children,
  title,
  onClose,
  panelClassName = 'relative w-64 h-full anim-drawer-left',
  overlayClassName = 'fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-sm anim-fade-in',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: DrawerProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      panelAs="aside"
      panelClassName={panelClassName}
      overlayClassName={overlayClassName}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
    >
      {children}
    </Dialog>
  );
}
