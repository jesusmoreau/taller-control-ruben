"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { PlateBadge } from "@/components/PlateBadge";
import { Header, Notice, Skeleton } from "@/components/ui";
import { buildDayReport, buildWorkReport, type ReportCar, type ReportEvent } from "@/lib/report";
import type { WorkSession } from "@/lib/types";
import { STATUSES, STATUS_INFO, type WorkStatus } from "@/lib/status";
import { formatDuration } from "@/lib/tags";
import { formatDate } from "@/lib/time";
import { useNow } from "@/lib/useNow";

// Día en formato "YYYY-MM-DD" según la hora local del móvil.
function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayBounds(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { start: new Date(y, m - 1, d).getTime(), end: new Date(y, m - 1, d + 1).getTime() };
}
function shiftDay(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}
const hour = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

const DOT: Record<WorkStatus | "none", string> = {
  red: "bg-signal-red",
  yellow: "bg-signal-yellow",
  green: "bg-signal-green",
  none: "border border-muted/60",
};

export default function ReportPage() {
  const today = dayKey(new Date());
  const [day, setDay] = useState(today);
  const [data, setData] = useState<{
    day: string;
    events: ReportEvent[];
    statuses: Record<string, WorkStatus>;
    sessions: WorkSession[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const { start, end } = dayBounds(day);
    const iso = (t: number) => encodeURIComponent(new Date(t).toISOString());
    fetch(`/api/report?from=${iso(start)}&until=${iso(end)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) setError(body.error ?? "No se pudo cargar el reporte");
        else {
          setError("");
          setData({ day, events: body.events, statuses: body.statuses, sessions: body.sessions ?? [] });
        }
      })
      .catch(() => !cancelled && setError("No se pudo cargar el reporte"));
    return () => {
      cancelled = true;
    };
  }, [day]);

  const loading = !data || data.day !== day;
  const report = useMemo(() => {
    if (!data) return null;
    const { start, end } = dayBounds(data.day);
    return buildDayReport(data.events, data.statuses, start, end);
  }, [data]);
  const now = useNow();
  const isToday = day === today;
  const work = useMemo(() => {
    if (!data) return [];
    const { start, end } = dayBounds(data.day);
    return buildWorkReport(data.sessions, start, end, Math.min(end, now));
  }, [data, now]);
  // Tiempo parado: hasta ahora si es hoy, hasta el final del día si es un día pasado.
  const ref = isToday ? now : dayBounds(day).end;
  const title = new Date(dayBounds(day).start).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const insideTotal = report ? Object.values(report.insideByStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <Header back="/" title={<span className="text-base text-muted">Reporte del día</span>} />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-20 pt-5">
        <section className="animate-fade-up">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDay(shiftDay(day, -1))}
              aria-label="Día anterior"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface transition active:scale-95"
            >
              <Icon name="left" size={20} />
            </button>
            <label className="relative min-w-0 flex-1 text-center">
              <span className="block truncate text-xl font-bold capitalize tracking-tight">
                {isToday ? "Hoy" : title}
              </span>
              <span className="block text-xs text-muted">
                {isToday ? title : formatDate(new Date(dayBounds(day).start).toISOString())} · toca para elegir fecha
              </span>
              <input
                type="date"
                value={day}
                max={today}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                aria-label="Elegir fecha"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <button
              onClick={() => setDay(shiftDay(day, 1))}
              disabled={isToday}
              aria-label="Día siguiente"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface transition active:scale-95 disabled:opacity-30"
            >
              <Icon name="right" size={20} />
            </button>
          </div>

          {report && !loading && (
            <div className="mt-4 grid grid-cols-4 divide-x divide-line rounded-2xl border border-line bg-surface py-3 text-center shadow-card">
              <Stat value={report.entered.length} label="entraron" />
              <Stat value={report.exited.length} label="salieron" />
              <Stat value={insideTotal} label={isToday ? "dentro ahora" : "dentro al cierre"} />
              <Stat value={report.idle.length} label="sin movimiento" warn={report.idle.length > 0} />
            </div>
          )}

          {report && !loading && insideTotal > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
              {[...STATUSES, "none" as const].map((s) =>
                report.insideByStatus[s] ? (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />
                    <span className="font-semibold tabular-nums">{report.insideByStatus[s]}</span>
                    <span className="text-muted">{s === "none" ? "sin estado" : STATUS_INFO[s].label.toLowerCase()}</span>
                  </span>
                ) : null,
              )}
            </div>
          )}
          {!isToday && report && !loading && (
            <p className="mt-2 text-center text-xs text-muted">Los colores son los del semáforo actual.</p>
          )}
        </section>

        {error && <Notice tone="danger">{error}</Notice>}

        {loading && !error && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}

        {report && !loading && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Column title="Entraron" count={report.entered.length} empty="Ninguno">
                {report.entered.map((c) => (
                  <MiniRow key={c.plate} car={c} time={hour(c.at!)} note={c.insideSince ? "Sigue dentro" : "Ya salió"} />
                ))}
              </Column>
              <Column title="Salieron" count={report.exited.length} empty="Ninguno">
                {report.exited.map((c) => (
                  <MiniRow
                    key={c.plate}
                    car={c}
                    time={hour(c.at!)}
                    note={c.stayMs != null ? `${formatDuration(c.stayMs)} dentro` : (c.tag ?? "")}
                  />
                ))}
              </Column>
            </div>

            <WorkSection work={work} />

            <Section
              title="Siguen en el taller"
              hint="Ya estaban dentro y tuvieron actividad este día"
              count={report.active.length}
              empty="Ninguno."
            >
              {report.active.map((c) => (
                <Row key={c.plate} car={c} aside={hour(c.at!)}>
                  {c.tag ?? "Evento"}
                  {c.body && ` · ${c.body}`}
                </Row>
              ))}
            </Section>

            <Section
              title="Sin movimiento"
              hint="Dentro del taller sin ningún evento este día: posibles atascados o una salida sin registrar"
              count={report.idle.length}
              empty="Ninguno. Todos los coches del taller tuvieron actividad."
              warn
            >
              {report.idle.map((c) => (
                <Row
                  key={c.plate}
                  car={c}
                  aside={<span className="font-semibold text-warn">{formatDuration(ref - new Date(c.lastActivity!).getTime())}</span>}
                >
                  Último evento: {formatDate(c.lastActivity!)} · dentro desde {formatDate(c.insideSince!)}
                </Row>
              ))}
            </Section>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className="px-1">
      <div className={`text-xl font-bold tabular-nums ${warn ? "text-warn" : ""}`}>{value}</div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}

function Section({
  title,
  hint,
  count,
  empty,
  warn = false,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  empty: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="animate-fade-up">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${warn && count ? "text-warn" : "text-muted"}`}>
          {title} · {count}
        </h2>
      </div>
      {hint && <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p>}
      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function Row({ car, aside, children }: { car: ReportCar; aside: ReactNode; children: ReactNode }) {
  const s = car.status ?? "none";
  return (
    <li>
      <Link
        href={`/coche/${car.plate}`}
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card transition hover:border-accent/40 active:scale-[0.99]"
      >
        <span
          className={`h-3.5 w-3.5 shrink-0 rounded-full ${DOT[s]}`}
          role="img"
          aria-label={s === "none" ? "Sin estado" : STATUS_INFO[s].label}
          title={s === "none" ? "Sin estado" : STATUS_INFO[s].label}
        />
        <div className="min-w-0 flex-1">
          <PlateBadge plate={car.plate} size="sm" />
          <p className="mt-1 truncate text-sm text-muted">{children}</p>
        </div>
        <div className="shrink-0 text-right text-sm tabular-nums text-muted">{aside}</div>
      </Link>
    </li>
  );
}

function Column({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section className="animate-fade-up min-w-0 rounded-2xl border border-line bg-surface p-2 shadow-card">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        {title} · {count}
      </h2>
      {count === 0 ? <p className="px-1 pb-1 text-sm text-muted">{empty}</p> : <ul className="flex flex-col gap-1">{children}</ul>}
    </section>
  );
}

function MiniRow({ car, time, note }: { car: ReportCar; time: string; note: string }) {
  const s = car.status ?? "none";
  return (
    <li>
      <Link href={`/coche/${car.plate}`} className="block rounded-xl px-1 py-1.5 transition active:bg-surface-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s]}`}
            role="img"
            aria-label={s === "none" ? "Sin estado" : STATUS_INFO[s].label}
          />
          <span className="truncate font-mono text-[15px] font-bold tracking-wide">{car.plate}</span>
        </div>
        <p className="truncate pl-4 text-xs text-muted">
          {time} · {note}
        </p>
      </Link>
    </li>
  );
}

function WorkSection({ work }: { work: ReturnType<typeof buildWorkReport> }) {
  return (
    <section className="animate-fade-up">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Tiempo por operario</h2>
      {work.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          No hay tiempo de trabajo registrado este día.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {work.map((w) => (
            <li key={w.workerId} className="rounded-2xl border border-line bg-surface p-3 shadow-card">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 font-semibold">
                  {w.name}
                  {w.running && <span className="ml-2 text-xs font-semibold text-success">● trabajando</span>}
                </span>
                <span className="text-lg font-bold tabular-nums">{formatDuration(w.totalMs)}</span>
              </div>
              <p className="text-xs text-muted">
                {w.cars.length} {w.cars.length === 1 ? "coche" : "coches"}
                {w.freeMs > 0 && ` · ${formatDuration(w.freeMs)} sin coche`}
              </p>
              {w.cars.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {w.cars.map((c) => (
                    <li key={c.plate}>
                      <Link
                        href={`/coche/${c.plate}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
                      >
                        <span className="font-mono font-bold">{c.plate}</span>
                        <span className="text-muted">{formatDuration(c.ms)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
