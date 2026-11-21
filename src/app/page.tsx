"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PlateBadge } from "@/components/PlateBadge";
import { PlateScanner } from "@/components/PlateScanner";
import { TrafficLightCompact } from "@/components/TrafficLight";
import { Header, SectionTitle, Skeleton, inputClass } from "@/components/ui";
import { formatPlate, normalizePlate } from "@/lib/plate";
import { STATUSES, STATUS_INFO, type WorkStatus } from "@/lib/status";
import { formatDuration } from "@/lib/tags";
import { timeAgo } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import type { PlateSummary } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; plates: PlateSummary[] } | null>(null);
  const query = normalizePlate(q);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/events?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!cancelled) setResult({ q: query, plates: data.plates ?? [] });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Filtros: dónde está el coche y color del semáforo. Se recuerdan en la sesión
  // para que sigan puestos al volver de la ficha de un coche.
  // (Solo se pintan cuando ya han llegado los datos, así que leerlos al iniciar no descuadra la hidratación.)
  const [onlyInside, setOnlyInside] = useState(() => readFilters()?.onlyInside ?? false);
  const [color, setColor] = useState<ColorFilter>(() => readFilters()?.color ?? null);
  useEffect(() => saveFilters({ onlyInside, color }), [onlyInside, color]);

  const now = useNow();
  const loading = !result || result.q !== query;
  const allPlates = result?.plates ?? [];
  const insideCount = allPlates.filter((p) => p.insideSince).length;
  const showInside = onlyInside && insideCount > 0;
  const located = showInside ? allPlates.filter((p) => p.insideSince) : allPlates;
  const colorCount = (c: Exclude<ColorFilter, null>) =>
    located.filter((p) => (c === "none" ? !p.status : p.status === c)).length;
  const plates = color ? located.filter((p) => (color === "none" ? !p.status : p.status === color)) : located;
  const filtered = showInside || color !== null;

  // Al tocar un semáforo de la lista, actualizar el resumen para que filtros y contadores cuadren.
  function setPlateStatus(plate: string, status: WorkStatus | null) {
    setResult((r) => r && { ...r, plates: r.plates.map((p) => (p.plate === plate ? { ...p, status } : p)) });
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <>
      <Header
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
              <Icon name="car" size={18} />
            </span>
            Taller
          </span>
        }
        actions={
          <>
          <Link
            href="/reporte"
            aria-label="Reporte del día"
            title="Reporte del día"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
          >
            <Icon name="calendar" size={18} />
          </Link>
          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
          >
            <Icon name="logout" size={18} />
          </button>
          </>
        }
      />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-32 pt-5">
        <section className="animate-fade-up">
          <h1 className="text-3xl font-bold tracking-tight">Buscar coche</h1>
          <p className="mt-1 text-sm text-muted">Escribe la matrícula o hazle una foto.</p>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && plates.length === 1) router.push(`/coche/${plates[0].plate}`);
                }}
                placeholder="1234 BCD"
                autoCapitalize="characters"
                autoComplete="off"
                enterKeyHint="search"
                inputMode="text"
                className={`${inputClass} h-12 pl-11 pr-10 font-mono text-lg uppercase tracking-wider`}
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  aria-label="Borrar búsqueda"
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
            <PlateScanner variant="icon" onResult={(r) => setQ(formatPlate(r.plate))} />
          </div>
        </section>

        <section>
          <SectionTitle aside={!loading && plates.length > 0 && <span className="text-xs text-muted">{plates.length}</span>}>
            {query ? "Resultados" : "Actividad reciente"}
          </SectionTitle>

          {insideCount > 0 && (
            <div className="-mt-1 mb-3 flex gap-2">
              {[
                { on: false, label: "Todos" },
                { on: true, label: `En el taller · ${insideCount}` },
              ].map((f) => (
                <button
                  key={f.label}
                  onClick={() => setOnlyInside(f.on)}
                  aria-pressed={showInside === f.on}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                    showInside === f.on
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-line bg-surface text-fg hover:border-accent/40"
                  }`}
                >
                  {f.on && <span className="h-2 w-2 rounded-full bg-success" />}
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {allPlates.length > 0 && (
            <div
              role="group"
              aria-label="Filtrar por semáforo"
              className="-mx-4 -mt-1 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
            >
              {[...STATUSES, "none" as const].map((c) => {
                const on = color === c;
                const n = colorCount(c);
                return (
                  <button
                    key={c}
                    onClick={() => setColor(on ? null : c)}
                    aria-pressed={on}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                      on ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg hover:border-accent/40"
                    } ${n === 0 && !on ? "opacity-50" : ""}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${CHIP_DOT[c]}`} />
                    {c === "none" ? "Sin estado" : STATUS_INFO[c].label}
                    <span className={`tabular-nums ${on ? "text-bg/70" : "text-muted"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {loading && plates.length === 0 && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[76px]" />
              ))}
            </div>
          )}

          {!loading && plates.length === 0 && filtered && allPlates.length > 0 && (
            <div className="animate-fade-up flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <p className="font-medium">Ningún coche con este filtro</p>
              <button
                onClick={() => {
                  setOnlyInside(false);
                  setColor(null);
                }}
                className="mt-3 text-sm font-semibold text-accent"
              >
                Quitar filtros
              </button>
            </div>
          )}

          {!loading && plates.length === 0 && !(filtered && allPlates.length > 0) && (
            <div className="animate-fade-up flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
                <Icon name={query ? "search" : "car"} />
              </div>
              {query ? (
                <>
                  <p className="font-medium">Sin eventos para {formatPlate(query)}</p>
                  <p className="mt-1 text-sm text-muted">¿Es la primera vez que entra este coche?</p>
                  <Link href={`/nuevo?plate=${query}`} className="mt-4 text-sm font-semibold text-accent">
                    Crear el primer evento →
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-medium">Todavía no hay coches</p>
                  <p className="mt-1 text-sm text-muted">Registra el primer evento con el botón “Nuevo”.</p>
                </>
              )}
            </div>
          )}

          <ul className={`flex flex-col gap-2 transition-opacity ${loading && plates.length ? "opacity-60" : ""}`}>
            {plates.map((p, i) => (
              <li
                key={p.plate}
                className="animate-fade-up flex overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:border-accent/40"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <Link
                  href={`/coche/${p.plate}`}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 transition active:bg-surface-2/60"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {p.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-muted">
                        <Icon name="car" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <PlateBadge plate={p.plate} size="sm" />
                    <p className="mt-1 truncate text-sm text-muted">{p.lastDescription || "Sin descripción"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs text-muted">
                    {p.insideSince ? (
                      <div className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        {formatDuration(now - new Date(p.insideSince).getTime())}
                      </div>
                    ) : (
                      <div>{timeAgo(p.last)}</div>
                    )}
                    <div className="rounded-full bg-surface-2 px-2 py-0.5 font-medium tabular-nums text-fg">
                      {p.events} {p.events === 1 ? "evento" : "eventos"}
                    </div>
                  </div>
                </Link>
                {/* key con el estado: si llega un valor nuevo del servidor, el semáforo se reinicia con él */}
                <TrafficLightCompact
                  key={p.status ?? "none"}
                  plate={p.plate}
                  status={p.status}
                  onChange={(s) => setPlateStatus(p.plate, s)}
                />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Link
        href={query ? `/nuevo?plate=${query}` : "/nuevo"}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-20 flex h-14 items-center gap-2 rounded-full bg-accent pl-5 pr-6 font-semibold text-accent-fg shadow-[0_8px_24px_rgb(47_91_234/0.4)] transition hover:brightness-110 active:scale-95"
      >
        <Icon name="plus" size={22} />
        Nuevo
      </Link>
    </>
  );
}

type ColorFilter = WorkStatus | "none" | null;

const CHIP_DOT: Record<Exclude<ColorFilter, null>, string> = {
  red: "bg-signal-red",
  yellow: "bg-signal-yellow",
  green: "bg-signal-green",
  none: "border border-muted/60",
};

const FILTERS_KEY = "filtros-inicio";

function readFilters(): { onlyInside: boolean; color: ColorFilter } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(FILTERS_KEY) ?? "null");
    if (!v) return null;
    const color = [...STATUSES, "none"].includes(v.color) ? v.color : null;
    return { onlyInside: v.onlyInside === true, color };
  } catch {
    return null;
  }
}

function saveFilters(v: { onlyInside: boolean; color: ColorFilter }) {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(v));
  } catch {}
}
