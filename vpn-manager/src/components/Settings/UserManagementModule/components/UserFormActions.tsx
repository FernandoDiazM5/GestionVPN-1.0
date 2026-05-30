import { Save, Loader2 } from 'lucide-react';
import { BUTTON_LABELS } from '../constants';

interface UserFormActionsProps {
  isEdit: boolean;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export function UserFormActions({ isEdit, isLoading, onSubmit }: UserFormActionsProps) {
  return (
    <div className="pt-4 border-t flex justify-end">
      <button type="submit" disabled={isLoading} className="btn-primary" onClick={(e) => onSubmit(e as any)}>
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        <span>{isEdit ? BUTTON_LABELS.UPDATE : BUTTON_LABELS.CREATE}</span>
      </button>
    </div>
  );
}
