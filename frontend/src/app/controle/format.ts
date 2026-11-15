/** In the event's time (its city's zone), whatever the phone's */
export const formatEventDate = (iso: string, tz = 'Africa/Kinshasa') =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz })
    .format(new Date(iso));
