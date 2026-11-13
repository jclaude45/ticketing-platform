import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { assertSafeXlsx } from './spreadsheet-guard';

// A real guest list opens; a zip that unzips to gigabytes is refused before ExcelJS sees it
describe('assertSafeXlsx', () => {
  it('accepts a real Excel file', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Invités');
    ws.addRow(['Nom', 'Email']);
    for (let i = 0; i < 300; i++) ws.addRow([`Invité ${i}`, `invite${i}@exemple.cd`]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(() => assertSafeXlsx(buf)).not.toThrow();
  });

  it('refuses a zip bomb', async () => {
    const zip = new JSZip();
    zip.file('xl/sharedStrings.xml', Buffer.alloc(60 * 1024 * 1024, 0x41));
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    expect(buf.length).toBeLessThan(200 * 1024); // tiny upload
    expect(() => assertSafeXlsx(buf)).toThrow(/trop volumineux/);
  });

  it('refuses something that is not a zip', () => {
    expect(() => assertSafeXlsx(Buffer.from('Nom;Email\nA;a@b.cd'))).toThrow();
  });
});
