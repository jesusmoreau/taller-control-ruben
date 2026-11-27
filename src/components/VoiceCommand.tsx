"use client";

// Comandos de voz: se toca el micro, se dice "el 1234 está terminado" y aparece una tarjeta
// con el coche y el cambio para confirmarlo. Nada se aplica sin pulsar Confirmar.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { PlateBadge } from "@/components/PlateBadge";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { pickMime } from "@/components/VoiceRecorder";
import { BLOCK_REASONS, STATUS_INFO, type WorkStatus } from "@/lib/status";
import { transcribe } from "@/lib/transcribe";
import type { PlateSummary } from "@/lib/types";
import {
  VOICE_ACTIONS,
  eventDescription,
  isStatusAction,
  parseVoiceCommand,
  type VoiceAction,
  type VoiceActionKind,
} from "@/lib/voice-command";

const MAX_MS = 15_000; // un comando es una frase corta
// Fuera del componente: la regla de pureza de React no distingue los manejadores de eventos del render.
const nowMs = () => Date.now();

const DOT: Record<WorkStatus | "none", string> = {
  red: "bg-signal-red",
  yellow: "bg-signal-yellow",
  green: "bg-signal-green",
  blue: "bg-signal-blue",
  none: "border border-muted/60",
};

const ACTION_LABEL: Record<VoiceActionKind, string> = {
  red: STATUS_INFO.red.label,
  yellow: STATUS_INFO.yellow.label,
  green: STATUS_INFO.green.label,
  blue: STATUS_INFO.blue.label,
  clear: "Sin estado",
  Llegada: "Llegada",
  Diagnosticado: "Diagnosticado",
  Reparación: "Reparación",
  Salida: "Salida",
};

type Phase =
  | { step: "idle" }
  | { step: "recording"; startedAt: number }
  | { step: "thinking"; info: string }
  | { step: "review"; transcript: string }
  | { step: "error"; message: string };

