// Miroir de stream_web/src/utils/eventTiming.ts — garder synchronisé.
// Phase temporelle d'un événement/concert : sert à distinguer d'un coup d'œil
// ce qui est en cours, imminent, à venir ou terminé. Gère les événements sur
// plusieurs jours (ex. SIAO sur 8 jours) via starts_at/ends_at au lieu d'une
// seule date — "En cours" tant que now est dans la fenêtre, pas seulement le
// jour du début.

export type EventPhase = 'live' | 'today' | 'soon' | 'upcoming' | 'past';

export interface EventTiming {
  phase: EventPhase;
  label: string;
  color: string;
  /** vrai pour les événements des 7 prochains jours (y compris aujourd'hui et en cours) */
  isNear: boolean;
  isPast: boolean;
}

const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // sans ends_at : on suppose 3 h

export const TIMING_COLORS: Record<EventPhase, string> = {
  live:     '#EF4444',
  today:    '#F59E0B',
  soon:     '#F59E0B',
  upcoming: '#7B3FF2',
  past:     '#6B7280',
};

function diffCalendarDays(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / 86_400_000);
}

export function getEventTiming(
  ev: { starts_at: string; ends_at?: string | null },
  now = new Date(),
): EventTiming {
  const start = new Date(ev.starts_at);
  const end   = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const make = (phase: EventPhase, label: string, isNear = false): EventTiming =>
    ({ phase, label, color: TIMING_COLORS[phase], isNear, isPast: phase === 'past' });

  if (now >= start && now <= end) return make('live', 'En cours', true);

  if (now > end) {
    const d = diffCalendarDays(now, end);
    if (d <= 0) return make('past', "Terminé aujourd'hui");
    if (d === 1) return make('past', 'Terminé hier');
    if (d < 30)  return make('past', `Terminé il y a ${d} j`);
    return make('past', 'Terminé');
  }

  const d = diffCalendarDays(start, now);
  if (d <= 0) return make('today', "Aujourd'hui", true);
  if (d === 1) return make('soon', 'Demain', true);
  if (d <= 7)  return make('soon', `Dans ${d} jours`, true);
  if (d < 30)  return make('upcoming', `Dans ${Math.round(d / 7)} sem.`);
  return make('upcoming', `Dans ${Math.round(d / 30)} mois`);
}

/** À venir / en cours : du plus proche au plus lointain, puis les passés du plus récent au plus ancien. */
export function sortEventsByProximity<T extends { starts_at: string; ends_at?: string | null }>(
  list: T[], now = new Date(),
): T[] {
  const t = (e: T) => new Date(e.starts_at).getTime();
  const upcoming = list.filter(e => !getEventTiming(e, now).isPast).sort((a, b) => t(a) - t(b));
  const past     = list.filter(e => getEventTiming(e, now).isPast).sort((a, b) => t(b) - t(a));
  return [...upcoming, ...past];
}

/** Fin réelle d'un concert : scheduled_at + duration_min (sans durée → 3 h). */
export function getConcertEnd(c: { scheduled_at: string; duration_min?: number | null }): Date {
  const start = new Date(c.scheduled_at);
  return new Date(start.getTime() + (c.duration_min && c.duration_min > 0 ? c.duration_min * 60_000 : DEFAULT_DURATION_MS));
}

/** Même jour calendaire ? */
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Vrai si l'événement s'étale sur plusieurs jours (ex. un festival de 8 jours). */
export function isMultiDay(start: Date, end: Date | null): boolean {
  return !!end && !sameDay(start, end);
}

/** « 4 mars 2027 » ou « Du 4 au 11 mars 2027 » / « Du 28 févr. au 7 mars 2027 ». */
export function formatDateRange(start: Date, end: Date | null): string {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', o);
  if (!end || sameDay(start, end)) return f(start, { day: 'numeric', month: 'long', year: 'numeric' });
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth())
    return `Du ${start.getDate()} au ${f(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return `Du ${f(start, { day: 'numeric', month: 'short' })} au ${f(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Nombre de jours couverts (bornes incluses). */
export function daysSpan(start: Date, end: Date): number {
  return diffCalendarDays(end, start) + 1;
}
