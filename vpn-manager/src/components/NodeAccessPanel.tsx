import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, Search,
  ShieldCheck, ShieldOff, AlertCircle, Radio, Clock, X,
  Plus, CheckCircle2, Loader2, Eye, EyeOff, Info, Trash2, Pencil, Minus,
  Wifi, Copy, Check, FileCode, UserPlus, Download, History, Upload,
  ArrowUpDown, Tag, SortAsc, SortDesc, Bell, Globe,
} from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { NodeInfo, WgPeer } from '../types/api';
import NodeCard from './NodeCard';
import { API_BASE_URL } from '../config';
import { deviceDb } from '../store/deviceDb';
import { cpeCache } from '../store/cpeCache';

// ── Tipos para provisión ───────────────────────────────────────────────────
interface ProvisionStep {
  step: string | number;
  obj: string;
  name: string;
  status: 'ok' | 'error';
}

interface ProvisionResult {
  success: boolean;
  message: string;
  ifaceName?: string;
  vrfName?: string;
  remoteAddress?: string;
  steps: ProvisionStep[];
  failedAt?: number;
}

// ── Helper: detección de solapamiento de subnets ─────────────────────────
// Redes reservadas que no deben usarse como LAN remota de un nodo
const PROTECTED_NETS = [
  { cidr: '192.168.21.0/24', label: 'WireGuard gestión (192.168.21.0/24)' },
  { cidr: '10.10.250.0/24',  label: 'Pool PPP túnel (10.10.250.0/24)' },
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct)) >>> 0, 0) >>> 0;
}

function cidrOverlaps(a: string, b: string): boolean {
  const [ipA, prefA] = a.split('/');
  const [ipB, prefB] = b.split('/');
  const maskA = prefA ? (0xFFFFFFFF << (32 - parseInt(prefA))) >>> 0 : 0xFFFFFFFF;
  const maskB = prefB ? (0xFFFFFFFF << (32 - parseInt(prefB))) >>> 0 : 0xFFFFFFFF;
  const netA = (ipToInt(ipA) & maskA) >>> 0;
  const netB = (ipToInt(ipB) & maskB) >>> 0;
  return (netA & maskB) === netB || (netB & maskA) === netA;
}

function getSubnetConflicts(subnets: string[]): string[] {
  const conflicts: string[] = [];
  for (const s of subnets) {
    if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(s.trim())) continue;
    for (const p of PROTECTED_NETS) {
      try {
        if (cidrOverlaps(s.trim(), p.cidr)) {
          conflicts.push(`${s.trim()} se solapa con ${p.label}`);
        }
      } catch { /* ignorar CIDRs malformados */ }
    }
  }
  return conflicts;
}

// ── Helper: resultado de pasos con animación ──────────────────────────────
function StepResultList({ steps, failedAt, visible }: {
  steps: ProvisionStep[];
  failedAt?: number;
  visible: number;
}) {
  return (
    <div className="space-y-1.5">
      {steps.slice(0, visible).map(s => (
        <div key={String(s.step)} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border
          animate-in fade-in slide-in-from-left-2 duration-200
          ${s.status === 'ok' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
            ${s.status === 'ok' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            {s.status === 'ok' ? '✓' : '✗'}
          </span>
          <div className="min-w-0">
            <span className="font-bold text-slate-700">Paso {s.step} — {s.obj}</span>
            <p className="text-[10px] text-slate-400 font-mono truncate">{s.name}</p>
          </div>
        </div>
      ))}
      {failedAt != null && failedAt > 0 && visible >= steps.length && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs border bg-amber-50 border-amber-100 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-amber-700 font-medium">Falló en el paso {failedAt} — los pasos anteriores fueron aplicados</span>
        </div>
      )}
    </div>
  );
}

// ── Generador de contraseña segura ────────────────────────────────────────
function generateSecurePassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const symbols = '!@#$%*-_+=?';
  const all = upper + lower + digits + symbols;
  const mandatory = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  const remaining = Array.from({ length: 14 }, () =>
    all[Math.floor(Math.random() * all.length)]
  );
  return [...mandatory, ...remaining].sort(() => Math.random() - 0.5).join('');
}

