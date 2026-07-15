import { useState } from 'react';
import { AlertCircle, Check, Loader2, Mail, Save, Send } from 'lucide-react';
import { API_BASE_URL } from '../../../../config';
import { apiFetch } from '../../../../utils/apiClient';

interface Props {
  email: string;
  onEmailChange: (email: string) => void;
}

type Action = 'save' | 'test' | null;

async function readResponse(response: Response, fallback: string) {
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || fallback);
  return data;
}

export function ErrorReportingSettings({ email, onEmailChange }: Props) {
  const [action, setAction] = useState<Action>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const normalized = email.trim().toLowerCase();

  const persist = async () => {
    const response = await apiFetch(`${API_BASE_URL}/api/settings/save`, {
      method: 'POST',
      body: JSON.stringify({ key: 'error_report_email', value: normalized }),
    });
    await readResponse(response, 'No se pudo guardar el correo');
    onEmailChange(normalized);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setAction('save'); setError(''); setSuccess('');
    try {
      await persist();
      setSuccess(normalized ? 'Destinatario actualizado' : 'Se usara el correo configurado en el servidor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el correo');
    } finally {
      setAction(null);
    }
  };

  const testDelivery = async () => {
    setAction('test'); setError(''); setSuccess('');
    try {
      await persist();
      const response = await apiFetch(`${API_BASE_URL}/api/settings/test-error-email`, { method: 'POST' });
      await readResponse(response, 'No se pudo enviar el correo de prueba');
      setSuccess('Correo de prueba enviado');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo enviar el correo de prueba');
    } finally {
      setAction(null);
    }
  };

  return (
    <section className="card border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
          <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Reportes tecnicos</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Destinatario de errores inesperados de la aplicacion</p>
        </div>
      </div>

      <form onSubmit={save} className="p-6 space-y-4">
        {success && (
          <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{success}</p>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="error-report-email" className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Correo de reportes
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              id="error-report-email"
              name="error_report_email"
              type="email"
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="input-field pl-10 h-11"
              placeholder="administrador@empresa.com"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Si queda vacio, se usa ERROR_REPORT_EMAIL o SMTP_USER del servidor.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={() => { void testDelivery(); }} disabled={action !== null}
            className="btn-ghost px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
            {action === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar prueba
          </button>
          <button type="submit" disabled={action !== null}
            className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
            {action === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar correo
          </button>
        </div>
      </form>
    </section>
  );
}
