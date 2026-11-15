"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlateBadge } from "@/components/PlateBadge";
import { normalizePlate } from "@/lib/plate";
import type { CarEvent } from "@/lib/types";

export function CarView({ plate: rawPlate }: { plate: string }) {
  const plate = normalizePlate(rawPlate);
  const [events, setEvents] = useState<CarEvent[] | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events?plate=${plate}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setError(data.error ?? "Error cargando eventos");
        else setEvents(data.events);
      });
    return () => {
      cancelled = true;
    };
  }, [plate, version]);

  async function remove(id: string) {
    setConfirmDelete(null);
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) setVersion((v) => v + 1);
    else setError("No se pudo borrar el evento");
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl">←</Link>
        <PlateBadge plate={plate} large />
      </header>

      <Link
        href={`/nuevo?plate=${plate}`}
        className="rounded-xl bg-green-600 px-4 py-3 text-center font-semibold text-white active:bg-green-700"
      >
        + Nuevo evento para este coche
      </Link>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {events === null && !error && <p className="text-neutral-500">Cargando…</p>}
      {events?.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-neutral-500 dark:border-neutral-700">
          No hay eventos para esta matrícula.
        </p>
      )}

      <ol className="flex flex-col gap-4">
        {events?.map((e) => (
          <li key={e.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-start justify-between gap-2">
              <time className="font-semibold">
                {new Date(e.occurred_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
              </time>
              {confirmDelete === e.id ? (
                <span className="flex gap-2 text-sm">
                  <button onClick={() => remove(e.id)} className="font-semibold text-red-600">Borrar</button>
                  <button onClick={() => setConfirmDelete(null)} className="text-neutral-500">Cancelar</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(e.id)} className="text-sm text-neutral-400" aria-label="Borrar evento">
                  🗑️
                </button>
              )}
            </div>
            {e.description && <p className="mt-2 whitespace-pre-wrap">{e.description}</p>}
            {e.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {e.photos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setViewer(p.url)}
                    className="relative aspect-square overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {p.kind === "plate" && (
                      <span className="absolute left-1 top-1 rounded bg-blue-700 px-1 text-[10px] font-bold text-white">MATRÍCULA</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      {viewer && (
        <button
          onClick={() => setViewer(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2"
          aria-label="Cerrar foto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </main>
  );
}
