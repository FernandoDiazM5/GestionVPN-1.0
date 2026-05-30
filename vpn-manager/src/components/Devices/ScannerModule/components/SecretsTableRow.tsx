import { CheckCircle2, PlusCircle, ShieldOff, ShieldCheck } from 'lucide-react';
import type { VpnSecret } from '../types';

interface SecretsTableRowProps {
  secret: VpnSecret;
  isManaged: boolean;
  onToggleManage: (secret: VpnSecret) => void;
}

export default function SecretsTableRow({
  secret,
  isManaged,
  onToggleManage,
}: SecretsTableRowProps) {
  return (
    <tr className="hover:bg-indigo-50/40 transition-colors group">
      <td className="px-5 py-3.5 text-center">
        {secret.disabled ? (
          <ShieldOff className="w-4 h-4 text-rose-400 mx-auto" aria-label="Deshabilitado" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-emerald-500 mx-auto" aria-label="Habilitado" />
        )}
      </td>
      <td className="px-5 py-3.5">
        <span className="font-mono text-sm font-semibold text-slate-700">{secret.name}</span>
      </td>
      <td className="px-5 py-3.5">
        <span
          className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider
                        ${secret.service === 'sstp'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-violet-100 text-violet-700'}`}
        >
          {secret.service}
        </span>
      </td>
      <td className="px-5 py-3.5 hidden sm:table-cell">
        <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded-lg">
          {secret.profile}
        </span>
      </td>
      <td className="px-5 py-3.5 text-center">
        <button
          onClick={() => onToggleManage(secret)}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${isManaged
            ? 'bg-emerald-100 text-emerald-700 hover:bg-rose-100 hover:text-rose-600'
            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'}`}
          title={isManaged ? 'Quitar de gestión' : 'Añadir a gestión'}
        >
          {isManaged ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Gestionado</span>
            </>
          ) : (
            <>
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Gestionar</span>
            </>
          )}
        </button>
      </td>
    </tr>
  );
}
