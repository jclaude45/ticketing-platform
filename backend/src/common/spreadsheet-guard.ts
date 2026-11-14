import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'zlib';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { posix } from 'path';

/** What a guest list or team list can unzip to: far above any real file */
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 1000;

/**
 * An .xlsx is a zip: 1 MB uploaded can unzip to gigabytes and take the server's memory
 * when ExcelJS opens it. Every part is inflated here first, with a hard cap on the output
 * (the sizes the zip declares can lie), before the file reaches ExcelJS.
 */
export function assertSafeXlsx(buf: Buffer) {
  const refuse = () => new BadRequestException('Fichier Excel invalide ou trop volumineux une fois décompressé');

  // End of central directory: signature 0x06054b50 in the last 64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw refuse();
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (entries > MAX_ENTRIES || entries === 0xffff || p === 0xffffffff) throw refuse();

  let budget = MAX_UNZIPPED_BYTES;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw refuse();
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const local = buf.readUInt32LE(p + 42);
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);

    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw refuse();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (compressed === 0xffffffff || start + compressed > buf.length) throw refuse();
    const data = buf.subarray(start, start + compressed);

    if (method === 0) budget -= data.length;
    else if (method === 8) {
      try {
        budget -= inflateRawSync(data, { maxOutputLength: Math.max(budget, 1) }).length;
      } catch {
        throw refuse(); // over the cap, or not deflate data
      }
    } else throw refuse();
    if (budget < 0) throw refuse();
  }
}

/**
 * Some tools (the .NET OpenXML SDK, behind many converters and generators) write every tag
 * with a prefix, <x:workbook xmlns:x="...">. That is valid, but ExcelJS only reads unprefixed
 * tags and fails on such a file. The prefix of each part's root element becomes the default
 * namespace again, the same document in the form Excel itself writes. The same tools write
 * links as absolute paths (Target="/xl/tables/table1.xml"), which ExcelJS cannot follow:
 * they become relative to their part, as Excel writes them.
 */
async function unprefixXlsx(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  for (const part of Object.values(zip.files)) {
    if (part.dir || !/\.(xml|rels)$/i.test(part.name)) continue;
    let xml = await part.async('string');
    if (part.name.endsWith('.rels')) {
      const base = posix.dirname(posix.dirname(part.name));
      const relative = xml.replace(/Target="\/([^"]*)"/g, (_, target) => `Target="${posix.relative(base, target)}"`);
      if (relative !== xml) zip.file(part.name, (xml = relative));
    }
    const root = /<([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*[\s/>]/.exec(xml.replace(/<\?[^?]*\?>/g, ''));
    if (!root) continue;
    const prefix = root[1];
    if (!new RegExp(`xmlns:${prefix}=`).test(xml) || /\sxmlns=/.test(xml)) continue;
    zip.file(
      part.name,
      xml
        .replace(new RegExp(`(</?)${prefix}:`, 'g'), '$1')
        .replace(new RegExp(`xmlns:${prefix}=`, 'g'), 'xmlns='),
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Opens an uploaded .xlsx: checked first, then read as written or with its tag prefixes removed */
export async function loadXlsx(wb: ExcelJS.Workbook, buf: Buffer): Promise<void> {
  assertSafeXlsx(buf);
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch (err) {
    const fixed = await unprefixXlsx(buf).catch(() => null);
    if (!fixed) throw err;
    await wb.xlsx.load(fixed as unknown as ArrayBuffer);
  }
}
