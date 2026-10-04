/**
 * ZAYA e-mails: one layout for every message the platform sends, in the zaya.live style
 * (white, black type, yellow accent, black button). Plain tables and inline styles only,
 * no gradients or background images: what mail clients and spam filters handle best.
 */

const FONT = "Arial,Helvetica,sans-serif";
const C = { black: '#111111', text: '#2b2b2b', muted: '#6b6b6b', line: '#e6e6e6', page: '#f4f4f4', yellow: '#FFDD00' };
const SITE = 'https://zaya.live';
const LOGO = `${SITE}/email-logo-zaya.png`;

/** Escapes a value placed inside the HTML */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Paragraph of body text (html allowed: escape user values with esc()) */
export function p(html: string, opts: { muted?: boolean; small?: boolean } = {}): string {
  const size = opts.small ? 13 : 15;
  const color = opts.muted ? C.muted : C.text;
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`;
}

/** Black pill button */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td align="center" bgcolor="${C.black}" style="border-radius:999px;">
    <a href="${esc(url)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

/** Label / value lines separated by thin rules (dates, places, amounts) */
export function details(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value], i) => `<tr>
      <td style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${FONT};font-size:13px;color:${C.muted};width:38%;vertical-align:top;">${label}</td>
      <td style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${FONT};font-size:14px;font-weight:bold;color:${C.black};vertical-align:top;">${value}</td>
    </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-top:2px solid ${C.black};border-bottom:1px solid ${C.line};">${cells}</table>`;
}

/** Lines of an order (item, quantity, amount) and its total */
export function orderLines(items: { label: string; sub?: string; qty?: number; amount: string }[], footer: [string, string][] = []): string {
  const row = (cells: string, top: boolean) => `<tr>${cells.replace(/BORDER/g, top ? `border-top:1px solid ${C.line};` : '')}</tr>`;
  const body = items
    .map((it, i) =>
      row(
        `<td style="padding:10px 0;BORDERfont-family:${FONT};font-size:14px;color:${C.black};">${esc(it.label)}${it.sub ? `<br/><span style="font-size:12px;color:${C.muted};">${esc(it.sub)}</span>` : ''}</td>
         <td style="padding:10px 8px;BORDERfont-family:${FONT};font-size:14px;color:${C.muted};text-align:center;white-space:nowrap;">${it.qty ? `× ${it.qty}` : ''}</td>
         <td style="padding:10px 0;BORDERfont-family:${FONT};font-size:14px;color:${C.black};text-align:right;white-space:nowrap;">${esc(it.amount)}</td>`,
        i > 0,
      ),
    )
    .join('');
  const foot = footer
    .map(([label, value], i) =>
      `<tr><td colspan="2" style="padding:${i === footer.length - 1 ? '12px 0 4px' : '8px 0'};border-top:${i === footer.length - 1 ? `2px solid ${C.black}` : `1px solid ${C.line}`};font-family:${FONT};font-size:${i === footer.length - 1 ? 15 : 13}px;${i === footer.length - 1 ? 'font-weight:bold;' : ''}color:${i === footer.length - 1 ? C.black : C.muted};">${esc(label)}</td>
       <td style="padding:${i === footer.length - 1 ? '12px 0 4px' : '8px 0'};border-top:${i === footer.length - 1 ? `2px solid ${C.black}` : `1px solid ${C.line}`};font-family:${FONT};font-size:${i === footer.length - 1 ? 15 : 13}px;${i === footer.length - 1 ? 'font-weight:bold;' : ''}color:${C.black};text-align:right;white-space:nowrap;">${esc(value)}</td></tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-top:2px solid ${C.black};">${body}${foot}</table>`;
}

/** Message quoted from a person (organizer's note, reason): yellow rule on the left */
export function quote(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr><td style="border-left:4px solid ${C.yellow};padding:6px 0 6px 14px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.text};white-space:pre-line;">${esc(text)}</td></tr>
</table>`;
}

/** A code to show at a desk or type in (order code, accreditation…) */
export function codeBox(code: string, caption?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr><td bgcolor="${C.yellow}" style="padding:14px 22px;border-radius:12px;font-family:'Courier New',monospace;font-size:24px;font-weight:bold;letter-spacing:3px;color:${C.black};">${esc(code)}</td></tr>
  ${caption ? `<tr><td style="padding-top:8px;font-family:${FONT};font-size:12px;color:${C.muted};">${esc(caption)}</td></tr>` : ''}
</table>`;
}

/** Small grey line under the content (expiry, "ignore this e-mail"…) */
export function note(html: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">${html}</p>`;
}

export interface EmailLayoutOptions {
  /** Hidden preview text shown by the mail apps next to the subject */
  preheader: string;
  /** Small uppercase label above the title */
  eyebrow?: string;
  title: string;
  /** Body: built with p(), details(), button()… */
  body: string;
  /** Optional wide picture under the logo (event poster): https or cid: source */
  banner?: { src: string; alt: string };
  /** Line in the footer explaining why this e-mail was received */
  reason?: string;
}

/** Full HTML of a ZAYA e-mail */
export function emailLayout(o: EmailLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(o.preheader)}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}">
<tr><td align="center" style="padding:28px 12px 36px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr><td bgcolor="${C.yellow}" style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:26px 36px 8px;">
      <a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="104" height="32" alt="ZAYA" style="display:block;border:0;width:104px;height:32px;"/></a>
    </td></tr>
    ${o.banner ? `<tr><td style="padding:18px 36px 0;"><img src="${esc(o.banner.src)}" width="488" alt="${esc(o.banner.alt)}" style="display:block;width:100%;max-width:488px;height:auto;border:0;border-radius:12px;"/></td></tr>` : ''}
    <tr><td style="padding:24px 36px 12px;">
      ${o.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};">${esc(o.eyebrow)}</p>` : ''}
      <h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:bold;color:${C.black};">${esc(o.title)}</h1>
      ${o.body}
    </td></tr>
    <tr><td style="padding:18px 36px 28px;border-top:1px solid ${C.line};">
      ${o.reason ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">${o.reason}</p>` : ''}
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">
        <a href="${SITE}" style="color:${C.black};font-weight:bold;text-decoration:none;">ZAYA</a> — billetterie et contrôle d'accès<br/>
        BACK2NEXT · RCCM CD/KNG/RCCM/26-B-03430 · Kinshasa, RDC<br/>
        <a href="${SITE}/politique-de-confidentialite" style="color:${C.muted};">Confidentialité</a> · <a href="${SITE}/cgv" style="color:${C.muted};">Conditions de vente</a> · contact@zaya.live
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Text version of the same e-mail: sent with the HTML, it helps deliverability */
export function emailText(title: string, lines: string[]): string {
  return [title, '', ...lines, '', '—', 'ZAYA · BACK2NEXT, Kinshasa · zaya.live'].join('\n');
}