// ── Modal Nuevo Nodo ───────────────────────────────────────────────────────
function NuevoNodoModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
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

  // Generar contraseña segura al abrir el modal
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
  const [provStep, setProvStep] = useState(0); // animación mientras provisionando

  const nameClean = nombre.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ndNum = nextNode ?? '?';
  const ifaceName = nameClean ? `VPN-SSTP-ND${ndNum}-${nameClean}` : '';
  const vrfName = nameClean ? `VRF-ND${ndNum}-${nameClean}` : '';

  // Auto-generar usuario PPP: ppp-pass-{nombreLimpio} (en minúsculas, único por nodo)
  const suggestedPppUser = nameClean ? `ppp-pass-${nameClean.toLowerCase()}` : '';

  // Sincronizar pppUser con el nombre solo si el usuario no lo ha modificado manualmente
  useEffect(() => {
    setPppUser(prev => {
      // Si está vacío o coincide con la sugerencia anterior → actualizar
      if (!prev || prev.startsWith('ppp-pass-')) return suggestedPppUser;
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Animación de paso activo mientras provisionando
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

  // Revelar pasos uno a uno al recibir resultado
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

  const canSubmit = nameClean.length >= 2 && pppUser.trim() && pppPass.trim()
    && validSubnets.length > 0 && nextNode != null && !provisioning && subnetConflicts.length === 0;

  const PASOS_LABELS = [
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
        }),
      }, 90_000);
      const d: ProvisionResult = await r.json();
      setResult(d);
      // El backend ya guardó el nodo + contraseña en SQLite durante /node/provision.
      // Aquí solo guardamos la etiqueta con el nombre original (puede tener tildes/espacios).
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between bg-indigo-700 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Nuevo Nodo VPN</p>
              <p className="text-[10px] text-indigo-200 mt-0.5">Provisionado completo en MikroTik — 7 pasos</p>
            </div>
          </div>
          {!provisioning && !result && (
            <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── Provisionando ─── */}
          {provisioning && !result && (
            <div className="p-5 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ejecutando en MikroTik…</p>
              <div className="space-y-1.5">
                {PASOS_LABELS.map((label, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border transition-colors
                    ${idx < provStep ? 'bg-emerald-50 border-emerald-100' : idx === provStep ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                      ${idx < provStep ? 'bg-emerald-500 text-white' : idx === provStep ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {idx < provStep ? '✓' : idx === provStep ? <Loader2 className="w-3 h-3 animate-spin" /> : idx + 1}
                    </span>
                    <span className={`font-semibold ${idx === provStep ? 'text-indigo-700' : idx < provStep ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Resultado ─── */}
          {result && (
            <div className="p-5 space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                {result.success
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {result.success ? '¡Nodo provisionado exitosamente!' : 'Error en el provisionamiento'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{result.message}</p>
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
                      <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                        <p className="text-xs font-mono font-bold text-slate-700 truncate">{row.v}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Credenciales para MikroTik ── */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Credenciales PPP — para ingresar en MikroTik</p>
                    </div>
                    {/* Usuario */}
                    <div className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Usuario PPP</p>
                        <p className="text-sm font-mono font-bold text-slate-800">{pppUser}</p>
                      </div>
                      <button onClick={() => copyField(pppUser, 'res-user')}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors shrink-0">
                        {copiedField === 'res-user' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Contraseña */}
                    <div className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-2.5 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Contraseña PPP</p>
                        <p className={`text-sm font-mono font-bold text-slate-800 truncate transition-all ${showResPass ? '' : 'blur-sm select-none'}`}>
                          {pppPass}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setShowResPass(v => !v)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                          {showResPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => copyField(pppPass, 'res-pass')}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                          {copiedField === 'res-pass' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-600 pt-1">
                      Guarda estas credenciales — también las encontrarás en el botón de Script del nodo.
                    </p>
                  </div>
                </>
              )}

              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pasos ejecutados</p>
                <StepResultList steps={result.steps} failedAt={result.failedAt} visible={visibleSteps} />
              </div>

              <button onClick={() => { result.success ? onSuccess() : onClose(); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                {result.success ? 'Listo' : 'Cerrar'}
              </button>
            </div>
          )}

          {/* ── Formulario ─── */}
          {!provisioning && !result && (
            <div className="p-5 space-y-5">
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-3.5 h-3.5 text-indigo-500" />
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Auto-generado por el sistema</p>
                  {loadingNext && <Loader2 className="w-3 h-3 animate-spin text-indigo-400 ml-auto" />}
                  {loadNextErr && <span className="text-[10px] text-rose-500 ml-auto">{loadNextErr}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { l: 'Número Nodo', v: nextNode != null ? `ND${nextNode}` : '—' },
                    { l: 'IP Túnel (remota)', v: nextRemote || '—' },
                    { l: 'Interfaz SSTP', v: ifaceName || '(ingresar nombre)' },
                    { l: 'VRF', v: vrfName || '(ingresar nombre)' },
                  ].map(row => (
                    <div key={row.l} className="bg-white rounded-lg px-3 py-2 border border-indigo-100">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{row.l}</p>
                      <p className="text-[11px] font-mono font-bold text-indigo-700 truncate">{row.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Datos del nodo</p>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nombre del nodo <span className="text-rose-500">*</span>
                    <span className="text-[10px] font-normal text-slate-400 ml-1">(cualquier nombre)</span>
                  </label>
                  <input value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: ROSMERY, FIWIS, MILAGROS"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  {nameClean && <p className="text-[10px] text-slate-400 mt-0.5">Se usará: <span className="font-mono font-bold text-indigo-600">{nameClean}</span></p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Usuario PPP <span className="text-rose-500">*</span>
                    <span className="text-[10px] font-normal text-slate-400 ml-1">— ingresar manualmente</span>
                  </label>
                  <div className="relative">
                    <input value={pppUser} onChange={e => setPppUser(e.target.value)}
                      placeholder="Ej: TorreVirginia-ND2"
                      className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
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
                    <label className="text-xs font-semibold text-slate-600">
                      Contraseña PPP <span className="text-rose-500">*</span>
                    </label>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                      <ShieldCheck className="w-3 h-3" />
                      Auto-generada · {pppPass.length} chars
                    </span>
                  </div>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={pppPass}
                      onChange={e => setPppPass(e.target.value)}
                      className="w-full px-3 py-2 pr-24 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button onClick={() => setShowPass(v => !v)} title={showPass ? 'Ocultar' : 'Ver'}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
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
                  <p className="text-[10px] text-slate-400 mt-0.5">Puedes editar o regenerar — se guardará en la base de datos local</p>
                </div>

                {/* Múltiples subnets */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">
                      Segmento(s) LAN remoto <span className="text-rose-500">*</span>
                    </label>
                    <button onClick={() => setLanSubnets(p => [...p, ''])}
                      className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
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
                              ${s && !valid ? 'border-rose-300 focus:ring-rose-300' : 'border-slate-200 focus:ring-indigo-300'}`} />
                          {lanSubnets.length > 1 && (
                            <button onClick={() => setLanSubnets(p => p.filter((_, j) => j !== i))}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {validSubnets.length > 0 && <p className="text-[10px] text-slate-400 mt-1">{validSubnets.length} subred(es) válida(s)</p>}
                  {subnetConflicts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {subnetConflicts.map((msg, i) => (
                        <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs">
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

              {/* Vista previa */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Pasos que se ejecutarán en MikroTik</p>
                <div className="space-y-1.5">
                  {PASOS_LABELS.map((label, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                      <span className="font-semibold text-slate-700">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2.5 text-xs mt-1 pt-1 border-t border-slate-200">
                    <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-[10px] font-bold shrink-0">8</span>
                    <span className="font-semibold text-sky-600">Mangle + vpn-activa</span>
                    <span className="text-slate-400 text-[10px]">→ Al activar el nodo</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!provisioning && !result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
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

// ── Modal Eliminar Nodo ────────────────────────────────────────────────────
function EliminarNodoModal({
  node,
  onClose,
  onSuccess,
}: {
  node: NodeInfo;
  onClose: () => void;
  onSuccess: (deletedDeviceIds: string[]) => void;
}) {
  const { credentials } = useVpn();
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [deletedDeviceIds, setDeletedDeviceIds] = useState<string[]>([]);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [delStep, setDelStep] = useState(0);

  const ifaceName = node.nombre_vrf?.replace(/^VRF-/, 'VPN-SSTP-') ?? '';
  const lanSubnets = node.lan_subnets && node.lan_subnets.length > 0
    ? node.lan_subnets
    : node.segmento_lan ? node.segmento_lan.split(',').map(s => s.trim()) : [];

  const DEL_STEPS = [
    'Reglas Mangle (acceso VRF)',
    'vpn-activa (sesiones activas)',
    'Rutas VRF',
    'VRF',
    'LAN subnets (LIST-NET-REMOTE-TOWERS)',
    'Interface List (LIST-VPN-TOWERS)',
    'SSTP Interface',
    'PPP Secret',
  ];

  useEffect(() => {
    if (!deleting) { setDelStep(0); return; }
    setDelStep(0);
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, DEL_STEPS.length - 1);
      setDelStep(i);
    }, 1400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting]);

  useEffect(() => {
    if (!result) { setVisibleSteps(0); return; }
    let i = 0;
    const id = setInterval(() => { i++; setVisibleSteps(i); if (i >= result.steps.length) clearInterval(id); }, 300);
    return () => clearInterval(id);
  }, [result]);

  const handleDelete = async () => {
    if (!credentials || !node.ppp_user) return;
    setDeleting(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/deprovision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip, user: credentials.user, pass: credentials.pass,
          vrfName: node.nombre_vrf, pppUser: node.ppp_user, lanSubnets,
        }),
      }, 60_000);
      const d = await r.json();
      setResult(d as ProvisionResult);
      if (d.deletedDeviceIds) setDeletedDeviceIds(d.deletedDeviceIds);
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Error', steps: [], failedAt: 0 });
    }
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !deleting && !result && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between bg-rose-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Eliminar Nodo VPN</p>
              <p className="text-[10px] text-rose-200 mt-0.5">Reverso completo del provisionamiento — 8 pasos</p>
            </div>
          </div>
          {!deleting && !result && (
            <button onClick={onClose} className="p-1.5 text-rose-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Progreso eliminando */}
          {deleting && !result && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eliminando configuración de MikroTik…</p>
              <div className="space-y-1.5">
                {DEL_STEPS.map((label, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border transition-colors
                    ${idx < delStep ? 'bg-emerald-50 border-emerald-100' : idx === delStep ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                      ${idx < delStep ? 'bg-emerald-500 text-white' : idx === delStep ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {idx < delStep ? '✓' : idx === delStep ? <Loader2 className="w-3 h-3 animate-spin" /> : idx + 1}
                    </span>
                    <span className={`font-semibold ${idx === delStep ? 'text-rose-700' : idx < delStep ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                {result.success
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {result.success ? 'Nodo eliminado correctamente' : 'Error al eliminar'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{result.message}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pasos ejecutados</p>
                <StepResultList steps={result.steps} failedAt={result.failedAt} visible={visibleSteps} />
              </div>
              <button onClick={() => result.success ? onSuccess(deletedDeviceIds) : onClose()}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors">
                {result.success ? 'Listo' : 'Cerrar'}
              </button>
            </div>
          )}

          {/* Confirmación */}
          {!deleting && !result && (
            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <p className="text-sm font-bold text-rose-700 mb-1">¿Eliminar permanentemente?</p>
                <p className="text-xs text-rose-600">Se eliminarán todos los objetos de MikroTik asociados a este nodo. Esta acción no se puede deshacer.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Nodo', v: node.nombre_nodo },
                  { l: 'VRF', v: node.nombre_vrf },
                  { l: 'Interfaz', v: ifaceName },
                  { l: 'Usuario PPP', v: node.ppp_user },
                  { l: 'LAN(s)', v: node.segmento_lan || '—' },
                  { l: 'IP Túnel', v: node.ip_tunnel || '—' },
                ].map(row => (
                  <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                    <p className="text-xs font-mono font-bold text-slate-700 truncate">{row.v}</p>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <span className="text-xs text-slate-600 font-medium">Confirmo que quiero eliminar este nodo y toda su configuración en MikroTik</span>
              </label>
            </div>
          )}
        </div>

        {!deleting && !result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={!confirmed}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-rose-600 text-white
                hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-rose-500/25">
              <Trash2 className="w-4 h-4" /><span>Eliminar Nodo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal Editar Nodo ─────────────────────────────────────────────────────
function EditarNodoModal({
  node,
  onClose,
  onSuccess,
}: {
  node: NodeInfo;
  onClose: () => void;
  onSuccess: (newLabel?: string) => void;
}) {
  const { credentials } = useVpn();
  const [currentSubnets, setCurrentSubnets] = useState<string[]>([]);
  const [currentRemoteIP, setCurrentRemoteIP] = useState('');
  const [loadingDetails, setLoadingDetails] = useState(true);

  // Campos editables
  const [newLabel, setNewLabel] = useState(node.nombre_nodo || '');
  const [newPppUser, setNewPppUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loadedPass, setLoadedPass] = useState('');   // contraseña guardada en DB (referencia)
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
      // ── 1. Consultas en paralelo: detalles MikroTik + clave en DB local ──
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

      // ── 2. Aplicar detalles de MikroTik ──
      const details = detailsRes.status === 'fulfilled' ? detailsRes.value : null;
      const mikrotikPass: string = (details?.success && details?.pppPassword) ? details.pppPassword : '';
      if (details?.success) {
        setCurrentSubnets(details.lanSubnets || []);
        setCurrentRemoteIP(details.remoteAddress || '');
        setNewPppUser(details.currentPppUser || pppUser);
        setNewRemote(details.remoteAddress || '');
      }

      // ── 3. Aplicar contraseña: DB tiene prioridad, MikroTik es fallback ──
      const creds = credsRes.status === 'fulfilled' ? credsRes.value : null;
      const dbPass: string = (creds?.success && creds?.password) ? creds.password : '';

      if (dbPass) {
        // Caso A: clave ya guardada en DB → mostrarla
        setLoadedPass(dbPass);
        setNewPass(dbPass);
      } else if (mikrotikPass) {
        // Caso B: no está en DB pero MikroTik la tiene → mostrarla Y guardarla
        setNewPass(mikrotikPass);
        try {
          const saveRes = await fetchWithTimeout(`${API_BASE_URL}/api/node/creds/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pppUser, pppPassword: mikrotikPass }),
          }, 5_000).then(r => r.json());
          if (saveRes.success) {
            setLoadedPass(mikrotikPass);   // marcar como sincronizada
          }
        } catch { /* silencioso si falla el guardado */ }
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

  /** Guarda la contraseña SOLO en la base de datos local, sin tocar MikroTik */
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
    } catch { /* silencioso */ }
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
      // Si cambió la contraseña y el update fue exitoso, guardar en DB local
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !saving && !result && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Pencil className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Editar Nodo — {node.nombre_nodo}</p>
              <p className="text-[10px] text-indigo-200 mt-0.5">{node.nombre_vrf}</p>
            </div>
          </div>
          {!saving && !result && (
            <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Resultado */}
          {result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                {result.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm font-bold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {result.success ? 'Nodo actualizado' : 'Error al actualizar'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{result.message}</p>
                </div>
              </div>
              <StepResultList steps={result.steps} failedAt={result.failedAt} visible={visibleSteps} />
              <button onClick={() => result.success ? onSuccess(labelChanged ? newLabel.trim() : undefined) : onClose()}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
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

              {/* Info readonly */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Nodo', v: node.nombre_nodo },
                  { l: 'VRF', v: node.nombre_vrf || '—' },
                  { l: 'Interfaz SSTP', v: node.nombre_vrf?.replace(/^VRF-/, 'VPN-SSTP-') || '—' },
                  { l: 'IP Túnel actual', v: currentRemoteIP || node.ip_tunnel || '—' },
                ].map(row => (
                  <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                    <p className="text-xs font-mono font-bold text-slate-600 truncate">{row.v}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Campos editables</p>

                {/* Nombre / Etiqueta del nodo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre / Etiqueta del nodo</label>
                  <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                    placeholder={node.nombre_nodo || ''}
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300
                      ${labelChanged ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} />
                  {labelChanged && <p className="text-[10px] text-amber-600 mt-0.5">Cambiará de <span className="font-mono font-bold">{node.nombre_nodo}</span> a <span className="font-mono font-bold">{newLabel}</span></p>}
                </div>

                {/* Usuario PPP */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Usuario PPP</label>
                  <input value={newPppUser} onChange={e => setNewPppUser(e.target.value)}
                    placeholder={node.ppp_user || ''}
                    autoComplete="off"
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300
                      ${pppUserChanged ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} />
                  {pppUserChanged && <p className="text-[10px] text-amber-600 mt-0.5">Cambiará de <span className="font-mono font-bold">{node.ppp_user}</span> a <span className="font-mono font-bold">{newPppUser}</span></p>}
                </div>

                {/* Contraseña */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">Contraseña PPP</label>
                    {passChanged && (
                      <span className="text-[10px] text-amber-600 font-medium">Se actualizará en MikroTik al guardar</span>
                    )}
                  </div>
                  {/* Inputs trampa: evitan que Chrome/Edge autorrellene el campo real */}
                  <input type="text"     style={{ display: 'none' }} aria-hidden="true" readOnly tabIndex={-1} />
                  <input type="password" style={{ display: 'none' }} aria-hidden="true" readOnly tabIndex={-1} />
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      placeholder="Contraseña actual del nodo"
                      autoComplete="new-password"
                      name={`ppp-pass-${node.ppp_user}`}
                      className={`w-full px-3 py-2 pr-24 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                        ${newPass && newPass !== loadedPass ? 'border-amber-300 focus:ring-amber-300 bg-amber-50' : 'border-slate-200 focus:ring-indigo-300'}`} />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button onClick={() => setShowPass(v => !v)} title={showPass ? 'Ocultar' : 'Ver'}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
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
                  {/* Estado de la contraseña */}
                  {!loadingDetails && (
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      {!loadedPass ? (
                        <p className="text-[10px] text-slate-400">
                          Sin contraseña en DB local — ingrésala y pulsa <span className="font-bold">Guardar en DB</span>
                        </p>
                      ) : newPass === loadedPass ? (
                        <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Sincronizada con DB local
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-600">Modificada — guarda para actualizar</p>
                      )}

                      {/* Botón guardar solo en DB (sin tocar MikroTik) */}
                      {newPass.trim() && newPass !== loadedPass && (
                        <button onClick={handleSavePassToDb} disabled={savingPassDb}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors shrink-0
                            bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
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

                {/* IP Túnel remota */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">IP Túnel remota (PPP remote-address)</label>
                  <input value={newRemote} onChange={e => setNewRemote(e.target.value)}
                    placeholder={currentRemoteIP || '10.10.250.xxx'}
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                      ${newRemote && !IPV4_RE.test(newRemote.trim()) ? 'border-rose-300 focus:ring-rose-300' : remoteChanged ? 'border-amber-300 bg-amber-50' : 'border-slate-200 focus:ring-indigo-300'}`} />
                  {remoteChanged && <p className="text-[10px] text-amber-600 mt-0.5">Cambiará de <span className="font-mono font-bold">{currentRemoteIP}</span> a <span className="font-mono font-bold">{newRemote}</span></p>}
                </div>
              </div>

              {/* Subnets actuales */}
              {node.nombre_vrf && (
                <>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Redes LAN actuales {loadingDetails && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </p>
                    {currentSubnets.length === 0 && !loadingDetails && (
                      <p className="text-xs text-slate-400 italic">Sin subnets detectadas</p>
                    )}
                    <div className="space-y-1.5">
                      {currentSubnets.map(s => (
                        <div key={s} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors
                          ${removeSet.has(s) ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200 hover:border-rose-200'}`}
                          onClick={() => toggleRemove(s)}>
                          <span className={`font-mono font-bold ${removeSet.has(s) ? 'text-rose-600 line-through' : 'text-slate-700'}`}>{s}</span>
                          <span className={`text-[10px] font-bold ${removeSet.has(s) ? 'text-rose-500' : 'text-slate-400'}`}>
                            {removeSet.has(s) ? 'Eliminar' : 'Clic para eliminar'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Agregar subnets */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agregar redes LAN</p>
                      <button onClick={() => setAddSubnets(p => [...p, ''])}
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
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
                                ${conflict ? 'border-rose-400 focus:ring-rose-300 bg-rose-50' : s && !valid ? 'border-rose-300 focus:ring-rose-300' : 'border-slate-200 focus:ring-indigo-300'}`} />
                            {addSubnets.length > 1 && (
                              <button onClick={() => setAddSubnets(p => p.filter((_, j) => j !== i))}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
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
                          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs">
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
              <p className="text-sm font-semibold text-slate-600">Aplicando cambios en MikroTik…</p>
            </div>
          )}
        </div>

        {!saving && !result && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={!hasChanges}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white
                hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-500/25">
              <CheckCircle2 className="w-4 h-4" /><span>Guardar cambios</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── Modal Nuevo Administrador (WireGuard) ──────────────────────────────────
function NuevoAdminModal({
  peers,
  onClose,
  onSuccess,
}: {
  peers: WgPeer[];
  onClose: () => void;
  onSuccess: (newPeer: WgPeer) => void;
}) {
  const { credentials } = useVpn();
  const [name, setName] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ assignedIP: string; message: string } | null>(null);

  const usedIPs = peers
    .map(p => p.allowedAddress)
    .filter(a => a.startsWith('192.168.21.'))
    .map(a => parseInt(a.split('.')[3]))
    .filter(n => !isNaN(n));
  const maxIP = usedIPs.length > 0 ? Math.max(...usedIPs) : 19;
  const nextIP = `192.168.21.${maxIP + 1}`;

  const handleCreate = async () => {
    if (!credentials || !pubKey.trim()) return;
    setSaving(true);
    setError('');
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/wireguard/peer/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass, name: name.trim() || 'Admin', publicKey: pubKey.trim() }),
      }, 15_000);
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Error al crear');
      setResult({ assignedIP: d.assignedIP, message: d.message });
      onSuccess({ id: '', name: name.trim() || 'Admin', allowedAddress: d.assignedIP, publicKey: pubKey.trim(), lastHandshakeSecs: null, active: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-bold text-white">Nuevo Administrador</p>
          </div>
          {!saving && !result && (
            <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">Administrador creado</p>
                  <p className="text-xs text-slate-500 mt-0.5">{result.message}</p>
                  <p className="text-xs font-mono font-bold text-indigo-600 mt-1">IP asignada: {result.assignedIP}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">Configura el cliente WireGuard con esta IP y conecta para activarlo.</p>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
                <p className="text-xs text-indigo-600 font-medium">IP asignada automáticamente: <span className="font-mono font-bold">{nextIP}</span></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del administrador</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Laptop Victor, Celular Office"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Clave pública WireGuard <span className="text-rose-500">*</span></label>
                <textarea value={pubKey} onChange={e => setPubKey(e.target.value)} rows={3}
                  placeholder="Pega aquí la Public Key del cliente WireGuard"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono resize-none" />
                <p className="text-[10px] text-slate-400 mt-0.5">Se obtiene en el cliente WireGuard → Interface → Public Key</p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={!pubKey.trim() || saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{saving ? 'Creando...' : 'Crear administrador'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal Script de Configuración ─────────────────────────────────────────
function ScriptModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  const { credentials } = useVpn();
  const [serverIP, setServerIP] = useState(() => localStorage.getItem('server_public_ip') || localStorage.getItem('wg_endpoint_ip') || credentials?.ip || '');
  const [pppPass, setPppPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loadingPass, setLoadingPass] = useState(true);

  // Intentar recuperar la contraseña guardada al abrir
  useEffect(() => {
    if (!node.ppp_user) { setLoadingPass(false); return; }
    fetchWithTimeout(`${API_BASE_URL}/api/node/creds/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pppUser: node.ppp_user }),
    }, 5_000)
      .then(r => r.json())
      .then(d => { if (d.success && d.pppPassword) setPppPass(d.pppPassword); })
      .catch(() => { })
      .finally(() => setLoadingPass(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.ppp_user]);

  const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
  const canGenerate = IPV4_RE.test(serverIP.trim()) && !!pppPass.trim();

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setScript('');
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pppUser: node.ppp_user,
          pppPassword: pppPass,
          serverPublicIP: serverIP.trim(),
        }),
      }, 10_000);
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Error al generar');
      setScript(d.script);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-emerald-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <FileCode className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Script de Configuración</p>
              <p className="text-[10px] text-emerald-200 mt-0.5">{node.nombre_nodo} — {node.ppp_user}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-300 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {[
              { l: 'Nodo', v: node.nombre_nodo },
              { l: 'Usuario PPP', v: node.ppp_user },
              { l: 'IP Túnel', v: node.ip_tunnel || '—' },
              { l: 'VRF', v: node.nombre_vrf || '—' },
            ].map(row => (
              <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                <p className="font-mono font-bold text-slate-600 truncate">{row.v}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                IP pública del servidor VPN <span className="text-rose-500">*</span>
                <span className="ml-1 text-[10px] font-normal text-slate-400">(guardada globalmente para todos los nodos)</span>
              </label>
              <input value={serverIP} onChange={e => {
                setServerIP(e.target.value);
                localStorage.setItem('server_public_ip', e.target.value.trim());
                fetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: e.target.value.trim() }) }).catch(() => { });
              }}
                placeholder="Ej: 213.173.36.232"
                className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                  ${serverIP && !IPV4_RE.test(serverIP.trim()) ? 'border-rose-300 focus:ring-rose-300' : 'border-slate-200 focus:ring-emerald-300'}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                Contraseña PPP <span className="text-rose-500">*</span>
                {loadingPass && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                {!loadingPass && pppPass && <span className="text-[10px] font-normal text-emerald-600">(recuperada automáticamente)</span>}
              </label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={pppPass} onChange={e => setPppPass(e.target.value)}
                  placeholder={loadingPass ? 'Cargando…' : 'Contraseña del túnel SSTP'}
                  className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                <button onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {script && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Script generado</p>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="bg-slate-900 rounded-xl p-4 text-[11px] text-emerald-400 font-mono overflow-x-auto whitespace-pre max-h-64 overflow-y-auto">
                {script}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
            Cerrar
          </button>
          <button onClick={handleGenerate} disabled={!canGenerate || loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white
              hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-500/25">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            <span>{loading ? 'Generando...' : script ? 'Regenerar' : 'Generar Script'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Toast simple ─────────────────────────────────────────────────────────
interface Toast { id: number; text: string; type: 'warn' | 'info'; }

// ── Modal Historial ───────────────────────────────────────────────────────
function HistoryModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  const [history, setHistory] = useState<{ event: string; timestamp: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/node/history/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pppUser: node.ppp_user }),
    }).then(r => r.json()).then(d => { if (d.success) setHistory(d.history || []); })
      .catch(() => { }).finally(() => setLoading(false));
  }, [node.ppp_user]);

  const fmt = (ts: number) => new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-sky-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <History className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Historial — {node.nombre_nodo}</p>
              <p className="text-[10px] text-sky-200">{node.ppp_user}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-sky-300 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading && <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>}
          {!loading && history.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">Sin eventos registrados aún.</p>
          )}
          {!loading && history.length > 0 && (
            <div className="space-y-2">
              {history.map((h, i) => {
                const cfg: Record<string, { dot: string; label: string; row: string; text: string }> = {
                  connected:          { dot: 'bg-emerald-500', label: 'Conectado VPN',       row: 'bg-emerald-50 border-emerald-100',  text: 'text-emerald-700' },
                  disconnected:       { dot: 'bg-rose-500',    label: 'Desconectado VPN',    row: 'bg-rose-50 border-rose-100',        text: 'text-rose-700'    },
                  tunnel_activated:   { dot: 'bg-sky-500',     label: 'Túnel activado',      row: 'bg-sky-50 border-sky-100',          text: 'text-sky-700'     },
                  tunnel_deactivated: { dot: 'bg-amber-500',   label: 'Túnel desactivado',   row: 'bg-amber-50 border-amber-100',      text: 'text-amber-700'   },
                };
                const c = cfg[h.event] ?? { dot: 'bg-slate-400', label: h.event, row: 'bg-slate-50 border-slate-100', text: 'text-slate-600' };
                return (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${c.row}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                    <span className={`font-bold ${c.text}`}>{c.label}</span>
                    <span className="text-slate-400 ml-auto font-mono">{fmt(h.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de Tags ─────────────────────────────────────────────────────────
function TagModal({ node, currentTags, onSave, onClose }: {
  node: NodeInfo;
  currentTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [input, setInput] = useState('');
  const TAG_PALETTE = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b'];
  const getColor = (tag: string) => TAG_PALETTE[tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length];

  const addTag = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-amber-500 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Tag className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-bold text-white">Etiquetas — {node.nombre_nodo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-amber-200 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Nueva etiqueta (Enter para agregar)"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <button onClick={addTag} disabled={!input.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {tags.length === 0 && <p className="text-xs text-slate-400 italic">Sin etiquetas</p>}
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: getColor(t) }}>
                {t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:opacity-70">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
            <button onClick={() => { onSave(tags); onClose(); }}
              className="flex-1 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Batch CSV ───────────────────────────────────────────────────────
function BatchCsvModal({ onClose, onSuccess, nodes }: { onClose: () => void; onSuccess: () => void; nodes: NodeInfo[] }) {
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
        // Get next node number
        const nextRes = await fetch(`${API_BASE_URL}/api/node/next`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
        }).then(r => r.json());
        if (!nextRes.success) throw new Error(nextRes.message || 'Error obteniendo número de nodo');
        const nameClean = row.nombre.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const provRes = await fetch(`${API_BASE_URL}/api/node/provision`, {
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
          // Save creds
          fetch(`${API_BASE_URL}/api/node/creds/save`, {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !processing && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-violet-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Download className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">CSV — Nodos</p>
              <p className="text-[10px] text-violet-200">Importar para provisionar · Exportar inventario actual</p>
            </div>
          </div>
          {!processing && <button onClick={onClose} className="p-1.5 text-violet-300 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {(['import', 'export'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors
                ${tab === t ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50' : 'text-slate-400 hover:text-slate-600'}`}>
              {t === 'import' ? 'Importar / Provisionar' : `Exportar (${nodes.length} nodos)`}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {tab === 'export' && (
            <div className="space-y-4">
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">Columnas exportadas</p>
                <p className="text-[11px] text-slate-500 font-mono">nombre_nodo, ppp_user, vrf, red_lan, ip_tunel, estado</p>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {nodes.map(n => (
                  <div key={n.ppp_user} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${n.running ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="font-bold text-slate-700 truncate max-w-[120px]">{n.nombre_nodo}</span>
                    <span className="text-slate-400 font-mono truncate flex-1">{n.ppp_user}</span>
                    <span className="text-sky-600 font-mono">{(n.lan_subnets?.[0] || n.segmento_lan) || '—'}</span>
                  </div>
                ))}
                {nodes.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Sin nodos cargados</p>}
              </div>
              <button onClick={handleExport} disabled={nodes.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40">
                <Download className="w-4 h-4" /><span>Descargar CSV ({nodes.length} nodos)</span>
              </button>
            </div>
          )}
          {tab === 'import' && !processing && !done && (
            <>
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">Ejemplo de formato CSV</p>
                <pre className="text-[11px] text-slate-600 font-mono">ROSMERY,TorreRosmery,Pass123,10.3.0.0/24{'\n'}FIWIS,TorreFiwis,Pass456,10.4.0.0/24,10.5.0.0/24</pre>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 hover:bg-violet-100 cursor-pointer transition-colors text-sm text-violet-600 font-medium flex-1 justify-center">
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
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 font-mono resize-none" />
              {rows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rows.filter(r => r.valid).length}/{rows.length} filas válidas</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {rows.map((r, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${r.valid ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${r.valid ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                          {r.valid ? '✓' : '✗'}
                        </span>
                        <span className="font-bold text-slate-700">{r.nombre || '(sin nombre)'}</span>
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
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progreso de provisionamiento</p>
              {results.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs
                  ${r.status === 'ok' ? 'bg-emerald-50 border-emerald-100' : r.status === 'error' ? 'bg-rose-50 border-rose-100' : r.status === 'processing' ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                    ${r.status === 'ok' ? 'bg-emerald-500 text-white' : r.status === 'error' ? 'bg-rose-500 text-white' : r.status === 'processing' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {r.status === 'ok' ? '✓' : r.status === 'error' ? '✗' : r.status === 'processing' ? <Loader2 className="w-3 h-3 animate-spin" /> : i + 1}
                  </span>
                  <span className="font-bold text-slate-700">{r.nombre}</span>
                  {r.message && <span className="text-slate-400 text-[10px] truncate">{r.message}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
          {tab === 'export' ? (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cerrar</button>
          ) : !done ? (
            <>
              <button onClick={onClose} disabled={processing} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40">Cancelar</button>
              <button onClick={handleProvision} disabled={rows.filter(r => r.valid).length === 0 || processing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{processing ? 'Provisionando...' : `Provisionar ${rows.filter(r => r.valid).length} nodos`}</span>
              </button>
            </>
          ) : (
            <button onClick={() => { onSuccess(); onClose(); }}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors">
              Listo — Actualizar tabla
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NodeAccessPanel() {
  const {
    credentials,
    nodes, setNodes,
    activeNodeVrf,
    tunnelExpiry, setTunnelExpiry,
    adminIP, setAdminIP,
    deactivateAllNodes,
    removeNodeFromState,
  } = useVpn();

  // Si ya hay nodos en contexto (persistidos) mostramos directo sin necesidad de recargar
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(nodes.length > 0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'default' | 'connected' | 'disconnected'>('default');
  const [globalServerIP, setGlobalServerIP] = useState(() => localStorage.getItem('server_public_ip') || '');
  const [editingGlobalIP, setEditingGlobalIP] = useState(false);
  const [showNuevoNodo, setShowNuevoNodo] = useState(false);
  const [showBatchCsv, setShowBatchCsv] = useState(false);
  const [editNode, setEditNode] = useState<NodeInfo | null>(null);
  const [deleteNode, setDeleteNode] = useState<NodeInfo | null>(null);
  const [scriptNode, setScriptNode] = useState<NodeInfo | null>(null);
  const [historyNode, setHistoryNode] = useState<NodeInfo | null>(null);
  const [tagNode, setTagNode] = useState<NodeInfo | null>(null);
  const [nodeTags, setNodeTags] = useState<Record<string, string[]>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showRenewalWarn, setShowRenewalWarn] = useState(false);
  const prevRunningRef = useRef<Record<string, boolean>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tagsLoadedRef = useRef(false);

  // WireGuard admin peers
  const [wgPeers, setWgPeers] = useState<WgPeer[]>([]);
  const [loadingWg, setLoadingWg] = useState(false);
  const [showNuevoAdmin, setShowNuevoAdmin] = useState(false);
  const [peersExpanded, setPeersExpanded] = useState(false);
  const [serverPublicKey, setServerPublicKey] = useState('');
  const [serverListenPort, setServerListenPort] = useState('');
  const [serverEndpointIP, setServerEndpointIP] = useState(() => localStorage.getItem('wg_endpoint_ip') || '');
  const [copiedPeerId, setCopiedPeerId] = useState<string | null>(null);
  const [peerColors, setPeerColors] = useState<Record<string, string>>({});
  const [colorPickerAddr, setColorPickerAddr] = useState<string | null>(null);
  const [editingPeerId, setEditingPeerId] = useState<string | null>(null);
  const [editingPeerName, setEditingPeerName] = useState('');
  const [savingPeerName, setSavingPeerName] = useState(false);
  const wgLoadedRef = useRef(false);

  const PEER_COLOR_PALETTE = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b'];

  const addToast = useCallback((text: string, type: Toast['type'] = 'warn') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5500);
  }, []);

  const fetchNodes = useCallback(async () => {
    if (!credentials) return null;
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
    }, 20_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data as NodeInfo[] : null;
  }, [credentials]);

  const handleLoadNodes = async () => {
    if (!credentials) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const nodeList = await fetchNodes();
      if (!nodeList) throw new Error('Respuesta inválida del servidor');
      // Inicializar estado previo de running para el polling
      nodeList.forEach(n => { prevRunningRef.current[n.ppp_user] = n.running; });
      setNodes(nodeList);
      setHasLoaded(true);
    } catch (err: unknown) {
      setErrorMsg(`Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Polling silencioso cada 60s — detecta desconexiones
  const pollErrorCountRef = useRef(0);
  const silentPoll = useCallback(async () => {
    try {
      const nodeList = await fetchNodes();
      if (!nodeList) return;
      pollErrorCountRef.current = 0; // reset contador de errores al tener éxito
      const disconnected = nodeList.filter(n => prevRunningRef.current[n.ppp_user] === true && !n.running);
      const reconnected = nodeList.filter(n => prevRunningRef.current[n.ppp_user] === false && n.running);
      nodeList.forEach(n => { prevRunningRef.current[n.ppp_user] = n.running; });
      setNodes(nodeList);
      disconnected.forEach(n => {
        addToast(`${n.nombre_nodo} se desconectó del VPN`, 'warn');
        fetch(`${API_BASE_URL}/api/node/history/add`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: n.ppp_user, event: 'disconnected' }),
        }).catch(() => { });
      });
      reconnected.forEach(n => {
        fetch(`${API_BASE_URL}/api/node/history/add`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pppUser: n.ppp_user, event: 'connected' }),
        }).catch(() => { });
      });
    } catch {
      pollErrorCountRef.current += 1;
      // Avisar al usuario después de 2 fallos consecutivos (2 min sin respuesta)
      if (pollErrorCountRef.current === 2) {
        addToast('Sin respuesta del router — verifica que WireGuard esté activo', 'warn');
      }
    }
  }, [fetchNodes, setNodes, addToast]);

  // Iniciar polling cuando hay nodos cargados
  useEffect(() => {
    if (!hasLoaded || !credentials) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(silentPoll, 60_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [hasLoaded, credentials, silentPoll]);

  // Alerta de renovación cuando quedan < 2 min
  useEffect(() => {
    if (!tunnelExpiry) { setShowRenewalWarn(false); return; }
    const check = () => {
      const rem = tunnelExpiry - Date.now();
      setShowRenewalWarn(rem > 0 && rem < 2 * 60 * 1000);
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [tunnelExpiry]);

  // Cargar tags al montar
  useEffect(() => {
    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true;
      fetch(`${API_BASE_URL}/api/node/tags`)
        .then(r => r.json())
        .then(d => { if (d.success) setNodeTags(d.tags || {}); })
        .catch(() => { });
    }
  }, []);

  // Cargar IP del servidor SSTP desde la base de datos al iniciar
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings/get`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings?.server_public_ip) {
          const ip = d.settings.server_public_ip;
          setGlobalServerIP(ip);
          localStorage.setItem('server_public_ip', ip);
        }
      })
      .catch(() => { });
  }, []);

  const saveNodeTags = (pppUser: string, tags: string[]) => {
    setNodeTags(prev => ({ ...prev, [pppUser]: tags }));
    fetch(`${API_BASE_URL}/api/node/tag/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pppUser, tags }),
    }).catch(() => { });
  };

  const exportCsv = () => {
    const header = 'Nombre,VRF,Red LAN,IP Túnel,Usuario PPP,Estado';
    const csvRows = nodes.map(n => [
      `"${n.nombre_nodo}"`, n.nombre_vrf || '',
      `"${(n.lan_subnets?.join(';') || n.segmento_lan || '')}"`,
      n.ip_tunnel || '', n.ppp_user,
      n.running ? 'Conectado' : 'Desconectado',
    ].join(','));
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nodos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleRevokeAll = async () => {
    setIsRevoking(true);
    await deactivateAllNodes();
    setIsRevoking(false);
  };

  const loadWgPeers = useCallback(async () => {
    if (!credentials) return;
    setLoadingWg(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/wireguard/peers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
      }, 10_000);
      const d = await r.json();
      if (d.success) {
        setWgPeers(d.peers || []);
        if (d.serverPublicKey) setServerPublicKey(d.serverPublicKey);
        if (d.serverListenPort) setServerListenPort(String(d.serverListenPort));
        // Preferir IP pública del router (desde /ip/cloud), luego localStorage, luego credentials.ip
        const publicIP = d.serverPublicIP || '';
        if (publicIP && publicIP !== serverEndpointIP) {
          setServerEndpointIP(publicIP);
          localStorage.setItem('wg_endpoint_ip', publicIP);
        } else if (!serverEndpointIP) {
          const saved = localStorage.getItem('wg_endpoint_ip') || '';
          if (saved) setServerEndpointIP(saved);
        }
      }
    } catch (_) { /* silencioso */ }
    setLoadingWg(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials]);

  // Cargar peers WireGuard y colores al montar o cuando se obtienen credenciales
  useEffect(() => {
    if (credentials && !wgLoadedRef.current) {
      wgLoadedRef.current = true;
      loadWgPeers();
      fetch(`${API_BASE_URL}/api/wireguard/peer/colors`)
        .then(r => r.json())
        .then(d => { if (d.success) setPeerColors(d.colors || {}); })
        .catch(() => { });
    }
  }, [credentials, loadWgPeers]);

  const savePeerColor = (peerAddress: string, color: string) => {
    setPeerColors(prev => ({ ...prev, [peerAddress]: color }));
    setColorPickerAddr(null);
    fetch(`${API_BASE_URL}/api/wireguard/peer/color/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerAddress, color }),
    }).catch(() => { });
  };

  const savePeerName = async (peer: WgPeer) => {
    if (!credentials || !editingPeerName.trim() || savingPeerName) return;
    setSavingPeerName(true);
    try {
      await fetchWithTimeout(`${API_BASE_URL}/api/wireguard/peer/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass, peerId: peer.id, newName: editingPeerName.trim() }),
      }, 10_000);
      setWgPeers(prev => prev.map(p => p.id === peer.id ? { ...p, name: editingPeerName.trim() } : p));
      setEditingPeerId(null);
    } catch (_) { /* silencioso */ }
    setSavingPeerName(false);
  };

  // Auto-seleccionar adminIP si hay exactamente un peer activo
  useEffect(() => {
    const active = wgPeers.filter(p => p.active);
    if (active.length === 1 && !active.find(p => p.allowedAddress === adminIP)) {
      setAdminIP(active[0].allowedAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wgPeers]);

  const copyWgConfig = (peer: WgPeer) => {
    const endpoint = serverEndpointIP && serverListenPort
      ? `${serverEndpointIP}:${serverListenPort}`
      : `<ENDPOINT_SERVIDOR>`;
    const config = [
      '[Interface]',
      'PrivateKey = <TU_CLAVE_PRIVADA>',
      `Address = ${peer.allowedAddress}/32`,
      'DNS = 8.8.8.8',
      '',
      '[Peer]',
      `PublicKey = ${serverPublicKey || '<CLAVE_PUBLICA_SERVIDOR>'}`,
      'AllowedIPs = 0.0.0.0/0',
      `Endpoint = ${endpoint}`,
    ].join('\n');
    navigator.clipboard.writeText(config).then(() => {
      setCopiedPeerId(peer.id);
      setTimeout(() => setCopiedPeerId(null), 2500);
    });
  };

  const connectedNodes = nodes.filter(n => n.running);
  const disconnectedNodes = nodes.filter(n => !n.running);
  const nodesWithVrf = nodes.filter(n => !!n.nombre_vrf);
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;

  const q = search.trim().toLowerCase();
  const baseNodes = q
    ? nodes.filter(n =>
      n.nombre_nodo?.toLowerCase().includes(q) ||
      n.nombre_vrf?.toLowerCase().includes(q) ||
      n.segmento_lan?.toLowerCase().includes(q) ||
      n.ppp_user?.toLowerCase().includes(q)
    )
    : nodes;
  const filteredNodes = sortMode === 'connected'
    ? [...baseNodes].sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0))
    : sortMode === 'disconnected'
      ? [...baseNodes].sort((a, b) => (a.running ? 1 : 0) - (b.running ? 1 : 0))
      : baseNodes;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Radio className="w-5 h-5 text-indigo-500" />
            <span>Acceso a Nodos VRF</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Abre acceso a APs y CPEs remotos mediante enrutamiento VRF
          </p>
          {/* IP global del servidor SSTP */}
          <div className="flex items-center gap-1.5 mt-2">
            <Globe className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-400 font-medium">Servidor SSTP:</span>
            {editingGlobalIP ? (
              <input
                value={globalServerIP}
                onChange={e => setGlobalServerIP(e.target.value)}
                onBlur={() => {
                  const ip = globalServerIP.trim();
                  localStorage.setItem('server_public_ip', ip);
                  fetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: ip }) }).catch(() => { });
                  setEditingGlobalIP(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const ip = globalServerIP.trim();
                    localStorage.setItem('server_public_ip', ip);
                    fetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: ip }) }).catch(() => { });
                    setEditingGlobalIP(false);
                  }
                  if (e.key === 'Escape') { setGlobalServerIP(localStorage.getItem('server_public_ip') || ''); setEditingGlobalIP(false); }
                }}
                placeholder="Ej: 213.173.36.232"
                className="px-2 py-0.5 text-[11px] font-mono border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36"
                autoFocus
              />
            ) : (
              <button onClick={() => setEditingGlobalIP(true)} className="flex items-center gap-1 group">
                <span className={`text-[11px] font-mono font-semibold ${globalServerIP ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                  {globalServerIP || 'Sin configurar'}
                </span>
                <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowNuevoNodo(true)}
            className="px-4 py-2.5 flex items-center space-x-2 rounded-xl text-sm font-bold
                       bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Nodo</span>
          </button>
          <button
            onClick={() => setShowBatchCsv(true)}
            title="Provisionar múltiples nodos desde CSV"
            className="px-4 py-2.5 flex items-center space-x-2 rounded-xl text-sm font-bold
                       bg-violet-500 hover:bg-violet-600 text-white shadow-md shadow-violet-500/25 transition-all active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleLoadNodes}
            disabled={isLoading}
            className="btn-primary px-6 py-3 flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Cargando...' : hasLoaded ? 'Actualizar Nodos' : 'Cargar Nodos'}</span>
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div className="card p-4 flex items-start space-x-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* ── Túnel activo ── */}
      {activeNodeVrf && (
        <>
          <div className="card p-4 border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Acceso abierto: <span className="text-emerald-600">{activeNodeName}</span>
                </p>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-xs text-slate-500 font-mono">{activeNodeVrf}</span>
                  {tunnelExpiry && (
                    <span className="text-xs font-bold text-amber-600 flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <CountdownDisplay expiry={tunnelExpiry} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showRenewalWarn && (
                <button onClick={() => setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/30 animate-pulse transition-all">
                  <Bell className="w-3.5 h-3.5" />
                  <span>Renovar acceso</span>
                </button>
              )}
              <button
                onClick={handleRevokeAll}
                disabled={isRevoking}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl
                           shadow-md shadow-rose-500/25 active:scale-[0.98] transition-all flex items-center space-x-2"
              >
                <ShieldOff className="w-4 h-4" />
                <span>{isRevoking ? 'Revocando...' : 'Revocar Todo'}</span>
              </button>
            </div>
          </div>
          {showRenewalWarn && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
              <Bell className="w-3.5 h-3.5 animate-pulse shrink-0" />
              <span>El acceso expirará en menos de 2 minutos. Haz clic en "Renovar acceso" para extenderlo 30 minutos más sin interrumpir la conexión.</span>
            </div>
          )}
        </>
      )}

      {/* ── Admin IP (WireGuard peers) ── */}
      <div className="card p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">IP Administrador</span>
            {wgPeers.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                {wgPeers.filter(p => p.active).length}/{wgPeers.length} activos
              </span>
            )}
            {loadingWg && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={loadWgPeers} disabled={loadingWg} title="Actualizar lista"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWg ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowNuevoAdmin(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-colors">
              <UserPlus className="w-3 h-3" /><span>Nuevo</span>
            </button>
            {wgPeers.length > 0 && (
              <button onClick={() => setPeersExpanded(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors">
                <span>{peersExpanded ? 'Contraer' : 'Ver todos'}</span>
                <span className={`transition-transform ${peersExpanded ? 'rotate-180' : ''}`}>▾</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsed: active peer selector buttons with color */}
        {!peersExpanded && (
          <div className="flex items-center flex-wrap gap-2 mt-3">
            {wgPeers.filter(p => p.active).length === 0 && !loadingWg && (
              <span className="text-xs text-slate-400 italic">No hay administradores activos en este momento</span>
            )}
            {wgPeers.filter(p => p.active).map(peer => {
              const color = peerColors[peer.allowedAddress];
              const isSelected = adminIP === peer.allowedAddress;
              return (
                <button key={peer.id} onClick={() => setAdminIP(peer.allowedAddress)}
                  style={color ? { borderColor: color, backgroundColor: isSelected ? color : undefined } : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border
                    ${isSelected
                      ? color ? 'text-white shadow-md' : 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25'
                      : color ? 'bg-white text-slate-700 hover:opacity-80' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                  {color
                    ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    : <Wifi className="w-3.5 h-3.5" />}
                  <span>{peer.name}</span>
                  <span className="font-mono text-[10px] opacity-70">{peer.allowedAddress}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Expanded: solo activos, con selector de color y copiar config */}
        {peersExpanded && (
          <div className="mt-4 space-y-3">
            {/* Endpoint config */}
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Endpoint servidor:</span>
              <input value={serverEndpointIP}
                onChange={e => { setServerEndpointIP(e.target.value); localStorage.setItem('wg_endpoint_ip', e.target.value); }}
                placeholder="IP pública del servidor"
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
              <span className="text-slate-400 font-bold text-xs">:</span>
              <input value={serverListenPort} onChange={e => setServerListenPort(e.target.value)}
                placeholder="Puerto"
                className="w-20 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
            </div>

            {wgPeers.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">Sin administradores configurados</p>
            )}

            {wgPeers.map(peer => {
              const color = peerColors[peer.allowedAddress];
              const showPicker = colorPickerAddr === peer.allowedAddress;
              const isEditing = editingPeerId === peer.id;
              return (
                <div key={peer.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className={`flex items-center gap-3 px-3 py-2.5 ${peer.active ? 'bg-white' : 'bg-slate-50'}`}>
                    {/* Color dot / picker trigger */}
                    <button onClick={() => { setColorPickerAddr(showPicker ? null : peer.allowedAddress); setEditingPeerId(null); }}
                      title="Cambiar color"
                      className="w-5 h-5 rounded-full shrink-0 border-2 border-white shadow ring-1 ring-slate-200 transition-transform hover:scale-110"
                      style={{ backgroundColor: color || '#94a3b8' }} />

                    {/* Nombre editable / info */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus value={editingPeerName} onChange={e => setEditingPeerName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') savePeerName(peer); if (e.key === 'Escape') setEditingPeerId(null); }}
                            className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold" />
                          <button onClick={() => savePeerName(peer)} disabled={savingPeerName}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50">
                            {savingPeerName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => setEditingPeerId(null)} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <p className={`text-xs font-bold truncate ${peer.active ? 'text-slate-700' : 'text-slate-400'}`}>{peer.name}</p>
                          <button onClick={() => { setEditingPeerId(peer.id); setEditingPeerName(peer.name); setColorPickerAddr(null); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity">
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                      <p className="font-mono text-[10px] text-slate-500">{peer.allowedAddress}</p>
                    </div>

                    {/* Estado */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0
                      ${peer.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {peer.active ? 'Activo' : 'Inactivo'}
                    </span>

                    {/* Copiar config WG */}
                    <button onClick={() => copyWgConfig(peer)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors shrink-0
                        ${copiedPeerId === peer.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'}`}>
                      {copiedPeerId === peer.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPeerId === peer.id ? '¡Copiado!' : 'Config WG'}</span>
                    </button>
                  </div>

                  {/* Color picker */}
                  {showPicker && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">Color:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PEER_COLOR_PALETTE.map(c => (
                          <button key={c} onClick={() => savePeerColor(peer.allowedAddress, c)}
                            className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                            style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                        ))}
                        {color && (
                          <button onClick={() => savePeerColor(peer.allowedAddress, '')}
                            className="text-[10px] text-slate-400 hover:text-slate-600 ml-1">✕ quitar</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Banner caché local (MikroTik offline) ── */}
      {hasLoaded && nodes.length > 0 && nodes.some(n => n.cached) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-amber-700">MikroTik no disponible</span>
            <span className="text-amber-600 ml-1.5">
              Mostrando {nodes.length} nodo{nodes.length !== 1 ? 's' : ''} desde la base de datos local.
              {nodes[0]?.last_seen ? ` Última sincronización: ${new Date(nodes[0].last_seen).toLocaleString('es', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}` : ''}
            </span>
          </div>
          <button onClick={fetchNodes}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 font-bold hover:bg-amber-200 transition-colors shrink-0">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        </div>
      )}

      {/* ── Tabla de nodos ── */}
      {hasLoaded && nodes.length > 0 && (
        <div className="card overflow-hidden">

          {/* Barra superior: stats + búsqueda + controles */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            {/* Stats inline */}
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="text-slate-400 font-medium">
                <span className="font-bold text-slate-700">{nodes.length}</span> nodos
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-emerald-600 font-semibold">
                <span className="font-bold">{connectedNodes.length}</span> conectados
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-sky-600 font-semibold">
                <span className="font-bold">{nodesWithVrf.length}</span> con VRF
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-rose-500 font-semibold">
                <span className="font-bold">{disconnectedNodes.length}</span> desconectados
              </span>
            </div>

            {/* Controles: sort + export + búsqueda */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ordenar */}
              <button onClick={() => setSortMode(m => m === 'default' ? 'connected' : m === 'connected' ? 'disconnected' : 'default')}
                title={sortMode === 'default' ? 'Orden original' : sortMode === 'connected' ? 'Conectados primero' : 'Desconectados primero'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors
                  ${sortMode !== 'default' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'}`}>
                {sortMode === 'connected' ? <SortAsc className="w-3.5 h-3.5" /> : sortMode === 'disconnected' ? <SortDesc className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
                <span>{sortMode === 'connected' ? 'Conectados' : sortMode === 'disconnected' ? 'Desconectados' : 'Ordenar'}</span>
              </button>
              {/* Exportar CSV */}
              <button onClick={exportCsv} title="Exportar inventario a CSV"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>

            {/* Búsqueda */}
            <div className="relative w-full sm:w-64">
              {/* Dummy inputs para atrapar el autofill agresivo de Chrome/Edge */}
              <input type="text" name="dummy-user" style={{display: 'none'}} />
              <input type="password" name="dummy-pass" style={{display: 'none'}} />
              
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                name="node-search-filter-off"
                autoComplete="new-password"
                placeholder="Buscar nodo, VRF, red, usuario…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs rounded-xl border border-slate-200
                           bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                           placeholder:text-slate-400 text-slate-700"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Nodo</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">VRF</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Red LAN</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">IP Túnel</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Usuario PPP</th>
                  <th className="px-4 py-4 text-right font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node, idx) => (
                  <NodeCard
                    key={node.id} node={node} rowIndex={idx}
                    onEdit={() => setEditNode(node)}
                    onDelete={() => setDeleteNode(node)}
                    onScript={() => setScriptNode(node)}
                    onRename={(newName) => setNodes(prev => prev.map(n => n.ppp_user === node.ppp_user ? { ...n, nombre_nodo: newName } : n))}
                    onHistory={() => setHistoryNode(node)}
                    onTagClick={() => setTagNode(node)}
                    tags={nodeTags[node.ppp_user] || []}
                  />
                ))}
                {filteredNodes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Sin resultados para <span className="font-mono font-bold">"{search}"</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {hasLoaded && nodes.length === 0 && !errorMsg && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin nodos SSTP</p>
          <p className="text-slate-400 text-sm">El router no tiene túneles SSTP configurados</p>
        </div>
      )}

      {/* ── Estado inicial ── */}
      {!hasLoaded && !isLoading && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Search className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin datos aún</p>
          <p className="text-slate-400 text-sm">Haz clic en "Cargar Nodos" para obtener los túneles VRF del router</p>
        </div>
      )}

      {showNuevoNodo && (
        <NuevoNodoModal
          onClose={() => setShowNuevoNodo(false)}
          onSuccess={() => { setShowNuevoNodo(false); handleLoadNodes(); }}
        />
      )}
      {deleteNode && (
        <EliminarNodoModal
          node={deleteNode}
          onClose={() => setDeleteNode(null)}
          onSuccess={(deletedDeviceIds: string[]) => {
            const pppUser = deleteNode.ppp_user;
            setDeleteNode(null);
            removeNodeFromState(pppUser);
            // Limpiar devices huérfanos de SQLite + cache IndexedDB de CPEs
            deviceDb.cleanupOrphans().catch(() => {});
            if (deletedDeviceIds.length > 0) {
              deviceDb.removeByIds(deletedDeviceIds).catch(() => {});
            }
            cpeCache.clear().catch(() => {});
          }}
        />
      )}
      {editNode && (
        <EditarNodoModal
          node={editNode}
          onClose={() => setEditNode(null)}
          onSuccess={(newLabel) => {
            if (newLabel) {
              setNodes(prev => prev.map(n => n.id === editNode.id ? { ...n, nombre_nodo: newLabel } : n));
            }
            setEditNode(null);
            handleLoadNodes();
          }}
        />
      )}
      {showNuevoAdmin && (
        <NuevoAdminModal
          peers={wgPeers}
          onClose={() => setShowNuevoAdmin(false)}
          onSuccess={(newPeer) => { setWgPeers(prev => [...prev, newPeer]); setShowNuevoAdmin(false); }}
        />
      )}
      {scriptNode && (
        <ScriptModal node={scriptNode} onClose={() => setScriptNode(null)} />
      )}
      {showBatchCsv && (
        <BatchCsvModal nodes={nodes} onClose={() => setShowBatchCsv(false)} onSuccess={() => { setShowBatchCsv(false); handleLoadNodes(); }} />
      )}
      {historyNode && (
        <HistoryModal node={historyNode} onClose={() => setHistoryNode(null)} />
      )}
      {tagNode && (
        <TagModal
          node={tagNode}
          currentTags={nodeTags[tagNode.ppp_user] || []}
          onSave={(tags) => saveNodeTags(tagNode.ppp_user, tags)}
          onClose={() => setTagNode(null)}
        />
      )}

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <div key={t.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold max-w-xs animate-in slide-in-from-right-4 duration-300
                ${t.type === 'warn' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
              <Bell className="w-4 h-4 shrink-0" />
              <span>{t.text}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-1 opacity-70 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CountdownDisplay({ expiry }: { expiry: number }) {
  const [text, setText] = useState(() => formatCountdown(expiry - Date.now()));
  useEffect(() => {
    const tick = () => setText(formatCountdown(expiry - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return <span>{text || '—'}</span>;
}
