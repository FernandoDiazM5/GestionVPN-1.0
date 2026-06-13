import { useState, useEffect, useCallback } from 'react';
import {
  Plus, CheckCircle2, Loader2, Eye, EyeOff, AlertCircle, RefreshCw,
  Copy, Check, Info, Minus, Globe, ShieldCheck, X,
} from 'lucide-react';
import { useVpn } from '../../../../context';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { generateSecurePassword, getSubnetConflicts } from '../utils';
import { ProvisionSteps } from '../components';
import type { ProvisionResult } from '../types';

interface NuevoNodoProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function NuevoNodo({ onClose, onSuccess }: NuevoNodoProps) {
  const { credentials } = useVpn();

  const [nextNode, setNextNode] = useState<number | null>(null);
  const [nextRemote, setNextRemote] = useState<string>('');
  const [loadingNext, setLoadingNext] = useState(true);
  const [loadNextErr, setLoadNextErr] = useState('');

  const [nombre, setNombre] = useState('');
  const [pppUser, setPppUser] = useState('');
  const [pppPass, setPppPass] = useState('');
  const [showPass, setShowPass] = useState(true);
  const [showResPass, setShowResPass] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [lanSubnets, setLanSubnets] = useState<string[]>(['']);
  const [protocol, setProtocol] = useState<'sstp' | 'wireguard'>('sstp');
  const [cpePublicKey, setCpePublicKey] = useState('');
  const [serverPublicKey, setServerPublicKey] = useState('');
  const [wanIp, setWanIp] = useState<string>(() => localStorage.getItem('wg_wan_ip') ?? '');

  useEffect(() => { setPppPass(generateSecurePassword()); }, []);

  const copyField = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [provStep, setProvStep] = useState(0);

  const nameClean = nombre.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ndNum = nextNode ?? '?';
  const ifaceName = nameClean ? `VPN-${protocol === 'wireguard' ? 'WG' : 'SSTP'}-ND${ndNum}-${nameClean}` : '';
  const vrfName = nameClean ? `VRF-ND${ndNum}-${nameClean}` : '';

  const suggestedPppUser = nameClean ? `ppp-pass-${nameClean.toLowerCase()}` : '';

  useEffect(() => {
    setPppUser(prev => {
      if (!prev || prev.startsWith('ppp-pass-')) return suggestedPppUser;
      return prev;
    });
  }, [suggestedPppUser]);

  const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const validSubnets = lanSubnets.filter(s => CIDR_RE.test(s.trim()));
  const subnetConflicts = getSubnetConflicts(validSubnets);

