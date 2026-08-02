import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

describe('ExcelJS compatibility with the secured uuid override', () => {
  it('writes and reloads a real XLSX workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Validación');
    worksheet.addRow(['Nodo', 'Estado']);
    worksheet.addRow(['Torre Norte', 'Conectado']);

    // dataBar uses ExcelJS's internal UUID generation path. Keeping it in this
    // regression test detects CommonJS/API incompatibilities in future updates.
    worksheet.addConditionalFormatting({
      ref: 'A2:A2',
      rules: [{
        type: 'dataBar',
        priority: 1,
        cfvo: [{ type: 'min' }, { type: 'max' }],
      }],
    });

    const output = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(output as ArrayBuffer);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(output);
    expect(reloaded.getWorksheet('Validación')?.getCell('A2').value).toBe('Torre Norte');
    expect(reloaded.getWorksheet('Validación')?.getCell('B2').value).toBe('Conectado');
  });
});
