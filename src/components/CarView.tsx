"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Icon } from "@/components/icons";
import { Lightbox } from "@/components/Lightbox";
import { PlateBadge } from "@/components/PlateBadge";
import { TrafficLight } from "@/components/TrafficLight";
import { Header, Notice, Skeleton, Toast } from "@/components/ui";
import { normalizePlate } from "@/lib/plate";
import { computeStays, formatDuration, splitTag } from "@/lib/tags";
import { formatDate, formatDateTime, timeAgo } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import type { WorkStatus } from "@/lib/status";
import type { CarEvent } from "@/lib/types";

const TAG_STYLE: Record<string, string> = {
  Llegada: "bg-accent-soft text-accent",
  Salida: "bg-surface-2 text-fg",
  Daños: "bg-danger-soft text-danger",
  Reparación: "bg-warn-soft text-warn",
  Revisión: "bg-surface-2 text-fg",
  "Entrega al cliente": "bg-success-soft text-success",
};

export function CarView({ plate: rawPlate }: { plate: string }) {
  const plate = normalizePlate(rawPlate);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [events, setEvents] = useState<CarEvent[] | null>(null);
  const [status, setStatus] = useState<WorkStatus | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; start: number } | null>(null);
  const [toast, setToast] = useState(params.get("guardado") ? "Evento guardado" : "");
  const [version, setVersion] = useState(0);

  // Quitar ?guardado=1 de la URL para que el aviso no reaparezca al recargar.
  useEffect(() => {
    if (params.get("guardado")) router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events?plate=${plate}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setError(data.error ?? "Error cargando eventos");
        else {
          setEvents(data.events);
          setStatus(data.status ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plate, version]);

  async function remove(id: string) {
    setConfirmDelete(null);
    setDeleting(id);
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) {
      setToast("Evento borrado");
      setVersion((v) => v + 1);
    } else setError("No se pudo borrar el evento");
  }

  const clearToast = useCallback(() => setToast(""), []);
  const photoCount = events?.reduce((n, e) => n + e.photos.length, 0) ?? 0;
  const first = events?.length ? events[events.length - 1].occurred_at : null;
  const now = useNow();
  const stays = events ? computeStays(events, now) : null;

  return (
    <>
      <Header back="/" title={<span className="text-base text-muted">Historial</span>} />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-32 pt-5">
        <section className="animate-fade-up flex flex-col items-center gap-4 text-center">
          <PlateBadge plate={plate} size="lg" />
          {first && <p className="-mt-2 text-xs text-muted">Primer registro: {formatDate(first)}</p>}

          {events ? (
            <TrafficLight key={status ?? "none"} plate={plate} status={status} />
          ) : (
            !error && <Skeleton className="h-[106px] w-full" />
          )}

          {stays?.openSince && (
            <div className="animate-fade-up flex w-full items-center gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-left">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-success">En el taller ahora</p>
                <p className="text-sm text-fg/80">
                  Lleva {formatDuration(now - new Date(stays.openSince).getTime())} · entró el{" "}
                  {formatDateTime(stays.openSince)}
                </p>
              </div>
            </div>
          )}

          {events && events.length > 0 && (
            <div className="grid w-full grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface py-3 shadow-card">
              <Stat value={stays?.visits ?? 0} label={stays?.visits === 1 ? "visita" : "visitas"} />
              <Stat value={stays && stays.totalMs > 0 ? formatDuration(stays.totalMs) : "–"} label="en el taller" small />
              <Stat value={photoCount} label={photoCount === 1 ? "foto" : "fotos"} />
            </div>
          )}
        </section>

        {error && <Notice tone="danger">{error}</Notice>}

        {events === null && !error && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-28" />
          </div>
        )}

        {events?.length === 0 && (
          <div className="animate-fade-up flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
              <Icon name="car" />
            </div>
            <p className="font-medium">Sin eventos todavía</p>
            <p className="mt-1 text-sm text-muted">Registra la llegada de este coche para empezar su historial.</p>
          </div>
        )}

        {/* Línea de tiempo */}
        <ol className="relative flex flex-col gap-4">
          {events && events.length > 1 && (
            <span className="absolute bottom-6 left-[11px] top-6 w-0.5 rounded-full bg-line" aria-hidden />
          )}
          {events?.map((e, idx) => {
            const { tag, body } = splitTag(e.description);
            const urls = e.photos.map((p) => p.url);
            return (
              <li
                key={e.id}
                className={`animate-fade-up relative pl-9 transition-opacity ${deleting === e.id ? "opacity-40" : ""}`}
                style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
              >
                <span
                  className={`absolute left-0 top-5 grid h-6 w-6 place-items-center rounded-full border-4 border-bg ${
                    idx === 0 ? "bg-accent" : "bg-muted/50"
                  }`}
                  aria-hidden
                />
                <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <time dateTime={e.occurred_at} className="block font-semibold capitalize">
                        {formatDateTime(e.occurred_at)}
                      </time>
                      <span className="text-xs text-muted">{timeAgo(e.occurred_at)}</span>
                    </div>
                    {confirmDelete === e.id ? (
                      <div className="animate-pop-in flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-surface-2"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          className="rounded-lg bg-danger px-2.5 py-1.5 text-sm font-semibold text-white"
                        >
                          Borrar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(e.id)}
                        aria-label="Borrar evento"
                        className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </header>

                  {(tag || stays?.exitDurations.has(e.id)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {tag && (
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TAG_STYLE[tag]}`}>
                          {tag}
                        </span>
                      )}
                      {stays?.exitDurations.has(e.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-fg">
                          <Icon name="clock" size={13} />
                          {formatDuration(stays.exitDurations.get(e.id)!)} en el taller
                        </span>
                      )}
                    </div>
                  )}
                  {body && <p className="mt-2 whitespace-pre-wrap leading-relaxed">{body}</p>}
                  {!tag && !body && !e.audios?.length && (
                    <p className="mt-2 text-sm italic text-muted">Sin descripción</p>
                  )}

                  {e.audios?.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {e.audios.map((a) => (
                        <AudioPlayer key={a.id} src={a.url} durationMs={a.durationMs} />
                      ))}
                    </div>
                  )}

                  {e.photos.length > 0 && (
                    <div className={`mt-3 grid gap-1.5 ${e.photos.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
                      {e.photos.map((p, i) => (
                        <button
                          key={p.id}
                          onClick={() => setViewer({ urls, start: i })}
                          className={`group relative overflow-hidden rounded-xl bg-surface-2 ${
                            e.photos.length === 1 ? "aspect-video" : "aspect-square"
                          }`}
                          aria-label={`Ver foto ${i + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          {p.kind === "plate" && (
                            <span className="absolute bottom-1 left-1 rounded-md bg-[#003399] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              MATRÍCULA
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      </main>

      <Link
        href={`/nuevo?plate=${plate}`}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-20 flex h-14 items-center gap-2 rounded-full bg-accent pl-5 pr-6 font-semibold text-accent-fg shadow-[0_8px_24px_rgb(47_91_234/0.4)] transition hover:brightness-110 active:scale-95"
      >
        <Icon name="plus" size={22} />
        Nuevo evento
      </Link>

      {viewer && <Lightbox urls={viewer.urls} start={viewer.start} onClose={() => setViewer(null)} />}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  );
}

function Stat({ value, label, small = false }: { value: string | number; label: string; small?: boolean }) {
  return (
    <div className="px-2">
      <div className={`font-bold tabular-nums ${small ? "text-sm leading-7" : "text-xl"}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
