import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { assertSafeXlsx, loadXlsx } from './spreadsheet-guard';

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

// Written as the .NET OpenXML SDK does: x: prefix on every tag, absolute link targets
describe('loadXlsx', () => {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  async function prefixedFile() {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="${ns}"><x:sheets><x:sheet name="Invités" sheetId="1" r:id="R1" xmlns:r="${officeRel}" /></x:sheets></x:workbook>`);
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="${ns}"><x:sheetData>`
      + `<x:row r="1"><x:c r="A1" t="str"><x:v>Nom</x:v></x:c><x:c r="B1" t="str"><x:v>Email</x:v></x:c></x:row>`
      + `<x:row r="2"><x:c r="A2" t="str"><x:v>Invité Un</x:v></x:c><x:c r="B2" t="str"><x:v>un@exemple.cd</x:v></x:c></x:row>`
      + `</x:sheetData></x:worksheet>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${rels}"><Relationship Type="${officeRel}/officeDocument" Target="/xl/workbook.xml" Id="R0" /></Relationships>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${rels}"><Relationship Type="${officeRel}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R1" /></Relationships>`);
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" /><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" /></Types>`);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  it('reads a file with prefixed tags that ExcelJS alone refuses', async () => {
    const buf = await prefixedFile();
    await expect(new ExcelJS.Workbook().xlsx.load(buf as unknown as ArrayBuffer)).rejects.toThrow();

    const wb = new ExcelJS.Workbook();
    await loadXlsx(wb, buf);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(2).text).toBe('Email');
    expect(ws.getRow(2).getCell(2).text).toBe('un@exemple.cd');
  });

  it('still refuses what is not a spreadsheet', async () => {
    await expect(loadXlsx(new ExcelJS.Workbook(), Buffer.from('Nom;Email'))).rejects.toThrow();
  });
});
