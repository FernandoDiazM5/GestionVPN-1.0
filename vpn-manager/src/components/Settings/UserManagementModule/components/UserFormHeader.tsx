import { ArrowLeft } from 'lucide-react';
import { HEADERS } from '../constants';

interface UserFormHeaderProps {
  isEdit: boolean;
  onBack: () => void;
}

export function UserFormHeader({ isEdit, onBack }: UserFormHeaderProps) {
  return (
    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? HEADERS.FORM_EDIT_TITLE : HEADERS.FORM_CREATE_TITLE}
          </h2>
          <p className="text-sm text-slate-500 font-medium">{HEADERS.FORM_SUBTITLE}</p>
        </div>
      </div>
    </div>
  );
}
