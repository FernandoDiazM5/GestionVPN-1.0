import { X, type LucideIcon } from 'lucide-react';

interface SiteModalHeaderProps {
  icon: LucideIcon;
  title: string;
  siteName: string;
  description?: string;
  onClose?: () => void;
}

export default function SiteModalHeader({
  icon: Icon,
  title,
  siteName,
  description,
  onClose,
}: SiteModalHeaderProps) {
  return (
    <div className="modal-header-decorated modal-header-indigo">
      <div className="flex min-w-0 items-center gap-3">
        <div className="modal-header-icon">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <p className="mt-0.5 truncate text-xs text-indigo-100">
            {siteName}{description ? ` · ${description}` : ''}
          </p>
        </div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="modal-header-close min-h-11 min-w-11" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
