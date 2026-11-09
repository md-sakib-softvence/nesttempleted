/**
 * Admin raffle date inputs represent a calendar deadline. Treat a date-only
 * value (or a legacy ISO value at exactly UTC midnight) as inclusive through
 * the end of that UTC calendar day. New admin clients send an explicit local
 * end-of-day timestamp. Other explicit timestamps retain their time.
 */
export function parseRaffleRegistrationCloseDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const legacyMidnight =
    /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z$/.exec(value);
  const calendarDate = dateOnly || legacyMidnight;

  if (calendarDate) {
    const [, year, month, day] = calendarDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999));
  }

  return new Date(value);
}
