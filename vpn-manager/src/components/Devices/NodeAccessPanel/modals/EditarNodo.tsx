import { useState, useEffect } from 'react';
import {
  Pencil, X, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  RefreshCw, Copy, Check, Plus, Minus, ShieldCheck,
} from 'lucide-react';
import { useVpn } from '../../../../context';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { generateSecurePassword, getSubnetConflicts } from '../utils';
import { ProvisionSteps } from '../components';
import type { NodeInfo } from '../../../../types/api';
import type { ProvisionResult } from '../types';

interface EditarNodoProps {
  node: NodeInfo;
  onClose: () => void;
  onSuccess: (newLabel?: string) => void;
}

export default function EditarNodo({ node, onClose, onSuccess }: EditarNodoProps) {
  const { credentials } = useVpn();
  const isWg = node.service === 'wireguard';
  const [currentSubnets, setCurrentSubnets] = useState<string[]>([]);
  const [currentRemoteIP, setCurrentRemoteIP] = useState('');
  const [loadingDetails, setLoadingDetails] = useState(true);

  const [newLabel, setNewLabel] = useState(node.nombre_nodo || '');
  const [newPppUser, setNewPppUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loadedPass, setLoadedPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [newRemote, setNewRemote] = useState('');
  const [addSubnets, setAddSubnets] = useState<string[]>(['']);
  const [removeSet, setRemoveSet] = useState<Set<string>>(new Set());
  const [copiedEditField, setCopiedEditField] = useState<string | null>(null);
  const [savingPassDb, setSavingPassDb] = useState(false);
  const [passDbSaved, setPassDbSaved] = useState(false);

  const copyEditField = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedEditField(key);
      setTimeout(() => setCopiedEditField(null), 2000);
    });
  };

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);

  const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
  const validAdd = addSubnets.filter(s => CIDR_RE.test(s.trim()));
  const addSubnetConflicts = getSubnetConflicts(validAdd);

  useEffect(() => {
    if (!credentials) return;
    setLoadingDetails(true);
    const pppUser = node.ppp_user;
    (async () => {
      const [detailsRes, credsRes] = await Promise.allSettled([
        fetchWithTimeout(`${API_BASE_URL}/api/node/details`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: credentials.ip, user: credentials.user, pass: credentials.pass,
            vrfName: node.nombre_vrf || '', pppUser,
          }),
        }, 15_000).then(r => r.json()),

        fetchWithTimeout(`${API_BASE_URL}/api/node/creds/get`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser }),
        }, 5_000).then(r => r.json()),
      ]);

      const details = detailsRes.status === 'fulfilled' ? detailsRes.value : null;
      const mikrotikPass: string = (details?.success && details?.pppPassword) ? details.pppPassword : '';
      if (details?.success) {
        setCurrentSubnets(details.lanSubnets || []);
        setCurrentRemoteIP(details.remoteAddress || '');
        setNewPppUser(details.currentPppUser || pppUser);
        setNewRemote(details.remoteAddress || '');
      }

      const creds = credsRes.status === 'fulfilled' ? credsRes.value : null;
      const dbPass: string = (creds?.success && creds?.pppPassword) ? creds.pppPassword : '';

      if (dbPass) {
        setLoadedPass(dbPass);
        setNewPass(dbPass);
      } else if (mikrotikPass && mikrotikPass !== '********') {
        setNewPass(mikrotikPass);
        try {
          const saveRes = await fetchWithTimeout(`${API_BASE_URL}/api/node/creds/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pppUser, pppPassword: mikrotikPass }),
          }, 5_000).then(r => r.json());
          if (saveRes.success) {
            setLoadedPass(mikrotikPass);
          }
        } catch { }
      }

      setLoadingDetails(false);
    })();
  }, [credentials, node.nombre_vrf, node.ppp_user]);

  useEffect(() => {
    if (!result) { setVisibleSteps(0); return; }
    let i = 0;
    const id = setInterval(() => { i++; setVisibleSteps(i); if (i >= result.steps.length) clearInterval(id); }, 350);
    return () => clearInterval(id);
  }, [result]);

  const toggleRemove = (s: string) =>
    setRemoveSet(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const labelChanged = newLabel.trim() !== (node.nombre_nodo || '').trim();
  const pppUserChanged = newPppUser.trim() && newPppUser.trim() !== (node.ppp_user || '');
  const remoteChanged = newRemote.trim() && IPV4_RE.test(newRemote.trim()) && newRemote.trim() !== currentRemoteIP;
  const passChanged = newPass.trim() !== '' && newPass.trim() !== loadedPass;
  const hasChanges = (passChanged || labelChanged || pppUserChanged || remoteChanged || validAdd.length > 0 || removeSet.size > 0) && addSubnetConflicts.length === 0;

  const handleSavePassToDb = async () => {
    if (!newPass.trim() || savingPassDb) return;
    setSavingPassDb(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/creds/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, pppPassword: newPass.trim() }),
      }, 5_000);
      const d = await r.json();
      if (d.success) {
        setLoadedPass(newPass.trim());
        setPassDbSaved(true);
        setTimeout(() => setPassDbSaved(false), 3000);
      }
    } catch { }
    setSavingPassDb(false);
  };

  const handleSave = async () => {
    if (!credentials || !node.ppp_user || !hasChanges) return;
    setSaving(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          pppUser: node.ppp_user, vrfName: node.nombre_vrf || '',
          newComment: labelChanged ? newLabel.trim() : undefined,
          newPppUser: pppUserChanged ? newPppUser.trim() : undefined,
          newPassword: passChanged ? newPass.trim() : undefined,
          newRemoteAddress: remoteChanged ? newRemote.trim() : undefined,
          addSubnets: validAdd,
          removeSubnets: Array.from(removeSet),
        }),
      }, 45_000);
      const d: ProvisionResult = await r.json();
      if (d.success && passChanged) {
        fetchWithTimeout(`${API_BASE_URL}/api/node/creds/save`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: node.ppp_user, pppPassword: newPass.trim() }),
        }, 5_000).catch(() => { });
      }
      setResult(d);
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Error', steps: [], failedAt: 0 });
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && !saving && !result && onClose()}>
      <div className="modal-panel modal-panel-xl">

        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Pencil className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Editar Nodo — {node.nombre_nodo}</p>
              <p className="text-2xs text-indigo-200 mt-0.5">{node.nombre_vrf}</p>
            </div>
          </div>
          {!saving && !result && (
            <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.success ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200'}`}>
                {result.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {result.success ? 'Nodo actualizado' : 'Error al actualizar'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{result.message}</p>
                </div>
              </div>
              <ProvisionSteps steps={result.steps ?? []} failedAt={result.failedAt} visible={visibleSteps} />
              <button onClick={() => result.success ? onSuccess(labelChanged ? newLabel.trim() : undefined) : onClose()}
                className="btn-primary btn-md w-full">
                {result.success ? 'Listo' : 'Cerrar'}
              </button>
            </div>
          )}

          {!saving && !result && (
            <>
              {loadingDetails && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Cargando datos actuales del router…</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Nodo', v: node.nombre_nodo },
                  { l: 'VRF', v: node.nombre_vrf || '—' },
                  { l: isWg ? 'Interfaz WG' : 'Interfaz SSTP', v: node.nombre_vrf?.replace(/^VRF-/, isWg ? 'VPN-WG-' : 'VPN-SSTP-') || '—' },
                  { l: 'IP Túnel actual', v: currentRemoteIP || node.ip_tunnel || '—' },
                ].map(row => (
                  <div key={row.l} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                    <p className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 truncate">{row.v}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Campos editables</p>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nombre / Etiqueta del nodo</label>
                  <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                    placeholder={node.nombre_nodo || ''}
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300
                      ${labelChanged ? 'border-amber-300 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700'}`} />
                  {labelChanged && <p className="text-2xs text-amber-600 mt-0.5">Cambiará de <span className="font-mono font-bold">{node.nombre_nodo}</span> a <span className="font-mono font-bold">{newLabel}</span></p>}
                </div>

                {!isWg && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Usuario PPP</label>
                    <input value={newPppUser} onChange={e => setNewPppUser(e.target.value)}
                      placeholder={node.ppp_user || ''}
                      autoComplete="off"
                      className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300
                      ${pppUserChanged ? 'border-amber-300 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700'}`} />
                    {pppUserChanged && <p className="text-2xs text-amber-600 mt-0.5">Cambiará de <span className="font-mono font-bold">{node.ppp_user}</span> a <span className="font-mono font-bold">{newPppUser}</span></p>}
                  </div>
                )}

                {!isWg && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Contraseña PPP</label>
                      {passChanged && (
                        <span className="text-2xs text-amber-600 font-medium">Se actualizará en MikroTik al guardar</span>
                      )}
                    </div>
                    <input type="text" style={{ display: 'none' }} aria-hidden="true" readOnly tabIndex={-1} />
                    <input type="password" style={{ display: 'none' }} aria-hidden="true" readOnly tabIndex={-1} />
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} value={newPass}
                        onChange={e => setNewPass(e.target.value)}
                        placeholder="Contraseña actual del nodo"
                        autoComplete="new-password"
                        name={`ppp-pass-${node.ppp_user}`}
                        className={`w-full px-3 py-2 pr-24 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                        ${newPass && newPass !== loadedPass ? 'border-amber-300 focus:ring-amber-300 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-300'}`} />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button onClick={() => setShowPass(v => !v)} title={showPass ? 'Ocultar' : 'Ver'}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-200 rounded-lg transition-colors">
                          {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setNewPass(generateSecurePassword())} title="Generar nueva contraseña segura"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        {newPass && (
                          <button onClick={() => copyEditField(newPass, 'edit-pass')} title="Copiar contraseña"
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                            {copiedEditField === 'edit-pass' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {!loadingDetails && (
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        {!loadedPass ? (
                          <p className="text-2xs text-slate-400">
                            Sin contraseña en DB local — ingrésala y pulsa <span className="font-bold">Guardar en DB</span>
                          </p>
                        ) : newPass === loadedPass ? (
                          <p className="text-2xs text-emerald-600 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Sincronizada con DB local
                          </p>
                        ) : (
                          <p className="text-2xs text-amber-600">Modificada — guarda para actualizar</p>
                        )}

                        {newPass.trim() && newPass !== loadedPass && (
                          <button onClick={handleSavePassToDb} disabled={savingPassDb}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-bold border transition-colors shrink-0
                            bg-sky-50 dark:bg-sky-500/10 border-sky-200 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                            {savingPassDb
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : passDbSaved
                                ? <Check className="w-3 h-3 text-emerald-500" />
                                : <ShieldCheck className="w-3 h-3" />}
                            {passDbSaved ? '¡Guardada!' : 'Guardar en DB'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isWg && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">IP Túnel remota (PPP remote-address)</label>
                    <input value={newRemote} onChange={e => setNewRemote(e.target.value)}
                      placeholder={currentRemoteIP || '10.10.250.xxx'}
                      className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                      ${newRemote && !IPV4_RE.test(newRemote.trim()) ? 'border-rose-300 focus:ring-rose-300' : remoteChanged ? 'border-amber-300 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-300'}`} />
                    {remoteChanged && <p className="text-2xs text-amber-600 mt-0.5">Cambiará de <span className="font-mono font-bold">{currentRemoteIP}</span> a <span className="font-mono font-bold">{newRemote}</span></p>}
                  </div>
                )}
              </div>

              {node.nombre_vrf && (
                <>
                  <div>
                    <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Redes LAN actuales {loadingDetails && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </p>
                    {currentSubnets.length === 0 && !loadingDetails && (
                      <p className="text-xs text-slate-400 italic">Sin subnets detectadas</p>
                    )}
                    <div className="space-y-1.5">
                      {currentSubnets.map(s => (
                        <div key={s} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors
                          ${removeSet.has(s) ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-rose-200'}`}
                          onClick={() => toggleRemove(s)}>
                          <span className={`font-mono font-bold ${removeSet.has(s) ? 'text-rose-600 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{s}</span>
                          <span className={`text-2xs font-bold ${removeSet.has(s) ? 'text-rose-500' : 'text-slate-400'}`}>
                            {removeSet.has(s) ? 'Eliminar' : 'Clic para eliminar'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Agregar redes LAN</p>
                      <button onClick={() => setAddSubnets(p => [...p, ''])}
                        className="flex items-center gap-1 text-2xs font-bold text-indigo-600 hover:text-indigo-800">
                        <Plus className="w-3 h-3" /> Agregar
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {addSubnets.map((s, i) => {
                        const valid = CIDR_RE.test(s.trim());
                        const conflict = valid && getSubnetConflicts([s.trim()]).length > 0;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <input value={s} onChange={e => setAddSubnets(p => p.map((x, j) => j === i ? e.target.value : x))}
                              placeholder="10.5.0.0/24"
                              className={`flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                                ${conflict ? 'border-rose-400 focus:ring-rose-300 bg-rose-50 dark:bg-rose-500/10' : s && !valid ? 'border-rose-300 focus:ring-rose-300' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-300'}`} />
                            {addSubnets.length > 1 && (
                              <button onClick={() => setAddSubnets(p => p.filter((_, j) => j !== i))}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:bg-rose-500/10 rounded-lg">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {addSubnetConflicts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {addSubnetConflicts.map((msg, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 text-xs">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-rose-700">Conflicto de red</p>
                              <p className="text-rose-600">{msg}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {saving && !result && (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Aplicando cambios en MikroTik…</p>
            </div>
          )}
        </div>

        {!saving && !result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={!hasChanges}
              className="btn-primary btn-md flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /><span>Guardar cambios</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
