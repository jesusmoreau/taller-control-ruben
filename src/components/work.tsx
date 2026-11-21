"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PlateBadge } from "@/components/PlateBadge";
import { Card, Notice, SectionTitle, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { formatDuration } from "@/lib/tags";
import { useNow } from "@/lib/useNow";
import type { Worker, WorkSession } from "@/lib/types";

// ── Utilidades ────────────────────────────────────────────────────────────────

export function sessionMs(s: WorkSession, now: number) {
  return Math.max(0, (s.endedAt ? new Date(s.endedAt).getTime() : now) - new Date(s.startedAt).getTime());
}

/** "1:05:09" para cronómetros en marcha. */
export function formatClock(ms: number) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function nowLocalInput(d = new Date()): string {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

export async function postWork(body: Record<string, unknown>) {
  const res = await fetch("/api/work", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new Error("Sin conexión");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
}

export function useWorkers() {
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  useEffect(() => {
    fetch("/api/workers")
      .then((r) => r.json())
      .then((d) => setWorkers(d.workers ?? []))
      .catch(() => setWorkers([]));
  }, []);
  return workers;
}

// ── Selección de operarios (✅ uno o todos) ───────────────────────────────────

export function WorkerPicker({
  workers,
  selected,
  onChange,
}: {
  workers: Worker[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const all = workers.length > 0 && workers.every((w) => selected.includes(w.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {workers.map((w) => {
        const on = selected.includes(w.id);
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => toggle(w.id)}
            aria-pressed={on}
            className={`flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition active:scale-95 ${
              on ? "border-success bg-success-soft text-success" : "border-line bg-surface-2 text-fg"
            }`}
          >
            {on && <Icon name="check" size={16} />}
            {w.name}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(all ? [] : workers.map((w) => w.id))}
        className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent"
      >
        {all ? "Ninguno" : "Todos"}
      </button>
    </div>
  );
}

// ── Duración (h y min, con atajos) ────────────────────────────────────────────

const QUICK = [15, 30, 60, 120, 240];

export function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const num = (v: string) => Math.max(0, Math.min(999, Number.parseInt(v || "0", 10) || 0));
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={24}
            value={h || ""}
            placeholder="0"
            onChange={(e) => onChange(Math.min(24, num(e.target.value)) * 60 + m)}
            className={`${inputClass} px-3 py-2.5 text-center text-lg font-semibold`}
            aria-label="Horas"
          />
          <span className="text-sm text-muted">h</span>
        </label>
        <label className="flex flex-1 items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            step={5}
            value={m || ""}
            placeholder="0"
            onChange={(e) => onChange(h * 60 + Math.min(59, num(e.target.value)))}
            className={`${inputClass} px-3 py-2.5 text-center text-lg font-semibold`}
            aria-label="Minutos"
          />
          <span className="text-sm text-muted">min</span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            aria-pressed={minutes === q}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition active:scale-95 ${
              minutes === q ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface text-fg"
            }`}
          >
            {q < 60 ? `${q} min` : `${q / 60} h`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tiempo metido a mano ──────────────────────────────────────────────────────

/**
 * Formulario de tiempo a mano. Con plate → trabajo en ese coche; sin plate → trabajo sin coche
 * (la descripción es obligatoria). `mode="range"` pide hora de inicio y fin en vez de duración.
 */
export function ManualWorkForm({
  workers,
  plate,
  mode = "duration",
  onSaved,
  onCancel,
}: {
  workers: Worker[];
  plate: string | null;
  mode?: "duration" | "range";
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [endAt, setEndAt] = useState(() => nowLocalInput());
  const [startAt, setStartAt] = useState(() => nowLocalInput(new Date(Date.now() - 60 * 60 * 1000)));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const start = mode === "range" ? new Date(startAt) : new Date(new Date(endAt).getTime() - minutes * 60000);
  const end = new Date(endAt);
  const validTime = end.getTime() > start.getTime();
  const canSave = selected.length > 0 && validTime && (plate || description.trim()) && !saving;

  async function save() {
    setSaving(true);
    setError("");
    try {
      await postWork({
        action: "manual",
        workerIds: selected,
        plate,
        description,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold">¿Quién trabajó?</p>
        <WorkerPicker workers={workers} selected={selected} onChange={setSelected} />
      </div>
      {!plate && (
        <div>
          <p className="mb-2 text-sm font-semibold">¿Qué se hizo?</p>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej.: ordenar el almacén, recoger piezas"
            className={inputClass}
          />
        </div>
      )}
      {mode === "duration" ? (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold">¿Cuánto tiempo{selected.length > 1 ? " cada uno" : ""}?</p>
            <DurationInput minutes={minutes} onChange={setMinutes} />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Terminó</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className={`${inputClass} px-3 py-2.5 text-[15px]`}
            />
          </label>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-semibold">Comenzó</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className={`${inputClass} px-2 py-2.5 text-[14px]`}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-semibold">Terminó</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className={`${inputClass} px-2 py-2.5 text-[14px]`}
            />
          </label>
        </div>
      )}
      {validTime ? (
        <p className="-mt-2 text-xs text-muted">
          {formatDuration(end.getTime() - start.getTime())}
          {selected.length > 1 && ` × ${selected.length} operarios`}
        </p>
      ) : (
        <p className="-mt-2 text-xs text-danger">La hora de fin debe ser posterior a la de inicio.</p>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={`${secondaryButton} flex-1`}>
            Cancelar
          </button>
        )}
        <button type="button" onClick={save} disabled={!canSave} className={`${primaryButton} flex-[2]`}>
          <Icon name={saving ? "loader" : "check"} size={18} />
          Guardar tiempo
        </button>
      </div>
    </div>
  );
}

// ── Lista de tramos (con borrado) ─────────────────────────────────────────────

export function SessionList({
  sessions,
  now,
  showPlate = false,
  onDeleted,
}: {
  sessions: WorkSession[];
  now: number;
  showPlate?: boolean;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  async function remove(id: string) {
    setConfirm(null);
    await fetch(`/api/work/${id}`, { method: "DELETE" });
    onDeleted();
  }
  return (
    <ul className="divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate">
              <span className="font-semibold">{s.workerName}</span>
              {s.description && <span className="text-muted"> · {s.description}</span>}
            </p>
            <p className="text-xs text-muted">
              {day(s.startedAt)} · {time(s.startedAt)}–{s.endedAt ? time(s.endedAt) : "ahora"}
              {s.source === "manual" && " · a mano"}
            </p>
            {showPlate && s.plate && (
              <div className="mt-1">
                <PlateBadge plate={s.plate} size="sm" />
              </div>
            )}
          </div>
          <span className={`shrink-0 font-semibold tabular-nums ${s.endedAt ? "" : "text-success"}`}>
            {s.endedAt ? formatDuration(sessionMs(s, now)) : formatClock(sessionMs(s, now))}
          </span>
          {confirm === s.id ? (
            <button onClick={() => remove(s.id)} className="shrink-0 rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-white">
              Borrar
            </button>
          ) : (
            <button
              onClick={() => setConfirm(s.id)}
              aria-label="Borrar tramo"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Panel de trabajo de un coche ──────────────────────────────────────────────

export function CarWorkPanel({ plate }: { plate: string }) {
  const workers = useWorkers();
  const [sessions, setSessions] = useState<WorkSession[] | null>(null);
  const [running, setRunning] = useState<WorkSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState("");
  const now = useNow(1000);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/work?plate=${plate}`).then((r) => r.json()),
      fetch(`/api/work?running=1`).then((r) => r.json()),
    ]).catch(() => [{}, {}]);
    setSessions(a.sessions ?? []);
    setRunning(b.sessions ?? []);
  }, [plate]);

  useEffect(() => {
    // Carga inicial y refresco cada 30 s por si otro móvil arranca o para un cronómetro.
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  async function toggle(w: Worker, isRunningHere: boolean) {
    setBusy(w.id);
    setError("");
    try {
      await postWork(isRunningHere ? { action: "stop", workerId: w.id } : { action: "start", workerId: w.id, plate });
      navigator.vibrate?.(15);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  const total = sessions?.reduce((t, s) => t + sessionMs(s, now), 0) ?? 0;

  return (
    <Card className="animate-fade-up">
      <SectionTitle aside={total > 0 && <span className="text-xs font-semibold text-muted">Total {formatDuration(total)}</span>}>
        Trabajo en este coche
      </SectionTitle>

      {!workers || !sessions ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {workers.map((w) => {
              const mine = sessions.filter((s) => s.workerId === w.id);
              const ms = mine.reduce((t, s) => t + sessionMs(s, now), 0);
              const live = running.find((s) => s.workerId === w.id);
              const here = live?.plate === plate;
              const elsewhere = live && !here ? (live.plate ?? "sin coche") : null;
              return (
                <li
                  key={w.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    here ? "border-success/40 bg-success-soft" : "border-line bg-surface-2/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{w.name}</p>
                    <p className="truncate text-xs text-muted">
                      {here ? (
                        <span className="font-semibold text-success">Trabajando · {formatClock(sessionMs(live, now))}</span>
                      ) : elsewhere ? (
                        `Ahora en ${elsewhere}`
                      ) : ms > 0 ? (
                        `${formatDuration(ms)} en este coche`
                      ) : (
                        "Sin tiempo en este coche"
                      )}
                    </p>
                  </div>
                  {here && ms > 0 && <span className="text-xs tabular-nums text-muted">{formatDuration(ms)}</span>}
                  <button
                    onClick={() => toggle(w, here)}
                    disabled={busy === w.id}
                    aria-label={here ? `Pausar a ${w.name}` : `Empezar a ${w.name}`}
                    className={`flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
                      here ? "bg-fg text-bg" : "bg-success text-white"
                    }`}
                  >
                    <Icon name={busy === w.id ? "loader" : here ? "pause" : "play"} size={16} />
                    {here ? "Pausar" : ms > 0 ? "Seguir" : "Empezar"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Al empezar aquí, se pausa el cronómetro que tuviera en marcha en otro sitio.</p>

          {error && (
            <div className="mt-3">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}

          <div className="mt-4 border-t border-line pt-4">
            {manual ? (
              <ManualWorkForm
                workers={workers}
                plate={plate}
                onCancel={() => setManual(false)}
                onSaved={() => {
                  setManual(false);
                  load();
                }}
              />
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setManual(true)} className={`${secondaryButton} flex-1 py-2.5 text-sm`}>
                  <Icon name="plus" size={16} />
                  Añadir tiempo a mano
                </button>
                {sessions.length > 0 && (
                  <button onClick={() => setShowLog((v) => !v)} className={`${secondaryButton} py-2.5 text-sm`}>
                    {showLog ? "Ocultar" : `Registro (${sessions.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {showLog && sessions.length > 0 && (
            <div className="mt-3">
              <SessionList sessions={sessions} now={now} onDeleted={load} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
