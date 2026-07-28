import { Check, Eye, EyeOff, KeyRound, Loader2, PlusCircle, X } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';
import Dialog from '../../../Common/Dialog';

interface SshCred {
  user: string;
  pass: string;
}

interface NodeCardSshFormProps {
  showSshForm: boolean;
  node: NodeInfo;
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

  return (
    <Dialog
      title={`Acceso a equipos — ${node.nombre_nodo}`}
      onClose={onCloseSshForm}
      panelClassName="modal-panel modal-panel-xl"
    >
      <div className="modal-header gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="modal-title truncate">Acceso a equipos — {node.nombre_nodo}</h3>
            <p className="modal-subtitle">Usuarios y contraseñas para acceder a los equipos de este sitio.</p>
          </div>
        </div>
        <button type="button" onClick={onCloseSshForm} aria-label="Cerrar" className="modal-close btn-ghost">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="modal-body space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Credenciales guardadas</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Se probarán en este orden cuando busques equipos.</p>
          </div>
          <button
            type="button"
            onClick={() => onSetShowPasswords(!showPasswords)}
            className="btn-outline btn-sm inline-flex min-h-11 shrink-0 items-center"
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">{showPasswords ? 'Ocultar claves' : 'Mostrar claves'}</span>
          </button>
        </div>

        <div className="space-y-3">
          {sshCredsArr.map((cred, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">Opción {i + 1}</span>
                {sshCredsArr.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveCred(i)}
                    aria-label={`Eliminar opción ${i + 1}`}
                    className="btn-ghost btn-icon min-h-11 min-w-11 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Usuario</span>
                  <input
                    type="text"
                    placeholder="Ej.: ubnt"
                    value={cred.user}
                    onChange={e => onUpdateCred(i, 'user', e.target.value)}
                    autoFocus={i === 0}
                    autoComplete="username"
                    className="input-field min-h-11 px-3 py-2.5"
                  />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Contraseña</span>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    placeholder="Ingresa la contraseña"
                    value={cred.pass}
                    onChange={e => onUpdateCred(i, 'pass', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onSaveSshCreds()}
                    autoComplete="current-password"
                    className="input-field min-h-11 px-3 py-2.5"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddCred}
          disabled={sshCredsArr.length >= 5}
          className="btn-outline btn-sm inline-flex min-h-11 items-center"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Agregar otra credencial ({sshCredsArr.length}/5)</span>
        </button>
      </div>

      <div className="modal-footer">
        <button type="button" onClick={onCloseSshForm} disabled={sshLoading} className="btn-outline btn-md min-h-11">
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSaveSshCreds}
          disabled={sshLoading}
          className="btn-primary btn-md inline-flex min-h-11 items-center"
        >
          {sshLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : sshSaved
              ? <Check className="h-4 w-4" />
              : <KeyRound className="h-4 w-4" />}
          <span>{sshLoading ? 'Guardando…' : sshSaved ? 'Cambios guardados' : 'Guardar cambios'}</span>
        </button>
      </div>
    </Dialog>
  );
}
