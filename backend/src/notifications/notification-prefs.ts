/** E-mail alerts an organizer can switch on or off in Paramètres → Notifications */
export interface NotificationPrefs {
  /** Summary of the scans of the last quarter of an hour (never one e-mail per scan) */
  emailOnScan: boolean;
  /** Every tariff of a published event is sold out */
  emailOnEventFull: boolean;
  /** A forged or already-flagged QR code was presented at the entrance */
  emailOnFraud: boolean;
  /** Activity of the week, every Monday morning */
  emailWeeklyReport: boolean;
  /** Push notifications on the organizer app's phones */
  pushOnSale: boolean;
  pushOnEventFull: boolean;
  pushOnFraud: boolean;
  pushWeeklyReport: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailOnScan: false,
  emailOnEventFull: true,
  emailOnFraud: true,
  emailWeeklyReport: false,
  pushOnSale: true,
  pushOnEventFull: true,
  pushOnFraud: true,
  pushWeeklyReport: true,
};

/** Stored preferences completed with the defaults (the column is null until the first save) */
export function notificationPrefs(stored: unknown): NotificationPrefs {
  const s = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(out) as (keyof NotificationPrefs)[]) {
    if (typeof s[key] === 'boolean') out[key] = s[key] as boolean;
  }
  return out;
}
