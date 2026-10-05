/** Public site (zaya.live): shared links of the header, footer and app buttons. */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zaya.live';

/** Public site (landing, billetterie), linked from the app's login pages */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zaya.live';

/** Store pages of the ZAYA app; null until published (the buttons then go to #telecharger) */
export const STORE_LINKS: { ios: string | null; android: string | null } = {
  ios: null,
  android: null,
};

/** Social accounts; an empty entry is shown without a link */
export const SOCIAL_LINKS: { tiktok: string | null; youtube: string | null; instagram: string | null; facebook: string | null; linkedin: string | null } = {
  tiktok: null,
  youtube: null,
  instagram: null,
  facebook: null,
  linkedin: null,
};

/** Event types of the API, as shown to the public */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  CONCERT: 'Concert',
  CONFERENCE: 'Conférence',
  FESTIVAL: 'Festival',
  SPORT: 'Sport',
  PARTY: 'Soirée',
  EXHIBITION: 'Exposition',
  THEATER: 'Théâtre',
  WORKSHOP: 'Atelier',
  GALA: 'Gala',
  COMEDY: 'Humour',
  WORSHIP: 'Culte & gospel',
  FAIR: 'Salon',
  OTHER: 'Événement',
};
