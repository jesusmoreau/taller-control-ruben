// Reporte de un día: qué coches entraron, cuáles salieron, cuáles siguen en el taller
// con actividad y cuáles llevan el día sin movimiento (posibles atascados).

import type { WorkStatus } from "./status";
import { ENTRY_TAG, EXIT_TAGS, computeStays, splitTag } from "./tags";

export type ReportEvent = { id: string; plate: string; occurred_at: string; description: string };

export type ReportCar = {
  plate: string;
  status: WorkStatus | null;
  /** Hora del evento que lo coloca en la sección (llegada, salida o último evento del día). */
  at: string | null;
  /** Texto del evento: tipo y descripción. */
  tag: string | null;
  body: string;
  /** Llegada de la estancia que sigue abierta al cerrar el día. */
  insideSince: string | null;
  /** Salidas: tiempo que estuvo en el taller. */
  stayMs: number | null;
  /** Último evento antes de que acabe el día (para "sin movimiento"). */
  lastActivity: string | null;
};

export type DayReport = {
  entered: ReportCar[];
  exited: ReportCar[];
  active: ReportCar[];
  idle: ReportCar[];
  /** Coches dentro al cerrar el día, por color. */
  insideByStatus: Record<WorkStatus | "none", number>;
};

export function buildDayReport(
  events: ReportEvent[],
  statuses: Record<string, WorkStatus>,
  start: number,
  end: number,
): DayReport {
  const inDay = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= start && t < end;
  };
  const byPlate = new Map<string, ReportEvent[]>();
  for (const e of events) {
    if (new Date(e.occurred_at).getTime() >= end) continue;
    const list = byPlate.get(e.plate);
    if (list) list.push(e);
    else byPlate.set(e.plate, [e]);
  }

  const report: DayReport = {
    entered: [],
    exited: [],
    active: [],
    idle: [],
    insideByStatus: { red: 0, yellow: 0, green: 0, none: 0 },
  };
  const now = Math.min(end, Date.now());

  for (const [plate, list] of byPlate) {
    const stays = computeStays(list, now);
    const status = statuses[plate] ?? null;
    const base = { plate, status, insideSince: stays.openSince, stayMs: null, lastActivity: null };
    const today = list.filter((e) => inDay(e.occurred_at));

    // Un coche aparece una sola vez por sección aunque tenga llegadas o salidas repetidas:
    // la primera llegada del día y la última salida (sumando el tiempo de las estancias que cierra).
    const arrival = today.find((e) => splitTag(e.description).tag === ENTRY_TAG);
    if (arrival) report.entered.push({ ...base, at: arrival.occurred_at, ...splitTag(arrival.description) });
    const exits = today.filter((e) => EXIT_TAGS.includes(splitTag(e.description).tag!));
    if (exits.length) {
      const last = exits[exits.length - 1];
      const closed = exits.map((e) => stays.exitDurations.get(e.id)).filter((ms) => ms != null);
      report.exited.push({
        ...base,
        at: last.occurred_at,
        ...splitTag(last.description),
        stayMs: closed.length ? closed.reduce((a, b) => a + b, 0) : null,
      });
    }

    if (!stays.openSince) continue;
    report.insideByStatus[status ?? "none"]++;
    const enteredToday = inDay(stays.openSince);
    if (today.length) {
      // Con actividad hoy; los que entraron hoy ya salen en "Entraron".
      if (!enteredToday) {
        const last = today[today.length - 1];
        const { tag, body } = splitTag(last.description);
        report.active.push({ ...base, at: last.occurred_at, tag, body });
      }
    } else {
      const last = list[list.length - 1];
      report.idle.push({ ...base, at: null, tag: null, body: "", lastActivity: last.occurred_at });
    }
  }

  const byAt = (a: ReportCar, b: ReportCar) => (a.at ?? "").localeCompare(b.at ?? "");
  report.entered.sort(byAt);
  report.exited.sort(byAt);
  report.active.sort(byAt);
  // Los que llevan más tiempo parados, primero.
  report.idle.sort((a, b) => (a.lastActivity ?? "").localeCompare(b.lastActivity ?? ""));
  return report;
}
