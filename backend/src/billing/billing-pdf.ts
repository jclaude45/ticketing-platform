import * as PDFDocument from 'pdfkit';

/** Company that issues the documents */
export const ISSUER = {
  name: 'BACK2NEXT',
  brand: 'ZAYA',
  rccm: 'CD/KNG/RCCM/26-B-03430',
  nif: 'A2636279N',
  address: ['10, avenue Katakokombe, Q/Joli Parc', 'C/Ngaliema, Kinshasa', 'République démocratique du Congo'],
  email: 'contact@zaya.live',
};

const BLACK = '#111111';
const GREY = '#666666';
const LINE = '#DDDDDD';
const YELLOW = '#FFDD00';

export const fmtMoney = (n: number, cur: string) => {
  const v = n.toLocaleString('fr-FR', { minimumFractionDigits: cur === 'CDF' ? 0 : 2, maximumFractionDigits: cur === 'CDF' ? 0 : 2 }).replace(/ | /g, ' ');
  return `${v} ${cur}`;
};
export const fmtDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Kinshasa' });

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Header: brand, issuer, document title and number */
function header(doc: PDFKit.PDFDocument, title: string, number: string, date: Date) {
  doc.rect(0, 0, doc.page.width, 8).fill(YELLOW);
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(26).text(ISSUER.brand, 50, 40);
  doc.font('Helvetica').fontSize(9).fillColor(GREY)
    .text(`${ISSUER.name} · RCCM ${ISSUER.rccm} · NIF ${ISSUER.nif}`, 50, 72)
    .text(ISSUER.address.join(', '), 50, 84)
    .text(ISSUER.email, 50, 96);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(BLACK).text(title, 300, 40, { width: 245, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(GREY)
    .text(`N° ${number}`, 300, 62, { width: 245, align: 'right' })
    .text(fmtDate(date), 300, 76, { width: 245, align: 'right' });
  doc.moveTo(50, 120).lineTo(545, 120).strokeColor(LINE).lineWidth(1).stroke();
}

function block(doc: PDFKit.PDFDocument, y: number, label: string, lines: string[]) {
  doc.font('Helvetica').fontSize(8).fillColor(GREY).text(label.toUpperCase(), 50, y, { characterSpacing: 1 });
  doc.font('Helvetica').fontSize(11).fillColor(BLACK);
  lines.forEach((l, i) => doc.text(l, 50, y + 14 + i * 15));
  return y + 14 + lines.length * 15;
}

/** Rows label / amount, with an optional bold total */
function table(doc: PDFKit.PDFDocument, y: number, head: [string, string], rows: { label: string; value: string; bold?: boolean; muted?: boolean }[]) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text(head[0], 50, y).text(head[1], 345, y, { width: 200, align: 'right' });
  y += 16;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(BLACK).lineWidth(1).stroke();
  y += 8;
  for (const r of rows) {
    doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(r.bold ? 12 : 11).fillColor(r.muted ? GREY : BLACK);
    const h = Math.max(doc.heightOfString(r.label, { width: 290 }), 14);
    doc.text(r.label, 50, y, { width: 290 }).text(r.value, 345, y, { width: 200, align: 'right' });
    y += h + 8;
    doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
  }
  return y;
}

function footer(doc: PDFKit.PDFDocument, note: string) {
  doc.font('Helvetica').fontSize(8).fillColor(GREY)
    .text(note, 50, doc.page.height - 90, { width: 495, align: 'center' })
    .text(`${ISSUER.brand} est un service de ${ISSUER.name}. Conditions générales de vente : zaya.live/cgv`, 50, doc.page.height - 66, { width: 495, align: 'center' });
}

/** Receipt of a payment made by an organizer to ZAYA (plan or print credits) */
export async function receiptPdf(p: {
  number: string;
  paidAt: Date;
  customer: { name: string; email: string };
  label: string;
  detail?: string;
  quantity?: number | null;
  unitPrice?: number | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  reference: string;
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Reçu ${p.number}`, Author: ISSUER.name } });
  header(doc, 'Reçu de paiement', p.number, p.paidAt);
  let y = block(doc, 140, 'Client', [p.customer.name, p.customer.email]);
  y = table(doc, y + 30, ['Désignation', 'Montant'], [
    {
      label: p.quantity && p.unitPrice
        ? `${p.label}\n${p.quantity.toLocaleString('fr-FR')} × ${fmtMoney(p.unitPrice, p.currency)}`
        : p.label + (p.detail ? `\n${p.detail}` : ''),
      value: fmtMoney(p.amount, p.currency),
    },
    { label: 'Total payé', value: fmtMoney(p.amount, p.currency), bold: true },
  ]);
  block(doc, y + 20, 'Paiement', [
    `Payé le ${fmtDate(p.paidAt)} par ${p.paymentMethod === 'card' ? 'carte bancaire' : 'Mobile Money'} (FlexPay)`,
    `Référence : ${p.reference}`,
  ]);
  footer(doc, 'Document attestant le paiement reçu par BACK2NEXT pour les services ZAYA.');
  return toBuffer(doc);
}

/** Statement of an event's online sales: what was collected, ZAYA's fee, refunds and payouts */
export async function statementPdf(p: {
  number: string;
  date: Date;
  organizer: { name: string; email: string };
  event: { name: string; end: Date };
  currency: string;
  orders: number;
  gross: number;
  refunded: number;
  refundedOrders: number;
  fees: number;
  net: number;
  payouts: { label: string; amount: number; status: string; date: Date | null; reference: string | null }[];
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Relevé ${p.number}`, Author: ISSUER.name } });
  header(doc, 'Relevé de ventes', p.number, p.date);
  let y = block(doc, 140, 'Organisateur', [p.organizer.name, p.organizer.email]);
  y = block(doc, y + 14, 'Événement', [p.event.name, `Terminé le ${fmtDate(p.event.end)}`]);
  y = table(doc, y + 26, ['Ventes en ligne', 'Montant'], [
    { label: `Encaissé (${p.orders} commande${p.orders > 1 ? 's' : ''})`, value: fmtMoney(p.gross, p.currency) },
    ...(p.refundedOrders > 0
      ? [{ label: `Remboursé aux acheteurs (${p.refundedOrders} commande${p.refundedOrders > 1 ? 's' : ''})`, value: `- ${fmtMoney(p.refunded, p.currency)}` }]
      : []),
    { label: 'Frais ZAYA (9 %, frais de paiement compris)', value: `- ${fmtMoney(p.fees, p.currency)}` },
    { label: 'Net pour l’organisateur', value: fmtMoney(p.net, p.currency), bold: true },
  ]);
  y = table(doc, y + 24, ['Versements', 'Montant'], p.payouts.map((v) => ({
    label: `${v.label} — ${v.status}${v.date ? ` le ${fmtDate(v.date)}` : ''}${v.reference ? `\nRéf. ${v.reference}` : ''}`,
    value: fmtMoney(v.amount, p.currency),
  })));
  footer(doc, 'Les montants remboursés aux acheteurs ne sont pas encaissés ; les frais ZAYA sur ces commandes restent dus (CGV).');
  return toBuffer(doc);
}
