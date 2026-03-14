import { useState } from 'react';
import {
  RefreshCw, Search, PlusCircle, CheckCircle2,
  ShieldOff, ShieldCheck, Cpu, ChevronLeft, ChevronRight,
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
      // El backend ya mapea y envía objetos compatibles con VpnSecret directamente.
      // NO re-mapear: s['.id'] sería undefined porque el backend convirtió .id → id.
      const realSecrets: VpnSecret[] = Array.isArray(data) ? (data as VpnSecret[]) : [];
      setScannedSecrets(realSecrets);
      setHasScanned(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(`Error solicitando secretos: ${msg}`);
    } finally {
      setIsScanning(false);
    }
  };

  const isManaged = (id: string, name: string) =>
    managedVpns.some((v) =>
      (id && v.id && v.id === id) || v.name === name
    );

  const handleToggleManage = (secret: VpnSecret) => {
    if (isManaged(secret.id, secret.name)) {
      // NOT(id===secret.id OR name===secret.name) = id!==secret.id AND name!==secret.name
      setManagedVpns((prev) =>
        prev.filter((v) => v.id !== secret.id && v.name !== secret.name),
      );
    } else {
      setManagedVpns((prev) => [...prev, { ...secret, running: false }]);
    }
  };

  const filteredSecrets = scannedSecrets.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalPages = Math.max(1, Math.ceil(filteredSecrets.length / PAGE_SIZE));
  const pagedSecrets = filteredSecrets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1); // Volver a página 1 al filtrar
  };

  return (
    <div className="space-y-6">
      {/* Header de acciones */}
      <div className="glassmorphism dark:glassmorphism-dark rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t-4 border-t-indigo-500">
        <div>
          <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-800 dark:text-slate-100">
            <Search className="w-5 h-5 text-indigo-500" />
            <span>Escáner /ppp secret</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Sincroniza y extrae las configuraciones PPP del router
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed group"
        >
          <RefreshCw
            className={`w-5 h-5 ${isScanning ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
          />
          <span>{isScanning ? 'ESCANEANDO...' : 'ESCANEAR VPN'}</span>
        </button>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-3xl p-4 flex items-center space-x-3 text-rose-500 text-sm font-medium animate-in slide-in-from-top-2">
          <Cpu className="w-5 h-5 flex-shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Tabla de secretos */}
      {hasScanned && (
        <div className="glassmorphism dark:glassmorphism-dark rounded-3xl overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-4">
          {/* Toolbar */}
          <div className="bg-slate-100/50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="relative w-full max-w-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Filtrar por nombre..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="ml-auto flex items-center space-x-3 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <span>
                Total en Router:{' '}
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {scannedSecrets.length}
                </span>
              </span>
              {searchTerm && (
                <span className="text-slate-400 dark:text-slate-500">
                  ({filteredSecrets.length} filtrados)
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 font-semibold w-16 text-center">Flag</th>
                  <th className="p-4 font-semibold">Nombre de Usuario</th>
                  <th className="p-4 font-semibold">Servicio</th>
                  <th className="p-4 font-semibold">Perfil</th>
                  <th className="p-4 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pagedSecrets.map((secret) => (
                  <tr
                    key={secret.id}
                    className="hover:bg-indigo-50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-4 text-center">
                      <div className="flex justify-center">
                        {secret.disabled ? (
                          <ShieldOff className="w-5 h-5 text-rose-500" aria-label="Secreto deshabilitado en RouterOS" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-emerald-500 opacity-70" aria-label="Secreto habilitado" />
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {secret.name}
                      </span>
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                          secret.service === 'sstp'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}
                      >
                        {secret.service}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        {secret.profile}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleToggleManage(secret)}
                          className={`p-2 rounded-full transition-all duration-300 ${
                            isManaged(secret.id, secret.name)
                              ? 'bg-emerald-100/50 dark:bg-emerald-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 group/btn'
                              : 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm'
                          }`}
                          title={
                            isManaged(secret.id, secret.name)
                              ? 'Remover de Gestión'
                              : 'Añadir a Gestión'
                          }
                        >
                          {isManaged(secret.id, secret.name) ? (
                            <>
                              <CheckCircle2 className="w-6 h-6 text-emerald-500 group-hover/btn:hidden" />
                              <ShieldOff className="w-6 h-6 text-rose-500 hidden group-hover/btn:block shrink-0" />
                            </>
                          ) : (
                            <PlusCircle className="w-6 h-6 shrink-0" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {pagedSecrets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">
                      {searchTerm
                        ? `No se encontraron resultados para "${searchTerm}"`
                        : 'El router no tiene secretos PPP configurados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Página {page} de {totalPages} · {filteredSecrets.length} secretos
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white min-w-[2rem] text-center">
                  {page}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado inicial (aún sin escanear) */}
      {!hasScanned && !isScanning && (
        <div className="h-64 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 space-y-3">
          <RefreshCw className="w-12 h-12 opacity-30" />
          <p className="text-sm">Haz clic en "Escanear VPN" para obtener la tabla de secretos.</p>
        </div>
      )}
    </div>
  );
}