export function VoiceCommand({ onApplied }: { onApplied: (message: string) => void }) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [cars, setCars] = useState<PlateSummary[]>([]);
  const [plate, setPlate] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [action, setAction] = useState<VoiceAction | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const carsRef = useRef<Promise<PlateSummary[]> | null>(null);

  useEffect(() => () => cleanup.current(), []);

  // Lista fresca de coches cada vez que se habla (el semáforo puede haber cambiado).
  function loadCars() {
    carsRef.current = fetch("/api/events?q=")
      .then((r) => r.json())
      .then((d) => (d.plates ?? []) as PlateSummary[])
      .catch(() => []);
    carsRef.current.then(setCars);
  }

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return setPhase({ step: "error", message: "Este navegador no permite grabar audio." });
    }
    loadCars();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return setPhase({
        step: "error",
        message:
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Sin permiso para usar el micrófono. Actívalo en los ajustes del navegador."
            : "No se pudo abrir el micrófono.",
      });
    }

    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = nowMs();

    let raf = 0;
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      audioCtx.resume().catch(() => {});
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* sin medidor */
    }
    const timer = setInterval(() => {
      const ms = nowMs() - startedAt;
      setElapsed(ms);
      if (ms >= MAX_MS && rec.state === "recording") rec.stop();
    }, 200);

    cleanup.current = () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      audioCtx?.close().catch(() => {});
      stream.getTracks().forEach((t) => t.stop());
      if (rec.state === "recording") {
        rec.onstop = null;
        rec.stop();
      }
    };

    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const durationMs = nowMs() - startedAt;
      cleanup.current();
      cleanup.current = () => {};
      setElapsed(0);
      setLevel(0);
      const blob = new Blob(chunks, { type: (rec.mimeType || mime || "audio/webm").split(";")[0] });
      if (blob.size === 0 || durationMs < 600) {
        return setPhase({ step: "error", message: "No se ha oído nada. Toca el micro y di, por ejemplo: «el 1234 está terminado»." });
      }
      understand(blob);
    };

    recorder.current = rec;
    rec.start(500);
    navigator.vibrate?.(20);
    setPhase({ step: "recording", startedAt });
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function understand(blob: Blob) {
    setPhase({ step: "thinking", info: "Entendiendo…" });
    try {
      const text = await transcribe(blob, (p) =>
        setPhase({
          step: "thinking",
          info: p.stage === "download" ? `Descargando el transcriptor (solo la primera vez): ${Math.round(p.progress)} %` : "Entendiendo…",
        }),
      );
      if (!text) {
        return setPhase({ step: "error", message: "No se ha entendido nada. Inténtalo otra vez hablando cerca del móvil." });
      }
      const list = (await carsRef.current) ?? [];
      const cmd = parseVoiceCommand(text, list);
      setPlate(cmd.car.plate);
      setOptions(cmd.car.options);
      setAction(cmd.action);
      setPhase({ step: "review", transcript: text });
    } catch {
      setPhase({ step: "error", message: "No se pudo pasar a texto. Inténtalo de nuevo." });
    }
  }

  function close() {
    cleanup.current();
    cleanup.current = () => {};
    setPhase({ step: "idle" });
  }

  function retry() {
    close();
    start();
  }

  const recording = phase.step === "recording";

  return (
    <>
      <button
        onClick={recording ? stop : start}
        disabled={phase.step === "thinking"}
        aria-label={recording ? "Parar y entender" : "Comando de voz"}
        title="Comando de voz"
        className={`grid h-14 w-14 place-items-center rounded-full shadow-card transition active:scale-95 disabled:opacity-60 ${
          recording ? "bg-danger text-white" : "border border-line bg-surface text-danger"
        }`}
      >
        <Icon name={recording ? "stop" : phase.step === "thinking" ? "loader" : "mic"} size={22} />
      </button>

      {(recording || phase.step === "thinking" || phase.step === "error") &&
        createPortal(
          <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
            <div className="animate-fade-up flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
              {recording ? (
                <>
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Escuchando… {Math.floor(elapsed / 1000)} s</p>
                    <p className="truncate text-xs text-muted">«el 1234 está terminado» · toca ■ al acabar</p>
                  </div>
                  <div className="flex h-6 w-16 items-center gap-0.5" aria-hidden>
                    {Array.from({ length: 8 }, (_, i) => {
                      const h = Math.max(0.15, level * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + elapsed / 150))));
                      return <span key={i} className="w-1 flex-1 rounded-full bg-danger/70" style={{ height: `${h * 100}%` }} />;
                    })}
                  </div>
                </>
              ) : phase.step === "thinking" ? (
                <>
                  <Icon name="loader" size={18} className="text-accent" />
                  <p className="flex-1 text-sm font-medium">{phase.info}</p>
                </>
              ) : phase.step === "error" ? (
                <>
                  <Icon name="alert" size={18} className="text-danger" />
                  <p className="flex-1 text-sm">{phase.message}</p>
                  <button onClick={close} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2">
                    <Icon name="x" size={16} />
                  </button>
                </>
              ) : null}
            </div>
          </div>,
          document.body,
        )}

      {phase.step === "review" && (
        <ReviewSheet
          transcript={phase.transcript}
          cars={cars}
          plate={plate}
          options={options}
          action={action}
          onPlate={setPlate}
          onAction={setAction}
          onRetry={retry}
          onCancel={close}
          onDone={(message) => {
            close();
            onApplied(message);
          }}
        />
      )}
    </>
  );
}

