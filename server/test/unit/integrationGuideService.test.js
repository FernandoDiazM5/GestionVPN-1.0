import { describe, expect, it } from 'vitest';
const service = require('../../lib/integrationGuideService');

function pdfBuffer() { return Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'latin1'); }

describe('integrationGuideService', () => {
  it('acepta un PDF real pequeño y rechaza tipo o contenido falso', () => {
    expect(() => service.assertPdf({ buffer: pdfBuffer(), size: pdfBuffer().length, mimetype: 'application/pdf' })).not.toThrow();
    expect(() => service.assertPdf({ buffer: Buffer.from('no es pdf'), size: 9, mimetype: 'application/pdf' })).toThrowError(expect.objectContaining({ code: 'INTEGRATION_GUIDE_PDF_INVALID' }));
    expect(() => service.assertPdf({ buffer: pdfBuffer(), size: pdfBuffer().length, mimetype: 'text/plain' })).toThrowError(expect.objectContaining({ code: 'INTEGRATION_GUIDE_PDF_INVALID' }));
  });

  it('nunca expone la ruta interna de almacenamiento', () => {
    const row = service.publicRow({ integration_key: 'MIKROWISP', title: 'Guía', version_label: '1.0', file_name: 'guia.pdf', storage_path: 'C:/secret/file.pdf', file_size: 100, active: 1, updated_at: 2 });
    expect(row).toEqual({ key: 'MIKROWISP', title: 'Guía', version: '1.0', fileName: 'guia.pdf', fileSize: 100, active: true, updatedAt: 2 });
    expect(JSON.stringify(row)).not.toContain('storage');
  });
});
