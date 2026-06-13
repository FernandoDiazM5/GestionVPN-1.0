// ============================================================
//  NodesExportMenu — dropdown del botón "Exportar" con 4 formatos
//
//  Patrón idéntico al ExportMenu de Escanear (§40): useKebabMenu +
//  createPortal + dynamic imports por formato.
// ============================================================

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, FileJson, FileSpreadsheet, FileType2, Loader2 } from 'lucide-react';
import { useKebabMenu } from '../../../../VPN/NodeCard/hooks/useKebabMenu';
import type { NodeExportRow, NodesExportMetadata } from '../../utils/nodesExportShared';

type Format = 'csv' | 'json' | 'xlsx' | 'pdf';

interface NodesExportMenuProps {
  rows: NodeExportRow[];
  meta: NodesExportMetadata;
  disabled?: boolean;
}

const ITEMS: { key: Format; label: string; hint: string; Icon: typeof FileText; colorClass: string }[] = [
  { key: 'csv',  label: 'CSV',         hint: 'Tabla simple para Excel/Sheets',  Icon: FileText,        colorClass: 'text-emerald-600' },
  { key: 'json', label: 'JSON',        hint: 'Datos estructurados + metadata',  Icon: FileJson,        colorClass: 'text-amber-600' },
  { key: 'xlsx', label: 'Excel',       hint: '.xlsx con formato profesional',   Icon: FileSpreadsheet, colorClass: 'text-emerald-700' },
  { key: 'pdf',  label: 'PDF informe', hint: 'Informe imprimible (A4)',         Icon: FileType2,       colorClass: 'text-rose-600' },
];

export function NodesExportMenu({ rows, meta, disabled }: NodesExportMenuProps) {
  const { showKebab, setShowKebab, kebabCoords, kebabRef, dropdownRef, handleKebabClick } = useKebabMenu();
  const [busyFormat, setBusyFormat] = useState<Format | null>(null);

  const run = useCallback(async (fmt: Format) => {
    if (busyFormat) return;
    setBusyFormat(fmt);
    try {
      switch (fmt) {
        case 'csv': {
          const { exportNodesToCsv } = await import('../../utils/nodesExportCsv');
          exportNodesToCsv(rows, meta);
          break;
        }
        case 'json': {
          const { exportNodesToJson } = await import('../../utils/nodesExportJson');
          exportNodesToJson(rows, meta);
          break;
        }
        case 'xlsx': {
          const { exportNodesToXlsx } = await import('../../utils/nodesExportXlsx');
          await exportNodesToXlsx(rows, meta);
          break;
        }
        case 'pdf': {
          const { exportNodesToPdf } = await import('../../utils/nodesExportPdf');
          await exportNodesToPdf(rows, meta);
          break;
        }
      }
      setShowKebab(false);
    } catch (err) {
      console.error(`[nodes-export] ${fmt} falló:`, err);
      window.alert(`No se pudo generar el archivo ${fmt.toUpperCase()}. Revisa la consola para más detalle.`);
    } finally {
      setBusyFormat(null);
    }
  }, [rows, meta, busyFormat, setShowKebab]);

  return (
    <div ref={kebabRef} className="relative">
      <button
        onClick={handleKebabClick}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={showKebab}
        aria-label="Exportar el inventario visible"
        title="Exportar (CSV · JSON · Excel · PDF)"
        className="btn-outline flex items-center gap-1.5 px-3 py-2.5 text-xs shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        <span>Exportar</span>
      </button>

      {showKebab && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          aria-label="Formatos de exportación"
          style={{
            position: 'fixed',
            top: kebabCoords.top,
            bottom: kebabCoords.bottom,
            right: kebabCoords.right,
          }}
          className="z-[60] w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="p-1">
            {ITEMS.map(({ key, label, hint, Icon, colorClass }) => {
              const busy = busyFormat === key;
              const otherBusy = busyFormat !== null && !busy;
              return (
                <button
                  key={key}
                  role="menuitem"
                  onClick={() => run(key)}
                  disabled={otherBusy}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors
                    ${busy ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}
                    disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <span className={`shrink-0 mt-0.5 ${colorClass}`}>
                    {busy
                      ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" />
                      : <Icon className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                      {label}
                    </span>
                    <span className="block text-2xs text-slate-400 dark:text-slate-500 leading-tight">
                      {busy ? 'Generando…' : hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
