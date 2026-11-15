import { dayBounds, eventDay, eventDays } from './event-days';
import { timeZoneOf, zonedToUtc } from '../common/time-zone';

// The days of an event are those of its city, whatever the server's zone
describe('event days in the event zone', () => {
  it('splits days at midnight in the city', () => {
    // 23:30 UTC is already the 15th in Kinshasa (00:30); 22:30 UTC is the 14th there, the 15th in Lubumbashi
    const t = new Date('2026-11-14T23:30:00Z');
    expect(eventDay(t, 'Africa/Kinshasa')).toBe('2026-11-15');
    expect(eventDay(new Date('2026-11-14T22:30:00Z'), 'Africa/Kinshasa')).toBe('2026-11-14');
    expect(eventDay(new Date('2026-11-14T22:30:00Z'), 'Africa/Lubumbashi')).toBe('2026-11-15');
  });

  it('gives the bounds of a day there, daylight saving included', () => {
    expect(dayBounds('2026-11-14', 'Africa/Lubumbashi')).toEqual({
      start: new Date('2026-11-13T22:00:00Z'), end: new Date('2026-11-14T22:00:00Z'),
    });
    // Paris moves to summer time on 29 March 2026: that day lasts 23 hours
    const { start, end } = dayBounds('2026-03-29', 'Europe/Paris');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('lists the days of an event in its zone', () => {
    const start = zonedToUtc('2026-12-31T22:00', 'Africa/Lubumbashi');
    const end = zonedToUtc('2027-01-01T03:00', 'Africa/Lubumbashi');
    expect(eventDays(start, end, 'Africa/Lubumbashi')).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('finds the zone of a city', () => {
    expect(timeZoneOf('RD Congo', 'Kinshasa')).toBe('Africa/Kinshasa');
    expect(timeZoneOf('RDC', 'Lubumbashi')).toBe('Africa/Lubumbashi');
    expect(timeZoneOf('France', 'Lyon')).toBe('Europe/Paris');
    expect(timeZoneOf('Pays inconnu', 'Ville')).toBeNull();
  });
});