function ReviewSheet({
  transcript,
  cars,
  plate,
  options,
  action,
  onPlate,
  onAction,
  onRetry,
  onCancel,
  onDone,
}: {
  transcript: string;
  cars: PlateSummary[];
  plate: string | null;
  options: string[];
  action: VoiceAction | null;
  onPlate: (p: string | null) => void;
  onAction: (a: VoiceAction | null) => void;
  onRetry: () => void;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(!plate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const car = cars.find((c) => c.plate === plate) ?? null;
  // Para elegir: primero las dudas del intérprete; si no, los coches que están en el taller.
  const inside = cars.filter((c) => c.insideSince).map((c) => c.plate);
  const choices = options.length ? options : inside.length ? inside : cars.slice(0, 12).map((c) => c.plate);

  const kind = action?.kind ?? null;
  const needsText = kind === "red" && action?.reason === "Otro";
  const showText = kind !== null && !isStatusAction(kind) ? true : kind === "red";
  const ready = Boolean(plate && action && !(needsText && !action.text.trim()));

  function setKind(k: VoiceActionKind) {
    onAction({
      kind: k,
      reason: k === "red" ? (action?.reason ?? BLOCK_REASONS[0]) : null,
      text: action?.text ?? "",
    });
  }

  async function confirm() {
    if (!plate || !action) return;
    setSaving(true);
    setError("");
    try {
      let res: Response;
      if (isStatusAction(action.kind)) {
        const status = action.kind === "clear" ? null : action.kind;
        res = await fetch(`/api/cars/${plate}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status,
            blockedReason: status === "red" ? action.reason : null,
            blockedNote: status === "red" ? action.text.trim() || null : null,
          }),
        });
      } else {
        res = await fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plate, occurredAt: new Date().toISOString(), description: eventDescription(action), photos: [], audios: [] }),
        });
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      navigator.vibrate?.(15);
      onDone(`${plate} · ${ACTION_LABEL[action.kind]}`);
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar comando de voz"
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mb-3 flex items-start gap-3">
          <Icon name="mic" size={20} className="mt-0.5 text-danger" />
          <p className="flex-1 text-base italic text-fg/90">«{transcript}»</p>
          <button onClick={onCancel} aria-label="Cancelar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Coche */}
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Coche</p>
        {plate && !picking ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3">
            <PlateBadge plate={plate} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {car ? [car.make, car.model].filter(Boolean).join(" ") : ""}
            </span>
            <button onClick={() => setPicking(true)} className="shrink-0 text-sm font-semibold text-accent">
              Cambiar
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-sm text-muted">
              {options.length ? "Hay varios coches con esos números. ¿Cuál es?" : "No he reconocido el coche. Elígelo:"}
            </p>
            {choices.length ? (
              <div className="flex flex-wrap gap-2">
                {choices.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      onPlate(p);
                      setPicking(false);
                    }}
                    aria-pressed={plate === p}
                    className={`rounded-xl border p-1.5 transition active:scale-95 ${plate === p ? "border-accent bg-accent-soft" : "border-line bg-surface-2"}`}
                  >
                    <PlateBadge plate={p} size="sm" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No hay coches registrados.</p>
            )}
          </div>
        )}

        {/* Acción */}
        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Cambio</p>
        {!action && <p className="mb-2 text-sm text-muted">No he entendido qué hacer. Elígelo:</p>}
        {car && action && isStatusAction(action.kind) && (
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className={`h-3 w-3 rounded-full ${DOT[car.status ?? "none"]}`} />
            {car.status ? STATUS_INFO[car.status].label : "Sin estado"}
            <span className="text-muted">→</span>
            <span className={`h-3 w-3 rounded-full ${DOT[action.kind === "clear" ? "none" : action.kind]}`} />
            {ACTION_LABEL[action.kind]}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {VOICE_ACTIONS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                kind === k ? "border-fg bg-fg text-bg" : "border-line bg-surface-2 text-fg"
              }`}
            >
              {isStatusAction(k) && <span className={`h-2.5 w-2.5 rounded-full ${DOT[k === "clear" ? "none" : k]}`} />}
              {ACTION_LABEL[k]}
            </button>
          ))}
        </div>

        {kind === "red" && action && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {BLOCK_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => onAction({ ...action, reason: r })}
                aria-pressed={action.reason === r}
                className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition active:scale-95 ${
                  action.reason === r ? "border-signal-red bg-danger-soft text-signal-red" : "border-line bg-surface-2 text-fg"
                } ${r === "Otro" ? "col-span-2" : ""}`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {showText && action && (
          <input
            value={action.text}
            onChange={(e) => onAction({ ...action, text: e.target.value })}
            placeholder={kind === "red" ? (needsText ? "Describe el motivo" : "Nota (opcional)") : "Texto del evento (opcional)"}
            className={`${inputClass} mt-3`}
          />
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
          <button onClick={onRetry} disabled={saving} className={secondaryButton}>
            <Icon name="mic" size={18} />
            Repetir
          </button>
          <button onClick={confirm} disabled={!ready || saving} className={`${primaryButton} py-3.5`}>
            {saving ? <Icon name="loader" size={18} /> : <Icon name="check" size={18} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
