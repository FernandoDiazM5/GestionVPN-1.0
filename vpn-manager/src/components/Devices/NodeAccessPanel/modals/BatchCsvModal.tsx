import { useState } from 'react';
import { Download, Upload, X, Loader2, Plus } from 'lucide-react';
import { useVpn } from '../../../../context';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

interface BatchCsvModalProps {
  onClose: () => void;
  onSuccess: () => void;
  nodes: NodeInfo[];
}

export default function BatchCsvModal({ onClose, onSuccess, nodes }: BatchCsvModalProps) {
  const { credentials } = useVpn();
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<{ nombre: string; usuario: string; pass: string; subnets: string[]; valid: boolean }[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{ row: number; nombre: string; status: 'pending' | 'processing' | 'ok' | 'error'; message?: string }[]>([]);
  const [done, setDone] = useState(false);

  const handleExport = () => {
    const header = 'nombre_nodo,ppp_user,vrf,red_lan,ip_tunel,estado';
    const csvRows = nodes.map(n => [
      n.nombre_nodo,
      n.ppp_user,
      n.nombre_vrf || '',
      (n.lan_subnets && n.lan_subnets.length > 0 ? n.lan_subnets.join(';') : n.segmento_lan) || '',
      n.ip_tunnel || '',
      n.disabled ? 'deshabilitado' : n.running ? 'conectado' : 'desconectado',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nodos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const parseRows = (text: string) => {
    const parsed = text.split('\n').map(line => line.trim()).filter(l => l && !l.startsWith('#')).map(line => {
      const parts = line.split(',').map(p => p.trim());
      const nombre = parts[0] || '';
      const usuario = parts[1] || '';
      const pass = parts[2] || '';
      const subnets = parts.slice(3).filter(s => /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(s));
      const valid = !!(nombre && usuario && pass && subnets.length > 0);
      return { nombre, usuario, pass, subnets, valid };
    });
    setRows(parsed);
  };

  const handleProvision = async () => {
    if (!credentials) return;
    const validRows = rows.filter(r => r.valid);
    setProcessing(true);
    setResults(validRows.map((r, i) => ({ row: i, nombre: r.nombre, status: 'pending' })));
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r));
      try {
        const nextRes = await apiFetch(`${API_BASE_URL}/api/node/next`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
        }).then(r => r.json());
        if (!nextRes.success) throw new Error(nextRes.message || 'Error obteniendo número de nodo');
        const nameClean = row.nombre.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const provRes = await apiFetch(`${API_BASE_URL}/api/node/provision`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: credentials.ip, user: credentials.user, pass: credentials.pass,
            nodeNumber: nextRes.nextNode, nodeName: nameClean,
            pppUser: row.usuario, pppPassword: row.pass,
            lanSubnets: row.subnets, remoteAddress: nextRes.nextRemote,
          }),
        }).then(r => r.json());
        if (provRes.success) {
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'ok', message: provRes.message } : r));
          apiFetch(`${API_BASE_URL}/api/node/creds/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pppUser: row.usuario, pppPassword: row.pass }),
          }).catch(() => { });
        } else {
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', message: provRes.message } : r));
        }
      } catch (e) {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', message: e instanceof Error ? e.message : 'Error' } : r));
      }
    }
    setProcessing(false);
    setDone(true);
  };

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && !processing && onClose()}>
      <div className="modal-panel modal-panel-2xl">
        <div className="modal-header-decorated modal-header-violet">
          <div className="flex items-center gap-3">
            <div className="modal-header-icon">
              <Download className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">CSV — Nodos</p>
              <p className="text-2xs text-violet-200">Importar para provisionar · Exportar inventario actual</p>
            </div>
          </div>
          {!processing && <button onClick={onClose} className="modal-header-close"><X className="w-4 h-4" /></button>}
        </div>

        <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
          {(['import', 'export'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors
                ${tab === t ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'text-slate-400 hover:text-slate-600 dark:text-slate-300'}`}>
              {t === 'import' ? 'Importar / Provisionar' : `Exportar (${nodes.length} nodos)`}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {tab === 'export' && (
            <div className="space-y-4">
              <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-100 rounded-xl p-3">
                <p className="text-2xs font-bold text-violet-600 uppercase tracking-wider mb-1">Columnas exportadas</p>
                <p className="text-2xs text-slate-500 dark:text-slate-400 font-mono">nombre_nodo, ppp_user, vrf, red_lan, ip_tunel, estado</p>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {nodes.map(n => (
                  <div key={n.ppp_user} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${n.running ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{n.nombre_nodo}</span>
                    <span className="text-slate-400 font-mono truncate flex-1">{n.ppp_user}</span>
                    <span className="text-sky-600 font-mono">{(n.lan_subnets?.[0] || n.segmento_lan) || '—'}</span>
                  </div>
                ))}
                {nodes.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Sin nodos cargados</p>}
              </div>
              <button onClick={handleExport} disabled={nodes.length === 0}
                className="btn-accent btn-md w-full flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /><span>Descargar CSV ({nodes.length} nodos)</span>
              </button>
            </div>
          )}
          {tab === 'import' && !processing && !done && (
            <>
              <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-100 rounded-xl p-3">
                <p className="text-2xs font-bold text-violet-600 uppercase tracking-wider mb-1">Ejemplo de formato CSV</p>
                <pre className="text-2xs text-slate-600 dark:text-slate-300 font-mono">ROSMERY,TorreRosmery,Pass123,10.3.0.0/24{'\n'}FIWIS,TorreFiwis,Pass456,10.4.0.0/24,10.5.0.0/24</pre>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 cursor-pointer transition-colors text-sm text-violet-600 font-medium flex-1 justify-center">
                  <Upload className="w-4 h-4" />
                  <span>Subir archivo CSV</span>
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const text = (ev.target?.result as string) ?? '';
                      setCsvText(text);
                      parseRows(text);
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }} />
                </label>
              </div>
              <textarea value={csvText} onChange={e => { setCsvText(e.target.value); parseRows(e.target.value); }}
                placeholder="…o pega aquí el contenido CSV" rows={5}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 font-mono resize-none" />
              {rows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">{rows.filter(r => r.valid).length}/{rows.length} filas válidas</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {rows.map((r, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${r.valid ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-100'}`}>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${r.valid ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                          {r.valid ? '✓' : '✗'}
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{r.nombre || '(sin nombre)'}</span>
                        <span className="text-slate-400">{r.usuario}</span>
                        <span className="text-sky-600 font-mono">{r.subnets.join(', ') || '(sin subred)'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'import' && (processing || done) && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Progreso de provisionamiento</p>
              {results.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs
                  ${r.status === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100' : r.status === 'error' ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-100' : r.status === 'processing' ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0
                    ${r.status === 'ok' ? 'bg-emerald-500 text-white' : r.status === 'error' ? 'bg-rose-500 text-white' : r.status === 'processing' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}>
                    {r.status === 'ok' ? '✓' : r.status === 'error' ? '✗' : r.status === 'processing' ? <Loader2 className="w-3 h-3 animate-spin" /> : i + 1}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{r.nombre}</span>
                  {r.message && <span className="text-slate-400 text-2xs truncate">{r.message}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
          {tab === 'export' ? (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cerrar</button>
          ) : !done ? (
            <>
              <button onClick={onClose} disabled={processing} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">Cancelar</button>
              <button onClick={handleProvision} disabled={rows.filter(r => r.valid).length === 0 || processing}
                className="btn-accent btn-md flex items-center gap-2">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{processing ? 'Provisionando...' : `Provisionar ${rows.filter(r => r.valid).length} nodos`}</span>
              </button>
            </>
          ) : (
            <button onClick={() => { onSuccess(); onClose(); }}
              className="btn-accent btn-md">
              Listo — Actualizar tabla
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
