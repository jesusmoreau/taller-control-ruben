"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Header, Notice, SectionTitle, Skeleton, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { ManualWorkForm, SessionList, WorkerPicker, formatClock, postWork, sessionMs, useWorkers } from "@/components/work";
import { formatDuration } from "@/lib/tags";
import { useNow } from "@/lib/useNow";
import type { WorkSession } from "@/lib/types";

// Trabajo que no es de ningún coche (almacén, recados, limpieza…): con cronómetro o metido a mano.
export default function FreeWorkPage() {
  const workers = useWorkers();
  const [sessions, setSessions] = useState<WorkSession[] | null>(null);
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = useNow(1000);

  const load = useCallback(async () => {
    const data = await fetch("/api/work?free=1")
      .then((r) => r.json())
      .catch(() => ({}));
    setSessions(data.sessions ?? []);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      navigator.vibrate?.(15);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const start = () =>
    run(async () => {
      for (const workerId of selected) await postWork({ action: "start", workerId, plate: null, description });
      setDescription("");
      setSelected([]);
    });

  const running = sessions?.filter((s) => !s.endedAt) ?? [];
  const done = sessions?.filter((s) => s.endedAt) ?? [];
  const total = done.reduce((t, s) => t + sessionMs(s, now), 0);

  return (
    <>
      <Header back="/" title={<span className="text-base text-muted">Trabajo sin coche</span>} />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-20 pt-5">
        <p className="animate-fade-up text-sm text-muted">
          Para el tiempo que no es de ningún coche: almacén, recados, limpieza, pedidos…
        </p>

        {running.length > 0 && (
          <Card className="animate-fade-up border-success/40">
            <SectionTitle>En marcha</SectionTitle>
            <ul className="flex flex-col gap-2">
              {running.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl bg-success-soft px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.workerName}</p>
                    <p className="truncate text-sm text-fg/80">{s.description}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-success">{formatClock(sessionMs(s, now))}</span>
                  <button
                    onClick={() => run(() => postWork({ action: "stop", workerId: s.workerId }))}
                    disabled={busy}
                    className="flex h-11 items-center gap-1.5 rounded-full bg-fg px-4 text-sm font-semibold text-bg active:scale-95 disabled:opacity-50"
                  >
                    <Icon name="stop" size={14} />
                    Terminar
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="animate-fade-up">
          {!workers ? (
            <Skeleton className="h-48" />
          ) : manual ? (
            <>
              <SectionTitle>Añadir tiempo a mano</SectionTitle>
              <ManualWorkForm
                workers={workers}
                plate={null}
                mode="range"
                onCancel={() => setManual(false)}
                onSaved={() => {
                  setManual(false);
                  load();
                }}
              />
            </>
          ) : (
            <>
              <SectionTitle>Comenzar trabajo</SectionTitle>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="¿Qué se va a hacer? Ej.: ordenar el almacén"
                className={inputClass}
              />
              <p className="mb-2 mt-4 text-sm font-semibold">¿Quién?</p>
              <WorkerPicker workers={workers} selected={selected} onChange={setSelected} />
              <p className="mt-2 text-xs text-muted">Si alguno tiene un cronómetro en marcha en un coche, se pausa.</p>
              <button
                onClick={start}
                disabled={busy || !description.trim() || !selected.length}
                className={`${primaryButton} mt-4 w-full py-3.5`}
              >
                <Icon name={busy ? "loader" : "play"} size={18} />
                Comenzar
              </button>
              <button onClick={() => setManual(true)} className={`${secondaryButton} mt-2 w-full py-2.5 text-sm`}>
                <Icon name="plus" size={16} />
                Ya está hecho: poner el tiempo a mano
              </button>
            </>
          )}
          {error && (
            <div className="mt-3">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}
        </Card>

        <Card className="animate-fade-up">
          <SectionTitle aside={total > 0 && <span className="text-xs font-semibold text-muted">{formatDuration(total)}</span>}>
            Últimos 7 días
          </SectionTitle>
          {!sessions ? (
            <Skeleton className="h-20" />
          ) : done.length ? (
            <SessionList sessions={done} now={now} onDeleted={load} />
          ) : (
            <p className="text-sm text-muted">Todavía no hay trabajo sin coche.</p>
          )}
        </Card>
      </main>
    </>
  );
}
