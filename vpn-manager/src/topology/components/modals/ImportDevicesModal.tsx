import { useState, useMemo } from 'react';
import { X, Upload, ChevronRight, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';
import type { Device, Link, DeviceRole, DeviceType } from '../../db/tables';

interface ParsedAp {
  name: string;
  model: string;
  ip?: string;
  clients: Array<{ name: string; model: string; ip?: string }>;
}

interface ParsedPayload {
  aps: ParsedAp[];
}

function tryParseJson(raw: string): ParsedPayload | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== 'object' || obj === null) return null;
    const record = obj as Record<string, unknown>;
    if (!Array.isArray(record.aps)) return null;
    return record as unknown as ParsedPayload;
  } catch {
    return null;
  }
}

export default function ImportDevicesModal() {
  const { showImportModal, setShowImportModal } = useTopoUiStore();
  const towers = useLiveQuery(() => topologyDb.towers.toArray());

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTowerId, setSelectedTowerId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed] = useState<ParsedPayload | null>(null);
  const [checkedAps, setCheckedAps] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  // Flatten for preview
  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.aps.flatMap((ap, i) => [
      { idx: i, type: 'ap' as const, name: ap.name, model: ap.model, ip: ap.ip },
      ...ap.clients.map((c) => ({
        idx: i,
        type: 'cpe' as const,
        name: c.name,
        model: c.model,
        ip: c.ip,
      })),
    ]);
  }, [parsed]);

  if (!showImportModal) return null;

  const handleClose = () => {
    setStep(1);
    setSelectedTowerId('');
    setJsonText('');
    setParseError('');
    setParsed(null);
    setCheckedAps(new Set());
    setShowImportModal(false);
  };

  const handleParseJson = () => {
    const result = tryParseJson(jsonText);
    if (!result) {
      setParseError('JSON invalido. Formato esperado: {"aps":[{"name":"...","model":"...","clients":[...]}]}');
      return;
    }
    setParsed(result);
    setCheckedAps(new Set(result.aps.map((_, i) => i)));
    setParseError('');
    setStep(3);
  };

  const toggleAp = (idx: number) => {
    setCheckedAps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const now = Date.now();
      const towerId = selectedTowerId || null;
      const devicesToAdd: Device[] = [];
      const linksToAdd: Link[] = [];
      let totalDevices = 0;

      for (let i = 0; i < parsed.aps.length; i++) {
        if (!checkedAps.has(i)) continue;
        const ap = parsed.aps[i];
        const apId = uuidv4();

        const apDevice: Device = {
          id: apId,
          towerId,
          type: 'ap' as DeviceType,
          role: 'ap' as DeviceRole,
          name: ap.name,
          model: ap.model,
          brand: 'Ubiquiti',
          ipAddress: ap.ip,
          canvasX: 200 + i * 180,
          canvasY: 200,
          status: 'online',
          importedFrom: 'json_paste',
          createdAt: now,
          updatedAt: now,
        };
        devicesToAdd.push(apDevice);
        totalDevices++;

        const cpeIds: string[] = [];
        for (let j = 0; j < ap.clients.length; j++) {
          const cpe = ap.clients[j];
          const cpeId = uuidv4();
          cpeIds.push(cpeId);

          devicesToAdd.push({
            id: cpeId,
            towerId: null,
            type: 'cpe' as DeviceType,
            role: 'cpe' as DeviceRole,
            name: cpe.name,
            model: cpe.model,
            brand: 'Ubiquiti',
            ipAddress: cpe.ip,
            canvasX: 500 + i * 180,
            canvasY: 150 + j * 140,
            status: 'unknown',
            importedFrom: 'json_paste',
            createdAt: now,
            updatedAt: now,
          });
          totalDevices++;

          linksToAdd.push({
            id: uuidv4(),
            sourceId: apId,
            targetId: cpeId,
            linkType: 'wireless_ptmp',
            status: 'unknown',
            createdAt: now,
            updatedAt: now,
          });
        }

        if (cpeIds.length > 0) {
          await topologyDb.apCpeGroups.add({
            id: uuidv4(),
            apDeviceId: apId,
            cpeDeviceIds: cpeIds,
            expanded: true,
            updatedAt: now,
          });
        }
      }

      await topologyDb.devices.bulkAdd(devicesToAdd);
      await topologyDb.links.bulkAdd(linksToAdd);

      await topologyDb.importSessions.add({
        id: uuidv4(),
        importedAt: now,
        source: 'json_paste',
        rawPayload: jsonText,
        devicesImported: totalDevices,
        towerId: towerId ?? undefined,
      });

      handleClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-blue-500" />
            <h3 className="text-sm font-bold text-slate-800">Importar Dispositivos</h3>
          </div>
          <button onClick={handleClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-100 text-xs shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
                }`}
              >
                {step > s ? <Check size={10} /> : s}
              </span>
              <span className={step >= s ? 'text-slate-700 font-medium' : 'text-slate-400'}>
                {s === 1 ? 'Torre' : s === 2 ? 'JSON' : 'Preview'}
              </span>
              {s < 3 && <ChevronRight size={12} className="text-slate-300 mx-1" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Seleccionar torre destino
              </label>
              <select
                value={selectedTowerId}
                onChange={(e) => setSelectedTowerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin torre (nodos libres)</option>
                {towers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Pegar JSON de dispositivos
              </label>
              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setParseError('');
                }}
                placeholder='{"aps":[{"name":"AP1","model":"LTU-Rocket","clients":[{"name":"CPE1","model":"LTU-LR"}]}]}'
                className="w-full h-40 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {parseError && <p className="text-xs text-red-500">{parseError}</p>}
            </div>
          )}

          {step === 3 && parsed && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-2">
                Selecciona los APs a importar ({checkedAps.size} de {parsed.aps.length})
              </p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="px-2 py-1.5 text-left w-8"></th>
                      <th className="px-2 py-1.5 text-left">Nombre</th>
                      <th className="px-2 py-1.5 text-left">Modelo</th>
                      <th className="px-2 py-1.5 text-left">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-100 ${
                          row.type === 'cpe' ? 'bg-slate-50/50' : ''
                        }`}
                      >
                        <td className="px-2 py-1">
                          {row.type === 'ap' && (
                            <input
                              type="checkbox"
                              checked={checkedAps.has(row.idx)}
                              onChange={() => toggleAp(row.idx)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
                            />
                          )}
                        </td>
                        <td className={`px-2 py-1 font-medium ${row.type === 'cpe' ? 'pl-6 text-slate-500' : 'text-slate-700'}`}>
                          {row.name}
                        </td>
                        <td className="px-2 py-1 text-slate-500">{row.model}</td>
                        <td className="px-2 py-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              row.type === 'ap'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {row.type.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={step === 1 ? handleClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {step === 1 ? 'Cancelar' : 'Atras'}
          </button>

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Siguiente
            </button>
          )}
          {step === 2 && (
            <button
              onClick={handleParseJson}
              disabled={!jsonText.trim()}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              Parsear
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleImport}
              disabled={checkedAps.size === 0 || importing}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1"
            >
              <Upload size={12} />
              {importing ? 'Importando...' : `Importar (${checkedAps.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