  const loadNext = useCallback(async () => {
    if (!credentials) return;
    setLoadingNext(true); setLoadNextErr('');
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/next`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
      }, 15_000);
      const d = await r.json();
      if (d.success) { setNextNode(d.nextNode); setNextRemote(d.nextRemote); }
      else setLoadNextErr(d.message);
    } catch (e) { setLoadNextErr(e instanceof Error ? e.message : 'Error'); }
    setLoadingNext(false);
  }, [credentials]);

  useEffect(() => { loadNext(); }, [loadNext]);

  const TOTAL_STEPS = 7;
  useEffect(() => {
    if (!provisioning) { setProvStep(0); return; }
    setProvStep(0);
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, TOTAL_STEPS - 1);
      setProvStep(i);
    }, 1800);
    return () => clearInterval(id);
  }, [provisioning]);

  useEffect(() => {
    if (!result) { setVisibleSteps(0); return; }
    setVisibleSteps(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setVisibleSteps(i);
      if (i >= result.steps.length) clearInterval(id);
    }, 350);
    return () => clearInterval(id);
  }, [result]);

  const canSubmit = nameClean.length >= 2
    && (protocol === 'sstp' ? (!!pppUser.trim() && !!pppPass.trim()) : true)
    && validSubnets.length > 0 && nextNode != null && !provisioning && subnetConflicts.length === 0;

  const PASOS_LABELS = protocol === 'wireguard' ? [
    'WireGuard Interface',
    'WireGuard Peer (CPE)',
    'IP del túnel WireGuard',
    'Interface List (LIST-VPN-TOWERS + WG)',
    'VRF',
    'Ruta(s) LAN remota(s)',
    'Ruta retorno MGMT',
  ] : [
    'PPP Secret',
    'SSTP Interface',
    'Interface List (LIST-VPN-TOWERS)',
    'Address List (LIST-NET-REMOTE-TOWERS)',
    'VRF',
    'Rutas LAN remota(s)',
    'Ruta retorno MGMT',
  ];

  const handleSubmit = async () => {
    if (!credentials || !canSubmit || nextNode == null) return;
    setProvisioning(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/provision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          nodeNumber: nextNode, nodeName: nameClean,
          pppUser: pppUser.trim(), pppPassword: pppPass,
          lanSubnets: validSubnets,
          remoteAddress: nextRemote,
          protocol,
          cpePublicKey: protocol === 'wireguard' ? cpePublicKey.trim() : undefined,
        }),
      }, 90_000);
      const d: ProvisionResult = await r.json();
      setResult(d);
      if (d.success && d.serverPublicKey) {
        setServerPublicKey(d.serverPublicKey);
      }
      if (d.success) {
        fetchWithTimeout(`${API_BASE_URL}/api/node/label/save`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: pppUser.trim(), label: nombre.trim() }),
        }, 5_000).catch(() => { });
      }
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Error', steps: [], failedAt: 0 });
    }
    setProvisioning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !provisioning && !result && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between bg-indigo-700 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Nuevo Nodo VPN</p>
              <p className="text-2xs text-indigo-200 mt-0.5">Provisionado completo en MikroTik — 7 pasos</p>
            </div>
          </div>
          {!provisioning && !result && (
            <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {provisioning && !result && (
            <div className="p-5 space-y-3">
              <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Ejecutando en MikroTik…</p>
              <div className="space-y-1.5">
                {PASOS_LABELS.map((label, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border transition-colors
                    ${idx < provStep ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100' : idx === provStep ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0
                      ${idx < provStep ? 'bg-emerald-500 text-white' : idx === provStep ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {idx < provStep ? '✓' : idx === provStep ? <Loader2 className="w-3 h-3 animate-spin" /> : idx + 1}
                    </span>
                    <span className={`font-semibold ${idx === provStep ? 'text-indigo-700' : idx < provStep ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="p-5 space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.success ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200'}`}>
                {result.success
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {result.success ? '¡Nodo provisionado exitosamente!' : 'Error en el provisionamiento'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{result.message}</p>
                </div>
              </div>

              {result.success && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { l: 'Nodo', v: `ND${nextNode}` },
                      { l: 'IP Túnel', v: result.remoteAddress },
                      { l: 'Interfaz', v: result.ifaceName },
                      { l: 'VRF', v: result.vrfName },
                      { l: 'LAN(s)', v: validSubnets.join(', ') },
                    ].filter(r => r.v).map(row => (
                      <div key={row.l} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                        <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 truncate">{row.v}</p>
                      </div>
                    ))}
                  </div>

                  {protocol === 'sstp' && (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Credenciales PPP — para ingresar en MikroTik</p>
                      </div>
                      <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-amber-100 rounded-lg px-3 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Usuario PPP</p>
                          <p className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">{pppUser}</p>
                        </div>
                        <button onClick={() => copyField(pppUser, 'res-user')}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors shrink-0">
                          {copiedField === 'res-user' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-amber-100 rounded-lg px-3 py-2.5 gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Contraseña PPP</p>
                          <p className={`text-sm font-mono font-bold text-slate-800 dark:text-slate-100 truncate transition-all ${showResPass ? '' : 'blur-sm select-none'}`}>
                            {pppPass}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setShowResPass(v => !v)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-200 rounded-lg transition-colors">
                            {showResPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button onClick={() => copyField(pppPass, 'res-pass')}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                            {copiedField === 'res-pass' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-2xs text-amber-600 pt-1">
                        Guarda estas credenciales — también las encontrarás en el botón de Script del nodo.
                      </p>
                    </div>
                  )}
                </>
              )}

              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pasos ejecutados</p>
                <ProvisionSteps steps={result.steps ?? []} failedAt={result.failedAt} visible={visibleSteps} />
              </div>

              {serverPublicKey && (
                <div className="mt-3 p-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 rounded-lg">
                  <p className="text-2xs font-bold text-violet-600 uppercase tracking-wider mb-1">Clave Pública del Servidor WireGuard</p>
                  <p className="font-mono text-xs text-violet-800 break-all">{serverPublicKey}</p>
                  <p className="text-2xs text-violet-500 mt-1">Configurar esta clave en el router torre como peer del servidor</p>
                </div>
              )}

              {protocol === 'wireguard' && result.success && (() => {
                const wgNodeNum = nextNode ?? 0;
                const peerIP = (result as any).peerIP ?? `10.10.251.${wgNodeNum * 4 - 2}`;
                const wgPort = (result as any).wgPort ?? (13300 + wgNodeNum);
                const serverIP = wanIp || credentials?.ip || '<IP-servidor>';
                const peerOct = parseInt(peerIP.split('.')[3] ?? '2');
                const blockBase30 = peerOct - 2;
                const tunnelNet30 = `10.10.251.${blockBase30}/30`;
                const cpeSteps = [
                  { n: 1, title: 'Crear interfaz WireGuard', cmd: `/interface wireguard add name=WG-CORE-ISP mtu=1420 comment="Conexion al Servidor Core"` },
                  { n: 2, title: 'Asignar IP al túnel (/30)', cmd: `/ip address add address=${peerIP}/30 interface=WG-CORE-ISP network=10.10.251.${blockBase30} comment="IP WG Cliente ND${wgNodeNum}"` },
                  {
                    n: 3, title: 'Agregar peer (servidor Core)', cmd: serverPublicKey
                      ? `/interface wireguard peers add interface=WG-CORE-ISP public-key="${serverPublicKey}" endpoint-address=${serverIP} endpoint-port=${wgPort} allowed-address=192.168.21.0/24,${tunnelNet30} persistent-keepalive=25s comment="Conexion al Servidor Core"`
                      : '(esperando clave pública del servidor)'
                  },
                  { n: 4, title: 'Ruta de retorno hacia administración', cmd: `/ip route add dst-address=192.168.21.0/24 distance=2 gateway=WG-CORE-ISP comment="Retorno hacia Administracion/Software"` },
                ];
                return (
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Pasos a configurar en el router torre (CPE)</p>
                    </div>
                    {!cpePublicKey && (
                      <div className="mb-3 p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 rounded-lg">
                        <p className="text-2xs font-semibold text-amber-700">
                          Nodo creado sin peer CPE. Configura el router torre con los comandos de abajo, obtén su public key y agrégala desde las opciones del nodo.
                        </p>
                      </div>
                    )}
                    <ol className="space-y-2">
                      {cpeSteps.map(step => (
                        <li key={step.n} className="flex items-start gap-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2.5">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 dark:text-slate-300 text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step.n}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-0.5">{step.title}</p>
                            <p className="text-2xs font-mono text-violet-700 break-all bg-violet-50 dark:bg-violet-500/10 rounded px-2 py-1 mt-1">{step.cmd}</p>
                          </div>
                          <button onClick={() => navigator.clipboard.writeText(step.cmd)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors shrink-0 mt-0.5"
                            title="Copiar">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <p className="text-2xs text-slate-400 mt-3">
                      Luego obtén la public key del CPE con: <span className="font-mono">/interface wireguard print</span>
                    </p>
                  </div>
                );
              })()}

              <button onClick={() => { result.success ? onSuccess() : onClose(); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                {result.success ? 'Listo' : 'Cerrar'}
              </button>
            </div>
          )}

          {!provisioning && !result && (
            <div className="p-5 space-y-5">
              <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-3.5 h-3.5 text-indigo-500" />
                  <p className="text-2xs font-bold text-indigo-600 uppercase tracking-wider">Auto-generado por el sistema</p>
                  {loadingNext && <Loader2 className="w-3 h-3 animate-spin text-indigo-400 ml-auto" />}
                  {loadNextErr && <span className="text-2xs text-rose-500 ml-auto">{loadNextErr}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { l: 'Número Nodo', v: nextNode != null ? `ND${nextNode}` : '—' },
                    { l: 'IP Túnel (remota)', v: nextRemote || '—' },
                    { l: `Interfaz ${protocol === 'wireguard' ? 'WG' : 'SSTP'}`, v: ifaceName || '(ingresar nombre)' },
                    { l: 'VRF', v: vrfName || '(ingresar nombre)' },
                  ].map(row => (
                    <div key={row.l} className="bg-white rounded-lg px-3 py-2 border border-indigo-100">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{row.l}</p>
                      <p className="text-2xs font-mono font-bold text-indigo-700 truncate">{row.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Datos del nodo</p>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nombre del nodo <span className="text-rose-500">*</span>
                    <span className="text-2xs font-normal text-slate-400 ml-1">(cualquier nombre)</span>
                  </label>
                  <input value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: ROSMERY, FIWIS, MILAGROS"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  {nameClean && <p className="text-2xs text-slate-400 mt-0.5">Se usará: <span className="font-mono font-bold text-indigo-600">{nameClean}</span></p>}
                </div>

                <div>
                  <label className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Protocolo</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setProtocol('sstp')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${protocol === 'sstp' ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-400 text-sky-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                        }`}>
                      SSTP
                    </button>
                    <button type="button" onClick={() => setProtocol('wireguard')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${protocol === 'wireguard' ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-400 text-violet-700' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                        }`}>
                      WireGuard
                    </button>
                  </div>
                </div>

                {protocol === 'sstp' && (<>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Usuario PPP <span className="text-rose-500">*</span>
                      <span className="text-2xs font-normal text-slate-400 ml-1">— ingresar manualmente</span>
                    </label>
                    <div className="relative">
                      <input value={pppUser} onChange={e => setPppUser(e.target.value)}
                        placeholder="Ej: TorreVirginia-ND2"
                        className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
                      {pppUser && (
                        <button onClick={() => copyField(pppUser, 'form-user')}
                          title="Copiar usuario"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors">
                          {copiedField === 'form-user' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Contraseña PPP <span className="text-rose-500">*</span>
                      </label>
                      <span className="flex items-center gap-1 text-2xs text-emerald-600 font-medium">
                        <ShieldCheck className="w-3 h-3" />
                        Auto-generada · {pppPass.length} chars
                      </span>
                    </div>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} value={pppPass}
                        onChange={e => setPppPass(e.target.value)}
                        className="w-full px-3 py-2 pr-24 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button onClick={() => setShowPass(v => !v)} title={showPass ? 'Ocultar' : 'Ver'}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-200 rounded-lg transition-colors">
                          {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setPppPass(generateSecurePassword())} title="Regenerar contraseña"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => copyField(pppPass, 'form-pass')} title="Copiar contraseña"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                          {copiedField === 'form-pass' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-2xs text-slate-400 mt-0.5">Puedes editar o regenerar — se guardará en la base de datos local</p>
                  </div>
                </>)}

                {protocol === 'wireguard' && (
                  <div>
                    <label className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">IP Pública WAN del Servidor</label>
                    <input
                      value={wanIp}
                      onChange={e => { setWanIp(e.target.value); localStorage.setItem('wg_wan_ip', e.target.value); }}
                      placeholder="213.173.36.232"
                      className="input-field w-full font-mono text-sm"
                    />
                    <p className="text-2xs text-slate-400 mt-1">IP pública del MikroTik. Se guarda automáticamente para próximos nodos.</p>
                  </div>
                )}

                {protocol === 'wireguard' && (
                  <div>
                    <label className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">
                      Clave Pública del CPE <span className="text-slate-400 font-normal normal-case">(opcional)</span>
                    </label>
                    <textarea
                      value={cpePublicKey}
                      onChange={e => setCpePublicKey(e.target.value)}
                      placeholder="Dejar vacío si aún no configuraste WireGuard en el router torre..."
                      className="input-field w-full font-mono text-xs resize-none"
                      rows={3}
                    />
                    <p className="text-2xs text-slate-400 mt-1">
                      Si no la tienes aún: crea el nodo primero, obtén la clave del servidor y configura el CPE. Luego agrega la clave del CPE desde el script del nodo.
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Segmento(s) LAN remoto <span className="text-rose-500">*</span>
                    </label>
                    <button onClick={() => setLanSubnets(p => [...p, ''])}
                      className="flex items-center gap-1 text-2xs font-bold text-indigo-600 hover:text-indigo-800">
                      <Plus className="w-3 h-3" /> Agregar red
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {lanSubnets.map((s, i) => {
                      const valid = CIDR_RE.test(s.trim());
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <input value={s} onChange={e => setLanSubnets(p => p.map((x, j) => j === i ? e.target.value : x))}
                            placeholder="10.3.0.0/24"
                            className={`flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                              ${s && !valid ? 'border-rose-300 focus:ring-rose-300' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-300'}`} />
                          {lanSubnets.length > 1 && (
                            <button onClick={() => setLanSubnets(p => p.filter((_, j) => j !== i))}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:bg-rose-500/10 rounded-lg">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {validSubnets.length > 0 && <p className="text-2xs text-slate-400 mt-1">{validSubnets.length} subred(es) válida(s)</p>}
                  {subnetConflicts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {subnetConflicts.map((msg, i) => (
                        <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 text-xs">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-rose-700">Conflicto de red detectado</p>
                            <p className="text-rose-600 mt-0.5">{msg}</p>
                            <p className="text-rose-500 mt-0.5">Esta subred se solapa con la red de gestión y puede causar pérdida de conectividad con el router.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pasos que se ejecutarán en MikroTik</p>
                <div className="space-y-1.5">
                  {PASOS_LABELS.map((label, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center text-2xs font-bold shrink-0">{idx + 1}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2.5 text-xs mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-2xs font-bold shrink-0">8</span>
                    <span className="font-semibold text-sky-600">Mangle + vpn-activa</span>
                    <span className="text-slate-400 text-2xs">→ Al activar el nodo</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!provisioning && !result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white
                hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-500/25">
              <Plus className="w-4 h-4" /><span>Crear Nodo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
