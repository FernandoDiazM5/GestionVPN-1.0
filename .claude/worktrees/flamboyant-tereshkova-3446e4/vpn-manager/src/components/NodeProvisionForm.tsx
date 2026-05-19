import { useState } from 'react';
import { PlusCircle, Copy, Check, Loader2, Terminal, Cpu, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { API_BASE_URL } from '../config';

interface ProvisionStep {
  step: number;
  obj: string;
  name: string;
  status: string;
}

export default function NodeProvisionForm() {
  const { credentials } = useVpn();

  const [isOpen, setIsOpen] = useState(false);
  const [nodeNumber, setNodeNumber] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [pppUser, setPppUser] = useState('');
  const [pppPassword, setPppPassword] = useState('');
  const [lanSubnet, setLanSubnet] = useState('');
  const [remoteAddress, setRemoteAddress] = useState('');
  const [protocol, setProtocol] = useState<'sstp' | 'wireguard'>('sstp');
  const [cpePublicKey, setCpePublicKey] = useState('');
  const [serverPublicKey, setWgServerPublicKey] = useState('');
  const [wgPort, setWgPort] = useState<number | null>(null);
  const [serverPublicIP, setServerPublicIP] = useState('');

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [provisionError, setProvisionError] = useState('');

  const [generatedScript, setGeneratedScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Nombres derivados
  const ifaceName = nodeNumber && nodeName
    ? `VPN-${protocol === 'wireguard' ? 'WG' : 'SSTP'}-ND${nodeNumber}-${nodeName.toUpperCase()}`
    : '';
  const vrfName = nodeNumber && nodeName
    ? `VRF-ND${nodeNumber}-${nodeName.toUpperCase()}`
    : '';

  const canProvision = !isProvisioning && nodeNumber && nodeName && lanSubnet && remoteAddress && 
    (protocol === 'wireguard' ? cpePublicKey : pppUser && pppPassword);

  const addLog = (msg: string) =>
    setProvisionLogs(prev => [...prev, msg]);

  const handleProvision = async () => {
    if (!credentials || !canProvision) return;
    setIsProvisioning(true);
    setProvisionLogs([]);
    setProvisionError('');
    setGeneratedScript('');
    setWgServerPublicKey('');
    setWgPort(null);

    addLog(`Provisionando ND${nodeNumber}-${nodeName.toUpperCase()}...`);

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/node/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials.ip,
          user: credentials.user,
          pass: credentials.pass,
          nodeNumber,
          nodeName,
          pppUser,
          pppPassword,
          lanSubnet,
          remoteAddress,
          protocol,
          cpePublicKey
        }),
      }, 30_000);

      const data = await res.json();

      if (data.steps) {
        data.steps.forEach((s: ProvisionStep) => {
          addLog(`✓ ${s.obj}: ${s.name}`);
        });
      }

      if (!res.ok || !data.success) {
        const failMsg = data.failedAt ? ` (falló en paso ${data.failedAt})` : '';
        throw new Error((data.message || 'Error desconocido') + failMsg);
      }

      addLog(`✓ Nodo ND${nodeNumber}-${nodeName.toUpperCase()} creado exitosamente`);
      
      if (protocol === 'wireguard' && data.serverPublicKey) {
        setWgServerPublicKey(data.serverPublicKey);
        setWgPort(data.wgPort);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setProvisionError(msg);
      addLog(`✗ Error: ${msg}`);
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!pppUser || !pppPassword || !lanSubnet || !serverPublicIP || !nodeName) return;
    setIsGenerating(true);
    setGeneratedScript('');

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/node/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeName, pppUser, pppPassword, lanSubnet, serverPublicIP }),
      }, 10_000);

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Error generando script');
      }
      setGeneratedScript(data.script);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setProvisionError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card overflow-hidden">

      {/* Toggle Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50 hover:from-violet-100 hover:to-indigo-100 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/25">
            <PlusCircle className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-800 text-sm">Provisionar Nuevo Nodo</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Crear VPN + VRF + Rutas automáticamente</p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="p-5 space-y-5 border-t border-slate-100">

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nº Nodo</label>
              <input
                type="number"
                min="1"
                value={nodeNumber}
                onChange={e => setNodeNumber(e.target.value)}
                placeholder="12"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nombre Nodo</label>
              <input
                value={nodeName}
                onChange={e => setNodeName(e.target.value)}
                placeholder="ETAPA12"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Protocolo</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProtocol('sstp')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    protocol === 'sstp'
                      ? 'bg-sky-50 border-sky-400 text-sky-700'
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  SSTP
                </button>
                <button
                  type="button"
                  onClick={() => setProtocol('wireguard')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    protocol === 'wireguard'
                      ? 'bg-violet-50 border-violet-400 text-violet-700'
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  WireGuard
                </button>
              </div>
            </div>
            {protocol === 'sstp' ? (
              <>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Usuario PPP</label>
                  <input
                    value={pppUser}
                    onChange={e => setPppUser(e.target.value)}
                    placeholder="TorreEtapa12"
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Contraseña PPP</label>
                  <input
                    type="password"
                    value={pppPassword}
                    onChange={e => setPppPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field w-full"
                  />
                </div>
              </>
            ) : (
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Clave Pública WireGuard del CPE</label>
                <textarea
                  value={cpePublicKey}
                  onChange={e => setCpePublicKey(e.target.value)}
                  placeholder="Pega aquí la public key del MikroTik remoto..."
                  rows={2}
                  className="w-full mt-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg resize-none focus:border-violet-400 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Obtener en el router torre: /interface/wireguard/print</p>
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Subred LAN Remota</label>
              <input
                value={lanSubnet}
                onChange={e => setLanSubnet(e.target.value)}
                placeholder="10.5.5.0/24"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">IP Remota Túnel</label>
              <input
                value={remoteAddress}
                onChange={e => setRemoteAddress(e.target.value)}
                placeholder="10.10.250.212"
                className="input-field w-full"
              />
            </div>
          </div>

          {/* Preview nombres derivados */}
          {ifaceName && (
            <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Interfaz SSTP</span>
                <p className="font-mono text-xs font-bold text-indigo-600 mt-0.5">{ifaceName}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">VRF</span>
                <p className="font-mono text-xs font-bold text-violet-600 mt-0.5">{vrfName}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button disabled={!canProvision} onClick={handleProvision}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all
                ${canProvision
                  ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/25 hover:shadow-lg active:scale-[0.98]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
              {isProvisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
              <span>{isProvisioning ? 'Creando...' : 'Crear Nodo en Servidor'}</span>
            </button>

            {/* Script generator - requires server public IP */}
            <div className="flex items-center space-x-2">
              <input
                value={serverPublicIP}
                onChange={e => setServerPublicIP(e.target.value)}
                placeholder="IP pública servidor (ej: 213.173.36.232)"
                className="input-field w-64 text-xs"
              />
              <button
                disabled={!pppUser || !pppPassword || !lanSubnet || !serverPublicIP || !nodeName || isGenerating}
                onClick={handleGenerateScript}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap
                  ${pppUser && pppPassword && lanSubnet && serverPublicIP && nodeName && !isGenerating
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 hover:shadow-lg active:scale-[0.98]'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                <span>Generar Script Nodo</span>
              </button>
            </div>
          </div>

          {/* Provision Logs */}
          {provisionLogs.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-3 max-h-[160px] overflow-y-auto">
              <div className="flex items-center space-x-1.5 mb-2">
                <Cpu className="w-3 h-3 text-slate-500" />
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Provisioning</span>
              </div>
              <div className="console-text text-emerald-400 space-y-0.5">
                {provisionLogs.map((log, i) => (
                  <div key={i} className={i === provisionLogs.length - 1 ? 'text-white' : 'text-slate-500'}>
                    › {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {provisionError && !isProvisioning && (
            <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-xs font-semibold text-rose-600">⚠ {provisionError}</p>
            </div>
          )}

          {/* Detalles post-provisión para WireGuard */}
          {serverPublicKey && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mt-2">
              <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Clave Pública del Servidor (para configurar el CPE):
              </p>
              <code className="text-[10px] font-mono text-violet-900 break-all block mb-2">{serverPublicKey}</code>
              <button
                onClick={() => navigator.clipboard.writeText(serverPublicKey)}
                className="text-[10px] text-violet-600 hover:text-violet-800 font-semibold"
              >
                Copiar
              </button>
              {wgPort && (
                <div className="mt-2 pt-2 border-t border-violet-200">
                  <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1">Listen Port</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-violet-900">{wgPort}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(String(wgPort))}
                      className="text-[10px] text-violet-600 hover:text-violet-800 font-semibold"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generated Script Output */}
          {generatedScript && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">📋 Script para el MikroTik remoto</span>
                <button onClick={handleCopy}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 text-[11px] leading-relaxed overflow-x-auto max-h-[320px] overflow-y-auto font-mono whitespace-pre">
                {generatedScript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
