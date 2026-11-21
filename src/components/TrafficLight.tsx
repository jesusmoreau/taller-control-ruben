"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { inputClass, primaryButton } from "@/components/ui";
import { BLOCK_REASONS, STATUSES, STATUS_INFO, type WorkStatus } from "@/lib/status";

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

export type LightState = { status: WorkStatus | null; blockedReason: string | null; blockedNote: string | null };

// Guarda el estado en el servidor con actualización optimista: cambia al instante
// y, si falla, vuelve al anterior. Al poner rojo, primero se pide el motivo.
function useLight(plate: string, initial: LightState, onChange?: (s: LightState) => void) {
  const [state, setState] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [askReason, setAskReason] = useState(false);

  async function save(next: LightState) {
    const prev = state;
    setState(next);
    setFailed(false);
    navigator.vibrate?.(15);
    const res = await fetch(`/api/cars/${plate}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    if (res?.ok) onChange?.(next);
    else {
      setState(prev);
      setFailed(true);
    }
  }

  function pick(s: WorkStatus) {
    if (state.status === s) return save({ status: null, blockedReason: null, blockedNote: null }); // apagar
    if (s === "red") return setAskReason(true);
    save({ status: s, blockedReason: null, blockedNote: null });
  }

  const sheet = askReason && (
    <ReasonSheet
      initial={state.status === "red" ? state : null}
      onCancel={() => setAskReason(false)}
      onSave={(reason, note) => {
        setAskReason(false);
        save({ status: "red", blockedReason: reason, blockedNote: note });
      }}
    />
  );

  return { state, failed, pick, sheet, editReason: () => setAskReason(true) };
}

/** Semáforo vertical compacto, pensado para el lateral de una tarjeta de la lista. */
export function TrafficLightCompact({
  plate,
  initial,
  onChange,
}: {
  plate: string;
  initial: LightState;
  onChange?: (s: LightState) => void;
}) {
  const { state, failed, pick, sheet } = useLight(plate, initial, onChange);
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
          aria-checked={state.status === s}
          aria-label={STATUS_INFO[s].label}
          title={STATUS_INFO[s].label}
          onClick={() => pick(s)}
          className="grid flex-1 place-items-center transition active:scale-90"
        >
          <span
            className={`block h-4 w-4 rounded-full transition duration-200 ${state.status === s ? LIGHT[s].on : LIGHT[s].off}`}
          />
        </button>
      ))}
      {sheet}
    </div>
  );
}

/** Semáforo grande con etiquetas, para la ficha del coche. */
export function TrafficLight({ plate, initial }: { plate: string; initial: LightState }) {
  const { state, failed, pick, sheet, editReason } = useLight(plate, initial);
  const { status } = state;
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
      {status === "red" && (
        <button
          onClick={editReason}
          className="mt-2 flex w-full items-start gap-2 rounded-xl border border-signal-red/30 bg-danger-soft px-3 py-2 text-left text-sm"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-signal-red" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-signal-red">{state.blockedReason ?? "Sin motivo"}</span>
            {state.blockedNote && <span className="block text-fg/80">{state.blockedNote}</span>}
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent">Cambiar</span>
        </button>
      )}
      <p className={`mt-1.5 text-center text-xs ${failed ? "text-danger" : "text-muted"}`}>
        {failed
          ? "No se pudo guardar el estado. Inténtalo de nuevo."
          : status
            ? status === "red"
              ? ""
              : STATUS_INFO[status].hint
            : "Sin estado · toca un color para marcarlo"}
      </p>
      {sheet}
    </div>
  );
}

/** Hoja inferior para elegir por qué el coche está en rojo. */
function ReasonSheet({
  initial,
  onCancel,
  onSave,
}: {
  initial: LightState | null;
  onCancel: () => void;
  onSave: (reason: string, note: string | null) => void;
}) {
  const [reason, setReason] = useState<string | null>(initial?.blockedReason ?? null);
  const [note, setNote] = useState(initial?.blockedNote ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Motivo del bloqueo"
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up w-full max-w-xl rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className={`h-5 w-5 rounded-full ${LIGHT.red.on}`} />
          <h2 className="flex-1 text-lg font-bold">¿Por qué está bloqueado?</h2>
          <button onClick={onCancel} aria-label="Cancelar" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {BLOCK_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition active:scale-95 ${
                reason === r ? "border-signal-red bg-danger-soft text-signal-red" : "border-line bg-surface-2 text-fg"
              } ${r === "Otro" ? "col-span-2" : ""}`}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={reason === "Otro" ? "Describe el motivo" : "Nota (opcional): p. ej. falta la bomba de agua"}
          className={`${inputClass} mt-3`}
        />
        <button
          onClick={() => reason && onSave(reason, note.trim() || null)}
          disabled={!reason || (reason === "Otro" && !note.trim())}
          className={`${primaryButton} mt-4 w-full py-3.5`}
        >
          Poner en rojo
        </button>
      </div>
    </div>,
    document.body,
  );
}
