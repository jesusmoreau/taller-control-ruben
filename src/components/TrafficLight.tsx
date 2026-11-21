"use client";

import { useState } from "react";
import { STATUSES, STATUS_INFO, type WorkStatus } from "@/lib/status";

const LIGHT: Record<WorkStatus, { on: string; off: string; text: string }> = {
  red: {
    on: "bg-signal-red shadow-[0_0_12px_2px_var(--signal-red)]",
    off: "bg-signal-red/20",
    text: "text-signal-red",
  },
  yellow: {
    on: "bg-signal-yellow shadow-[0_0_12px_2px_var(--signal-yellow)]",
    off: "bg-signal-yellow/20",
    text: "text-signal-yellow",
  },
  green: {
    on: "bg-signal-green shadow-[0_0_12px_2px_var(--signal-green)]",
    off: "bg-signal-green/20",
    text: "text-signal-green",
  },
};

// Guarda el estado en el servidor con actualización optimista: cambia al instante
// y, si falla, vuelve al color anterior.
function useStatus(plate: string, initial: WorkStatus | null, onChange?: (s: WorkStatus | null) => void) {
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pick(next: WorkStatus) {
    const value = status === next ? null : next; // tocar la luz encendida la apaga
    const prev = status;
    setStatus(value);
    setFailed(false);
    setSaving(true);
    navigator.vibrate?.(15);
    const res = await fetch(`/api/cars/${plate}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: value }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) onChange?.(value);
    else {
      setStatus(prev);
      setFailed(true);
    }
  }

  return { status, saving, failed, pick };
}

/** Semáforo vertical compacto, pensado para el lateral de una tarjeta de la lista. */
export function TrafficLightCompact({
  plate,
  status: initial,
  onChange,
}: {
  plate: string;
  status: WorkStatus | null;
  onChange?: (s: WorkStatus | null) => void;
}) {
  const { status, failed, pick } = useStatus(plate, initial, onChange);
  return (
    <div
      role="radiogroup"
      aria-label="Estado del trabajo"
      className={`flex w-12 shrink-0 flex-col border-l border-line bg-surface-2/60 py-1 ${failed ? "animate-shake" : ""}`}
    >
      {STATUSES.map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={status === s}
          aria-label={STATUS_INFO[s].label}
          title={STATUS_INFO[s].label}
          onClick={() => pick(s)}
          className="grid flex-1 place-items-center transition active:scale-90"
        >
          <span
            className={`block h-4 w-4 rounded-full transition duration-200 ${status === s ? LIGHT[s].on : LIGHT[s].off}`}
          />
        </button>
      ))}
    </div>
  );
}

/** Semáforo grande con etiquetas, para la ficha del coche. */
export function TrafficLight({
  plate,
  status: initial,
}: {
  plate: string;
  status: WorkStatus | null;
}) {
  const { status, failed, pick } = useStatus(plate, initial);
  return (
    <div className="w-full">
      <div
        role="radiogroup"
        aria-label="Estado del trabajo"
        className={`grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-card ${
          failed ? "animate-shake" : ""
        }`}
      >
        {STATUSES.map((s) => {
          const on = status === s;
          return (
            <button
              key={s}
              role="radio"
              aria-checked={on}
              onClick={() => pick(s)}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl px-1 py-3 transition active:scale-95 ${
                on ? "bg-surface-2" : "hover:bg-surface-2/60"
              }`}
            >
              <span
                className={`block h-8 w-8 rounded-full transition duration-200 ${on ? LIGHT[s].on : LIGHT[s].off}`}
              />
              <span className={`text-sm font-semibold ${on ? LIGHT[s].text : "text-muted"}`}>
                {STATUS_INFO[s].label}
              </span>
            </button>
          );
        })}
      </div>
      <p className={`mt-1.5 text-center text-xs ${failed ? "text-danger" : "text-muted"}`}>
        {failed
          ? "No se pudo guardar el estado. Inténtalo de nuevo."
          : status
            ? STATUS_INFO[status].hint
            : "Sin estado · toca un color para marcarlo"}
      </p>
    </div>
  );
}
