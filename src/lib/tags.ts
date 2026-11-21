// Tipos de evento. Se guardan como prefijo de la descripción: "Llegada: texto".

export const TAGS = ["Llegada", "Salida", "Daños", "Reparación", "Revisión", "Entrega al cliente"] as const;
export type Tag = (typeof TAGS)[number];

export const ENTRY_TAG: Tag = "Llegada";
/** Días laborables (lunes a viernes) seguidos en el taller a partir de los cuales salta la alarma. */
export const ALARM_WORKDAYS = 5;

/** Días laborables transcurridos desde la entrada: cuenta de lunes a viernes, desde el día siguiente hasta hoy. */
export function workdaysSince(iso: string, now = Date.now()): number {
  const day = new Date(iso);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let n = 0;
  while (day < today) {
    day.setDate(day.getDate() + 1);
    const wd = day.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Un coche que entró el lunes salta el lunes siguiente; los fines de semana no cuentan. */
export function isOverdue(insideSince: string | null, now = Date.now()): boolean {
  return Boolean(insideSince && workdaysSince(insideSince, now) >= ALARM_WORKDAYS);
}

export const EXIT_TAGS: readonly Tag[] = ["Salida", "Entrega al cliente"];

const TAG_RE = new RegExp(`^(${TAGS.join("|")})(?::\\s*|$)([\\s\\S]*)$`);

export function splitTag(text: string): { tag: Tag | null; body: string } {
  const m = text.match(TAG_RE);
  return m ? { tag: m[1] as Tag, body: m[2] } : { tag: null, body: text };
}

type Ev = { id: string; occurred_at: string; description: string };

export type StayInfo = {
  /** Duración de la estancia que cierra cada evento de salida, por id de evento. */
  exitDurations: Map<string, number>;
  /** Si el coche sigue dentro: fecha de la llegada abierta. */
  openSince: string | null;
  /** Número de llegadas registradas. */
  visits: number;
  /** Tiempo total dentro (estancias cerradas + la abierta hasta ahora), en ms. */
  totalMs: number;
};

// Empareja cada salida con la llegada anterior más reciente.
// Si hay dos llegadas seguidas sin salida, cuenta desde la más reciente.
export function computeStays(events: Ev[], now = Date.now()): StayInfo {
  const asc = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const exitDurations = new Map<string, number>();
  let open: string | null = null;
  let visits = 0;
  let totalMs = 0;

  for (const e of asc) {
    const { tag } = splitTag(e.description);
    if (tag === ENTRY_TAG) {
      open = e.occurred_at;
      visits++;
    } else if (tag && EXIT_TAGS.includes(tag) && open) {
      const ms = new Date(e.occurred_at).getTime() - new Date(open).getTime();
      if (ms >= 0) {
        exitDurations.set(e.id, ms);
        totalMs += ms;
      }
      open = null;
    }
  }
  if (open) totalMs += Math.max(0, now - new Date(open).getTime());
  return { exitDurations, openSince: open, visits, totalMs };
}

// "45 min", "3 h 20 min", "2 d 5 h"
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}
