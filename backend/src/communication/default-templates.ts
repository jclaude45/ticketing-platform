/**
 * 10 predefined email/SMS/WhatsApp templates — anti-spam optimized.
 *
 * Anti-spam rules applied:
 *  1. XHTML 1.0 Transitional DOCTYPE — maximum email client compatibility
 *  2. Table-based layout only — no CSS floats or divs (Outlook/Hotmail safe)
 *  3. All CSS inline — <style> only for responsive media queries
 *  4. Hidden preheader — preview text in inbox (Gmail, Apple Mail, Outlook)
 *  5. Balanced text/HTML ratio — enough real text content
 *  6. No spam trigger words (FREE, ACT NOW, CLICK HERE, !!!, ALL CAPS…)
 *  7. One clear CTA per email
 *  8. CAN-SPAM footer — unsubscribe notice + sender identification
 *  9. No external images except {{bannerUrl}} (event cover = trusted sender domain)
 * 10. Clean subject lines — no punctuation abuse, no deceptive prefixes
 *
 * Visual identity: ZAYA's (white, black, yellow), with the event's cover image ({{bannerUrl}}).
 */

export type TemplateChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface DefaultTemplate {
  name: string;
  channel: TemplateChannel;
  subject?: string;
  body: string;
  isDefault: boolean;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
// Same look as every ZAYA e-mail (src/common/email/layout.ts): white, black type, yellow
// accent, black button. No gradients: they are poorly rendered and disliked by spam filters.

const FONT = 'Arial,Helvetica,sans-serif';

/**
 * Header: yellow strip, ZAYA logo, the event poster ({{bannerUrl}}) when there is one,
 * then the action title and the event name.
 */
const header = (title: string) => `
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
    <tr><td bgcolor="#FFDD00" style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td class="pad" style="padding:26px 32px 0;">
      <img src="https://zaya.live/email-logo-zaya.png" width="104" height="32" alt="ZAYA" style="display:block;border:0;width:104px;height:32px;"/>
    </td></tr>
    <tr><td class="pad" style="padding:18px 32px 0;font-size:0;line-height:0;">
      <img src="{{bannerUrl}}" alt="{{eventName}}" width="536"
           style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:12px;"/>
    </td></tr>
    <tr><td class="pad" style="padding:24px 32px 0;">
      <p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;">{{eventName}}</p>
      <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:bold;color:#111111;">${title}</h1>
    </td></tr>
  </table>`;

const footer = () => `
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td class="pad" style="border-top:1px solid #e6e6e6;padding:18px 32px 26px;">
        <p style="margin:0;color:#6b6b6b;font-family:${FONT};font-size:12px;line-height:1.6;">
          Vous recevez cet e-mail car vous êtes inscrit(e) à cet événement. Pour ne plus en recevoir, répondez à ce message.<br/>
          Envoyé avec <a href="https://zaya.live" style="color:#111111;font-weight:bold;text-decoration:none;">ZAYA</a> — BACK2NEXT, Kinshasa
        </p>
      </td>
    </tr>
  </table>`;

const wrap = (hdr: string, body: string, preheader: string) =>
  `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <meta name="color-scheme" content="light"/>
  <title>{{eventName}}</title>
  <style type="text/css">
    @media screen and (max-width:620px){
      .w600{width:100% !important;}
      .btn{display:block !important;text-align:center !important;}
      .pad{padding-left:20px !important;padding-right:20px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f4f4f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4">
    <tr>
      <td align="center" style="padding:24px 12px 40px;">
        <table class="w600" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td>
          ${hdr}
          ${body}
          ${footer()}
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const ctaButton = (text: string) =>
  `<a href="#" class="btn"
     style="display:inline-block;padding:14px 30px;background:#111111;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:bold;text-decoration:none;border-radius:999px;line-height:1.2;">${text}</a>`;

const infoBox = (rows: Array<[string, string]>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="border-top:2px solid #111111;border-bottom:1px solid #e6e6e6;margin:0 0 24px;">
    ${rows.map(([label, val], i) => `
    <tr>
      <td style="padding:12px 0;${i ? 'border-top:1px solid #e6e6e6;' : ''}font-family:${FONT};font-size:13px;color:#6b6b6b;width:34%;vertical-align:top;">${label}</td>
      <td style="padding:12px 0;${i ? 'border-top:1px solid #e6e6e6;' : ''}font-family:${FONT};font-size:14px;font-weight:bold;color:#111111;vertical-align:top;">${val}</td>
    </tr>`).join('')}
  </table>`;

const p = (text: string, mb = '18px') =>
  `<p style="margin:0 0 ${mb};font-family:${FONT};font-size:15px;color:#2b2b2b;line-height:1.6;">${text}</p>`;

const greeting = () =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;color:#2b2b2b;line-height:1.5;">Bonjour <strong>{{firstName}}</strong>,</p>`;

// ─── Template 1 — Invitation officielle ──────────────────────────────────────

const t1 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="pad" style="padding:32px;">
    ${greeting()}
    ${p('Nous avons le plaisir de vous convier à <strong style="color:#111111;">{{eventName}}</strong>, un événement que nous avons hâte de partager avec vous.')}
    ${infoBox([
      ['Date', '{{eventDate}} &mdash; {{eventTime}}'],
      ['Lieu', '{{eventVenue}}, {{eventCity}}'],
    ])}
    ${p('Votre place est réservée. Accédez à votre billet via le lien ci-dessous.', '28px')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding-bottom:24px;">${ctaButton('Accéder à mon billet')}</td></tr>
    </table>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6b6b;line-height:1.6;">
      Si vous ne pouvez pas vous déplacer, aucune action n'est requise de votre part.
    </p>
  </td></tr>
</table>`;

// ─── Template 2 — Invitation VIP ─────────────────────────────────────────────

const t2 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background:#FFF6B3;border-bottom:3px solid #FFDD00;padding:10px 32px;text-align:center;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#111111;letter-spacing:0.1em;text-transform:uppercase;">
        Invitation personnelle et confidentielle
      </p>
    </td>
  </tr>
  <tr><td class="pad" style="padding:32px;">
    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#2b2b2b;">
      Cher(e) <strong>{{firstName}} {{lastName}}</strong>,
    </p>
    ${p('C\'est avec un plaisir tout particulier que nous vous réservons un accès privilégié à <strong style="color:#111111;">{{eventName}}</strong>. Votre présence nous honore.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#FFF6B3;border-radius:10px;border-left:4px solid #FFDD00;">
      <tr><td style="padding:18px 22px;">
        <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#111111;text-transform:uppercase;letter-spacing:0.07em;">Vos informations</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.9;">
            Date&nbsp;: <strong>{{eventDate}} &agrave; {{eventTime}}</strong><br/>
            Lieu&nbsp;: <strong>{{eventVenue}}, {{eventCity}}</strong><br/>
            Billet&nbsp;: <strong style="font-family:'Courier New',Courier,monospace;">{{ticketSerial}}</strong>
          </td></tr>
        </table>
      </td></tr>
    </table>
    ${p('Un accueil dédié vous sera réservé à l\'entrée. Présentez votre billet numérique ou imprimé.', '28px')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding-bottom:8px;">${ctaButton('Voir mon billet')}</td></tr>
    </table>
  </td></tr>
</table>`;

// ─── Template 3 — Confirmation de billet ─────────────────────────────────────

const t3 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="pad" style="padding:32px;">
    ${greeting()}
    ${p('Votre inscription à <strong style="color:#111111;">{{eventName}}</strong> est confirmée. Conservez les informations ci-dessous pour le jour de l\'événement.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f4f4f4;border-radius:12px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#111111;">
          Inscription confirmée
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.9;">
            Événement&nbsp;: <strong>{{eventName}}</strong><br/>
            Date&nbsp;: {{eventDate}} &agrave; {{eventTime}}<br/>
            Lieu&nbsp;: {{eventVenue}}, {{eventCity}}<br/>
            Num&eacute;ro de billet&nbsp;:
            <strong style="font-family:'Courier New',Courier,monospace;letter-spacing:0.05em;">{{ticketSerial}}</strong>
          </td></tr>
        </table>
      </td></tr>
    </table>
    ${p('Présentez le QR code de votre billet à l\'entrée. Vous recevrez un rappel la veille de l\'événement.', '28px')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">${ctaButton('Télécharger mon billet')}</td></tr>
    </table>
  </td></tr>
</table>`;

// ─── Template 4 — Rappel J-7 ─────────────────────────────────────────────────

const t4 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="pad" style="padding:32px;">
    ${greeting()}
    ${p('Dans exactement <strong>7 jours</strong>, vous êtes attendu(e) à <strong style="color:#111111;">{{eventName}}</strong>. Voici les informations essentielles pour préparer votre venue.')}
    ${infoBox([
      ['Date et heure', '{{eventDate}} &mdash; {{eventTime}}'],
      ['Adresse', '{{eventVenue}}, {{eventCity}}'],
      ['Votre billet', '{{ticketSerial}}'],
    ])}
    <p style="margin:22px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111111;">
      Avant l'événement
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${[
        'Vérifiez l\'itinéraire et les transports disponibles.',
        'Téléchargez ou imprimez votre billet en avance.',
        'Prévoyez d\'arriver 15 minutes avant le début.',
        'Vérifiez les conditions météo et habillez-vous en conséquence.',
      ].map(item => `
        <tr>
          <td width="20" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;font-weight:700;vertical-align:top;">&#8250;</td>
          <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2b2b2b;line-height:1.5;vertical-align:top;">${item}</td>
        </tr>`).join('')}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
      <tr><td align="center">${ctaButton('Voir mon billet')}</td></tr>
    </table>
  </td></tr>
</table>`;

// ─── Template 5 — Rappel J-1 ─────────────────────────────────────────────────

const t5 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background:#FFF6B3;border-bottom:2px solid #FFDD00;padding:12px 32px;text-align:center;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#111111;letter-spacing:0.06em;text-transform:uppercase;">
        Dernier rappel &mdash; C'est demain
      </p>
    </td>
  </tr>
  <tr><td class="pad" style="padding:32px;">
    <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#2b2b2b;">Bonsoir <strong>{{firstName}}</strong>,</p>
    ${p('<strong style="color:#111111;">{{eventName}}</strong> a lieu <strong>demain</strong>. Votre billet est prêt &mdash; assurez-vous d\'y avoir accès.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#FFF6B3;border-radius:10px;border:1px solid #FFDD00;">
      <tr><td style="padding:18px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.9;">
            Rendez-vous&nbsp;: <strong>{{eventDate}} &agrave; {{eventTime}}</strong><br/>
            Lieu&nbsp;: <strong>{{eventVenue}}, {{eventCity}}</strong><br/>
            Billet&nbsp;: <strong style="font-family:'Courier New',Courier,monospace;">{{ticketSerial}}</strong>
          </td></tr>
        </table>
      </td></tr>
    </table>
    ${p('Pour entrer, présentez le QR code de votre billet scannable à l\'entrée. Vérifiez que votre téléphone est chargé ou imprimez votre billet en avance.', '28px')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">${ctaButton('Afficher mon billet')}</td></tr>
    </table>
  </td></tr>
</table>`;

// ─── Template 6 — Rappel Jour J ──────────────────────────────────────────────

const t6 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="pad" style="padding:32px;">
    ${greeting()}
    ${p('<strong style="color:#111111;">{{eventName}}</strong> commence <strong>aujourd\'hui</strong>. Nous avons hâte de vous accueillir.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#FFDD00;border-radius:12px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;color:#111111;letter-spacing:-0.02em;">{{eventTime}}</p>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111111;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Heure de début</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;font-weight:500;">
          {{eventVenue}}, {{eventCity}}
        </p>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:16px;border-radius:8px;background:#f4f4f4;border:1px solid #e6e6e6;">
      <tr><td style="padding:12px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6b6b;">
        Numéro de billet&nbsp;:
        <strong style="font-family:'Courier New',Courier,monospace;color:#111111;letter-spacing:0.04em;">{{ticketSerial}}</strong>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td align="center">${ctaButton('Voir mon billet')}</td></tr>
    </table>
    <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6b6b;text-align:center;">
      Profitez pleinement de la journée.
    </p>
  </td></tr>
</table>`;

// ─── Template 7 — Merci post-événement ───────────────────────────────────────

const t7 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="pad" style="padding:32px;">
    ${greeting()}
    ${p('Merci d\'avoir participé à <strong style="color:#111111;">{{eventName}}</strong>. Votre présence a contribué à faire de cet événement un moment réussi.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f4f4f4;border-radius:12px;">
      <tr><td style="padding:22px;text-align:center;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#111111;">
          Merci pour votre participation
        </p>
        <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;">
          {{eventName}} &mdash; {{eventDate}}
        </p>
      </td></tr>
    </table>
    ${p('Votre avis nous est précieux pour améliorer nos prochains événements. N\'hésitez pas à nous contacter si vous souhaitez partager votre expérience.', '28px')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">${ctaButton('Voir les prochains événements')}</td></tr>
    </table>
  </td></tr>
</table>`;

// ─── Template 8 — Mise à jour de l'événement ─────────────────────────────────

const t8 = `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background:#fef2f2;border-bottom:2px solid #fecaca;padding:12px 32px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#b91c1c;letter-spacing:0.05em;text-transform:uppercase;">
        Information importante concernant votre participation
      </p>
    </td>
  </tr>
  <tr><td class="pad" style="padding:32px;">
    ${greeting()}
    ${p('Des informations ont été mises à jour concernant l\'événement <strong style="color:#111111;">{{eventName}}</strong> auquel vous êtes inscrit(e). Veuillez prendre connaissance des détails actualisés.')}
    ${infoBox([
      ['Date mise à jour', '{{eventDate}} &mdash; {{eventTime}}'],
      ['Lieu', '{{eventVenue}}, {{eventCity}}'],
    ])}
    ${p('Votre billet (<strong style="font-family:\'Courier New\',Courier,monospace;">{{ticketSerial}}</strong>) reste valide. Aucune action de votre part n\'est nécessaire pour conserver votre place.', '16px')}
    ${p('Nous vous remercions de votre compréhension.', '28px')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">${ctaButton('Consulter les détails')}</td></tr>
    </table>
  </td></tr>
</table>`;

// ─── Template 9 — SMS Rappel ──────────────────────────────────────────────────

const t9 = `Rappel : {{eventName}} aura lieu le {{eventDate}} a {{eventTime}}, {{eventVenue}}, {{eventCity}}. Votre billet : {{ticketSerial}}. A bientot.`;

// ─── Template 10 — WhatsApp Confirmation ─────────────────────────────────────

const t10 = `Bonjour {{firstName}},

Votre billet pour *{{eventName}}* est confirmé.

*Date :* {{eventDate}} à {{eventTime}}
*Lieu :* {{eventVenue}}, {{eventCity}}
*Billet :* {{ticketSerial}}

Présentez ce billet à l'entrée pour accéder à l'événement.

À bientôt !`;

// ─── Exported list ────────────────────────────────────────────────────────────

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Invitation officielle',
    channel: 'EMAIL',
    subject: 'Invitation — {{eventName}}',
    body: wrap(header('Vous êtes invité(e)'), t1, 'Votre invitation pour {{eventName}} le {{eventDate}} vous attend.'),
    isDefault: true,
  },
  {
    name: 'Invitation personnalisée',
    channel: 'EMAIL',
    subject: 'Invitation personnelle — {{eventName}}',
    body: wrap(header('Invitation personnelle'), t2, 'Nous vous réservons un accès particulier à {{eventName}}.'),
    isDefault: false,
  },
  {
    name: 'Confirmation de billet',
    channel: 'EMAIL',
    subject: 'Votre inscription à {{eventName}} est confirmée',
    body: wrap(header('Inscription confirmée'), t3, 'Votre billet pour {{eventName}} est prêt — conservez-le précieusement.'),
    isDefault: true,
  },
  {
    name: 'Rappel J-7',
    channel: 'EMAIL',
    subject: '{{eventName}} — Dans 7 jours, votre billet vous attend',
    body: wrap(header('Dans 7 jours'), t4, '{{eventName}} aura lieu dans 7 jours — vérifiez votre billet.'),
    isDefault: true,
  },
  {
    name: 'Rappel J-1',
    channel: 'EMAIL',
    subject: "{{eventName}} — Votre billet pour demain",
    body: wrap(header("C'est demain"), t5, "{{eventName}} commence demain — assurez-vous d'avoir votre billet."),
    isDefault: true,
  },
  {
    name: 'Rappel Jour J',
    channel: 'EMAIL',
    subject: "{{eventName}} — Bienvenue, c'est aujourd'hui",
    body: wrap(header("C'est aujourd'hui"), t6, "{{eventName}} commence aujourd'hui à {{eventTime}}."),
    isDefault: false,
  },
  {
    name: 'Remerciement post-événement',
    channel: 'EMAIL',
    subject: 'Merci pour votre présence — {{eventName}}',
    body: wrap(header('Merci pour votre présence'), t7, 'Merci d\'avoir participé à {{eventName}}.'),
    isDefault: false,
  },
  {
    name: "Mise à jour de l'événement",
    channel: 'EMAIL',
    subject: 'Information importante — {{eventName}}',
    body: wrap(header("Information importante"), t8, 'Des informations ont été mises à jour pour {{eventName}}.'),
    isDefault: false,
  },
  {
    name: 'SMS — Rappel événement',
    channel: 'SMS',
    body: t9,
    isDefault: true,
  },
  {
    name: 'WhatsApp — Confirmation billet',
    channel: 'WHATSAPP',
    body: t10,
    isDefault: true,
  },
];
