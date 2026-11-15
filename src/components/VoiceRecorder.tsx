"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

export type RecordedNote = { id: string; blob: Blob; url: string; durationMs: number; mime: string; ext: string };

const MAX_MS = 5 * 60 * 1000; // 5 minutos por nota

// Formatos en orden de preferencia. iPhone graba en mp4 (AAC); Chrome/Android en webm (Opus).
const CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const noop = () => () => {};

// Grabadora de notas de voz. Al terminar entrega el audio con onRecorded.
export function VoiceRecorder({ onRecorded }: { onRecorded: (note: RecordedNote) => void }) {
  const supported = useSyncExternalStore(
    noop,
    () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  useEffect(() => () => cleanup.current(), []);

  async function start() {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Sin permiso para usar el micrófono. Actívalo en los ajustes del navegador."
          : "No se pudo abrir el micrófono.",
      );
      return;
    }

    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = Date.now();

    // Medidor de volumen para que se vea que está grabando.
    let raf = 0;
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      // Algunos navegadores lo crean en pausa; sin esto el medidor no se mueve.
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
      /* sin medidor: no es imprescindible */
    }

    const timer = setInterval(() => {
      const ms = Date.now() - startedAt;
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
      const durationMs = Date.now() - startedAt;
      cleanup.current();
      cleanup.current = () => {};
      setRecording(false);
      setElapsed(0);
      setLevel(0);
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type });
      if (blob.size === 0 || durationMs < 500) {
        setError("La grabación ha salido vacía. Mantén pulsado un poco más.");
        return;
      }
      onRecordedRef.current({
        id: crypto.randomUUID(),
        blob,
        url: URL.createObjectURL(blob),
        durationMs,
        mime: type,
        ext: extFor(type),
      });
    };

    recorder.current = rec;
    rec.start(1000);
    setRecording(true);
    if (navigator.vibrate) navigator.vibrate(20);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  if (!supported) return null;

  if (recording) {
    return (
      <div className="animate-fade-up mt-2 flex w-full basis-full items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-3 py-2">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-danger">{formatClock(elapsed)}</span>
        {/* Barras de nivel */}
        <div className="flex h-6 flex-1 items-center gap-0.5" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => {
            const h = Math.max(0.12, level * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + elapsed / 150))));
            return <span key={i} className="w-1 flex-1 rounded-full bg-danger/70" style={{ height: `${h * 100}%` }} />;
          })}
        </div>
        <button
          type="button"
          onClick={stop}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Icon name="stop" size={14} />
          Parar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={start}
        className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-fg transition hover:brightness-95 active:scale-95"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-danger" />
        Grabar nota de voz
      </button>
      {error && <p className="animate-fade-up mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
