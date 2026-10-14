const ZONE = 'Europe/London';
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** UTC ISO → London wall-clock 'YYYY-MM-DDTHH:mm'. */
export function utcToLondonLocal(iso: string | number): string {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * London wall-clock 'YYYY-MM-DDTHH:mm' → UTC ISO.
 * Ambiguous times (clocks go back) resolve to the first, BST, occurrence.
 * Times skipped when the clocks go forward are rejected.
 */
export function londonLocalToUtc(local: string): string {
  const m = LOCAL.exec(local);
  if (!m) throw new Error('Enter a date and time');
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  for (const offsetMinutes of [60, 0]) {
    const candidate = naive - offsetMinutes * 60_000;
    if (utcToLondonLocal(candidate) === local) return new Date(candidate).toISOString();
  }
  throw new Error("That time doesn't exist because the clocks go forward");
}

/** Friendly London display, e.g. "Monday 2 November 2026, 9:00am". */
export function formatLondon(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function formatLondonDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}
