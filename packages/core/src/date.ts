// Helpers de data puros (strings ISO "YYYY-MM-DD", sem fuso). Core não depende de date-fns.

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" local de um Date. */
export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date (meia-noite local) de uma string ISO. */
export function fromISO(iso: string): Date {
  const parts = iso.split('-').map((n) => parseInt(n, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

/** Diferença em dias inteiros entre duas datas ISO (b - a). */
export function daysBetween(aISO: string, bISO: string): number {
  return Math.round((fromISO(bISO).getTime() - fromISO(aISO).getTime()) / DAY_MS);
}

/** Soma `n` dias a uma data ISO. */
export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Weekday 0..6 (0=domingo) de uma data ISO. */
export function weekdayOf(iso: string): number {
  return fromISO(iso).getDay();
}

/** ISO do início da semana que contém `iso`, dado o dia de início (0=dom,1=seg). */
export function startOfWeek(iso: string, weekStartsOn: 0 | 1): string {
  const wd = weekdayOf(iso);
  const diff = (wd - weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}
