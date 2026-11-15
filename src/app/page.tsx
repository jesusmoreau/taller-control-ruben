"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PlateBadge } from "@/components/PlateBadge";
import { PlateScanner } from "@/components/PlateScanner";
import { Header, SectionTitle, Skeleton, inputClass } from "@/components/ui";
import { formatPlate, normalizePlate } from "@/lib/plate";
import { timeAgo } from "@/lib/time";
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

  const loading = !result || result.q !== query;
  const plates = result?.plates ?? [];

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
          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
          >
            <Icon name="logout" size={18} />
          </button>
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

          {loading && plates.length === 0 && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[76px]" />
              ))}
            </div>
          )}

          {!loading && plates.length === 0 && (
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
              <li key={p.plate} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <Link
                  href={`/coche/${p.plate}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card transition hover:border-accent/40 active:scale-[0.99]"
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
                  <div className="shrink-0 text-right text-xs text-muted">
                    <div>{timeAgo(p.last)}</div>
                    <div className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 font-medium tabular-nums text-fg">
                      {p.events} {p.events === 1 ? "evento" : "eventos"}
                    </div>
                  </div>
                </Link>
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
