import { Eye, EyeOff, X, PlusCircle, KeyRound, Check, Loader2 } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';

interface SshCred {
  user: string;
  pass: string;
}

interface NodeCardSshFormProps {
  showSshForm: boolean;
  node: NodeInfo;
  rowIndex: number;
  isPending: boolean;
  isThisNodeActive: boolean;
  sshCredsArr: SshCred[];
  showPasswords: boolean;
  sshLoading: boolean;
  sshSaved: boolean;
  onSetShowPasswords: (value: boolean) => void;
  onCloseSshForm: () => void;
  onUpdateCred: (i: number, field: 'user' | 'pass', value: string) => void;
  onRemoveCred: (i: number) => void;
  onAddCred: () => void;
  onSaveSshCreds: () => void;
}

export function NodeCardSshForm({
  showSshForm,
  node,
  rowIndex,
  isPending,
  isThisNodeActive,
  sshCredsArr,
  showPasswords,
  sshLoading,
  sshSaved,
  onSetShowPasswords,
  onCloseSshForm,
  onUpdateCred,
  onRemoveCred,
  onAddCred,
  onSaveSshCreds,
}: NodeCardSshFormProps) {
  if (!showSshForm) return null;

  const rowBg = isThisNodeActive
    ? 'bg-emerald-50/60 dark:bg-emerald-500/10'
    : isPending
      ? 'bg-indigo-50/60 dark:bg-indigo-500/10'
      : rowIndex % 2 === 0
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50/40 dark:bg-slate-800/40';

  return (
    <tr className={rowBg}>
      <td colSpan={7} className="px-4 pb-3 pt-0">
        <div className="ml-10 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" />
              Credenciales SSH — {node.nombre_nodo}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => onSetShowPasswords(!showPasswords)} title={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                className="p-1 text-slate-400 hover:text-amber-600 rounded transition-colors">
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button onClick={onCloseSshForm} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {sshCredsArr.map((cred, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-black text-amber-400 w-4 text-center shrink-0">{i + 1}º</span>
                <input
                  type="text"
                  placeholder="Usuario (ej: ubnt)"
                  value={cred.user}
                  onChange={e => onUpdateCred(i, 'user', e.target.value)}
                  className="px-3 py-1.5 text-xs border border-amber-200 bg-white rounded-lg outline-none focus:border-amber-400 font-semibold text-slate-700 w-32 flex-1 dark:bg-slate-800 dark:border-amber-500/40 dark:text-slate-100"
                />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={cred.pass}
                  onChange={e => onUpdateCred(i, 'pass', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onSaveSshCreds()}
                  className="px-3 py-1.5 text-xs border border-amber-200 bg-white rounded-lg outline-none focus:border-amber-400 font-mono text-slate-700 w-36 flex-1 dark:bg-slate-800 dark:border-amber-500/40 dark:text-slate-100"
                />
                {sshCredsArr.length > 1 && (
                  <button onClick={() => onRemoveCred(i)} className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onAddCred}
              disabled={sshCredsArr.length >= 5}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-800 disabled:opacity-40 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Añadir ({sshCredsArr.length}/5)</span>
            </button>
            <button
              onClick={onSaveSshCreds}
              disabled={sshLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 ml-auto"
            >
              {sshLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : sshSaved ? <Check className="w-3 h-3" /> : <KeyRound className="w-3 h-3" />}
              {sshSaved ? 'Guardado' : 'Guardar'}
            </button>
          </div>

          <p className="text-[10px] text-amber-500">
            Se probarán en orden al escanear equipos en este nodo.
          </p>
        </div>
      </td>
    </tr>
  );
}
