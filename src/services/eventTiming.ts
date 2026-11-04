// Statut temporel d'un événement — source unique pour les écrans mobiles.
// Sans ends_at, on suppose 24 h après le début (même règle que le Feed).
const DAY_MS = 24 * 3600_000;

export function getEventEnd(startsAt: string, endsAt?: string | null): Date {
  return endsAt ? new Date(endsAt) : new Date(new Date(startsAt).getTime() + DAY_MS);
}

export function isEventOngoingNow(startsAt?: string | null, endsAt?: string | null): boolean {
  if (!startsAt) return false;
  const now = Date.now();
  return now >= new Date(startsAt).getTime() && now <= getEventEnd(startsAt, endsAt).getTime();
}

export function isEventOver(startsAt?: string | null, endsAt?: string | null): boolean {
  if (!startsAt) return false;
  return Date.now() > getEventEnd(startsAt, endsAt).getTime();
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Vrai si l'événement s'étale sur plusieurs jours (ex. un salon de 8 jours). */
export function isMultiDayEvent(startsAt?: string | null, endsAt?: string | null): boolean {
  if (!startsAt || !endsAt) return false;
  return !sameDay(new Date(startsAt), new Date(endsAt));
}

/** Nombre de jours couverts, bornes incluses. */
export function eventDaysSpan(startsAt: string, endsAt: string): number {
  const s = new Date(startsAt); const e = new Date(endsAt);
  const a = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  const b = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.round((b - a) / DAY_MS) + 1;
}

/** « Du 30 oct. au 6 nov. 2026 » — ou une date simple si un seul jour. */
export function formatEventRange(startsAt: string, endsAt?: string | null): string {
  const s = new Date(startsAt);
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', o);
  if (!endsAt || !isMultiDayEvent(startsAt, endsAt)) return f(s, { day: 'numeric', month: 'long', year: 'numeric' });
  const e = new Date(endsAt);
  return `Du ${f(s, { day: 'numeric', month: 'short' })} au ${f(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
