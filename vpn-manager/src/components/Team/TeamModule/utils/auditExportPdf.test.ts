import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuditExportJsonResponse } from '@gestionvpn/contracts';
import { auditPdfFileName, createAuditPdf } from './auditExportPdf';

const report: AuditExportJsonResponse = {
  success: true,
  rows: [{
    id: 'log-1',
    tunnel_id: 'VRF-ND2-HOUSENET',
    action: 'ACTIVATE',
    ip_address: '200.121.42.141',
    detail: 'Acceso habilitado',
    created_at: Date.UTC(2026, 7, 22, 12, 30),
    user_id: 'user-1',
    user_email: 'fernando@example.com',
    user_name: 'Fernando Diaz',
  }],
  meta: {
    from: Date.UTC(2026, 7, 15),
    to: Date.UTC(2026, 7, 22),
    tunnelId: null,
    action: null,
    count: 1,
  },
};

describe('auditExportPdf', () => {
  it('genera un PDF válido con nombre estable', async () => {
    const blob = await createAuditPdf(report);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new Uint8Array(buffer);
    const visualOutput = process.env.AUDIT_PDF_OUTPUT;
    if (visualOutput) {
      await mkdir(dirname(visualOutput), { recursive: true });
      await writeFile(visualOutput, Buffer.from(buffer));
    }
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(1_000);
    expect(auditPdfFileName(report.meta.to)).toBe('actividad-2026-08-22.pdf');
  });
});
