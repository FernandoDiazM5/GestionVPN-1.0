import { useState } from 'react';
import {
  RefreshCw, Search, PlusCircle, CheckCircle2,
  ShieldOff, ShieldCheck, ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { VpnSecret } from '../store/db';

const PAGE_SIZE = 20;

export default function ScannerModule() {
  const {
    credentials,
    managedVpns, setManagedVpns,
    scannedSecrets, setScannedSecrets,
    hasScanned, setHasScanned,
  } = useVpn();

  const [isScanning, setIsScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [page, setPage] = useState(1);

  const handleScan = async () => {
    setIsScanning(true);
    setErrorMsg('');
    setPage(1);
    try {
      const response = await fetchWithTimeout('http://localhost:3001/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: credentials?.ip,
          user: credentials?.user,
          pass: credentials?.pass,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${response.status}`);
      }
      const realSecrets: VpnSecret[] = Array.isArray(data) ? (data as VpnSecret[]) : [];
      setScannedSecrets(realSecrets);
      setHasScanned(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(`Error: ${msg}`);
    } finally {
      setIsScanning(false);
    }
  };

  const isManaged = (id: string, name: string) =>
    managedVpns.some((v) => (id && v.id && v.id === id) || v.name === name);

  const handleToggleManage = (secret: VpnSecret) => {
    if (isManaged(secret.id, secret.name)) {
      setManagedVpns((prev) => prev.filter((v) => v.id !== secret.id && v.name !== secret.name));
    } else {
      setManagedVpns((prev) => [...prev, { ...secret, running: false }]);
    }
  };

  const filteredSecrets = scannedSecrets.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredSecrets.length / PAGE_SIZE));
  const pagedSecrets = filteredSecrets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (value: string) => { setSearchTerm(value); setPage(1); };

  return (
    <div className="space-y-5">

      {/* Header card */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Search className="w-5 h-5 text-indigo-500" />
            <span>Escáner PPP Secrets</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Extrae los secretos configurados desde el router
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="btn-primary px-6 py-3 flex items-center space-x-2 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Escaneando...' : 'Escanear Router'}</span>
        </button>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="card p-4 flex items-start space-x-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Tabla */}
      {hasScanned && (
        <div className="card overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por nombre..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="input-field pl-9 py-2"
              />
            </div>
            <div className="ml-auto flex items-center space-x-3 text-sm text-slate-500">
              <span>
                <span className="font-bold text-indigo-600">{scannedSecrets.length}</span> secretos
              </span>
              <span className="text-slate-300">|</span>
              <span>
                <span className="font-bold text-emerald-600">{managedVpns.length}</span> gestionados
              </span>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30">
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-12 text-center">Estado</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Nombre</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Servicio</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Perfil</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedSecrets.map((secret) => (
                  <tr key={secret.id} className="hover:bg-indigo-50/40 transition-colors group">
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
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider
                        ${secret.service === 'sstp'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-violet-100 text-violet-700'}`}>
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
                        onClick={() => handleToggleManage(secret)}
                        className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${isManaged(secret.id, secret.name)
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-rose-100 hover:text-rose-600'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'}`}
                        title={isManaged(secret.id, secret.name) ? 'Quitar de gestión' : 'Añadir a gestión'}
                      >
                        {isManaged(secret.id, secret.name) ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /><span>Gestionado</span></>
                        ) : (
                          <><PlusCircle className="w-3.5 h-3.5" /><span>Gestionar</span></>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
                {pagedSecrets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-sm">
                      {searchTerm
                        ? `Sin resultados para "${searchTerm}"`
                        : 'El router no tiene secretos PPP configurados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
              <span className="text-xs text-slate-400">
                Página {page} de {totalPages} · {filteredSecrets.length} secretos
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white min-w-[2rem] text-center">
                  {page}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado vacío */}
      {!hasScanned && !isScanning && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Search className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin datos aún</p>
          <p className="text-slate-400 text-sm">Haz clic en "Escanear Router" para obtener los secretos PPP</p>
        </div>
      )}
    </div>
  );
}
