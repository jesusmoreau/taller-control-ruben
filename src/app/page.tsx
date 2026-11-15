"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlateScanner } from "@/components/PlateScanner";
import { PlateBadge } from "@/components/PlateBadge";
import { normalizePlate } from "@/lib/plate";
import type { PlateSummary } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [plates, setPlates] = useState<PlateSummary[] | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/events?q=${encodeURIComponent(normalizePlate(q))}`);
      const data = await res.json();
      setPlates(data.plates ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coches</h1>
        <Link
          href="/nuevo"
          className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white active:bg-green-700"
        >
          + Nuevo evento
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar matrícula (ej. 1234 BCD)"
          autoCapitalize="characters"
          className="rounded-xl border border-neutral-300 bg-transparent px-4 py-3 font-mono text-lg uppercase dark:border-neutral-700"
        />
        <PlateScanner
          label="Buscar por foto"
          onResult={(r) => router.push(`/coche/${r.plate}`)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">
          {q ? "Resultados" : "Últimos coches"}
        </h2>
        {plates === null && <p className="text-neutral-500">Cargando…</p>}
        {plates?.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-neutral-500 dark:border-neutral-700">
            {q ? (
              <>
                Sin eventos para <b>{normalizePlate(q)}</b>.{" "}
                <Link className="text-blue-600 underline" href={`/nuevo?plate=${normalizePlate(q)}`}>
                  Crear uno
                </Link>
              </>
            ) : (
              "Todavía no hay eventos."
            )}
          </div>
        )}
        {plates?.map((p) => (
          <Link
            key={p.plate}
            href={`/coche/${p.plate}`}
            className="flex items-center justify-between rounded-xl border border-neutral-200 p-3 active:bg-neutral-100 dark:border-neutral-800 dark:active:bg-neutral-900"
          >
            <PlateBadge plate={p.plate} />
            <span className="text-right text-sm text-neutral-500">
              {p.events} evento{p.events === 1 ? "" : "s"}
              <br />
              {new Date(p.last).toLocaleDateString("es-ES")}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
