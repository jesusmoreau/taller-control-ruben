"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { formatClock } from "./VoiceRecorder";

// Reproductor compacto para notas de voz. Usa la duración guardada porque
// los webm grabados en el navegador a menudo no la llevan en los metadatos.
export function AudioPlayer({
  src,
  durationMs,
  onRemove,
}: {
  src: string;
  durationMs: number;
  onRemove?: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime * 1000);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onError = () => setError(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("pause", onPause);
    a.addEventListener("play", onPlay);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("error", onError);
    };
  }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // Pausar cualquier otra nota que esté sonando.
      document.querySelectorAll("audio").forEach((other) => other !== a && other.pause());
      a.play().catch(() => setError(true));
    } else a.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audio.current;
    if (!a || !durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = (durationMs / 1000) * ratio;
    setCurrent(durationMs * ratio);
  }

  const progress = durationMs ? Math.min(1, current / durationMs) : 0;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2 pr-3">
      <audio ref={audio} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        disabled={error}
        aria-label={playing ? "Pausar nota de voz" : "Reproducir nota de voz"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition active:scale-95 disabled:opacity-40"
      >
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <div className="min-w-0 flex-1">
        {error ? (
          <p className="text-xs text-danger">Este móvil no puede reproducir este audio.</p>
        ) : (
          <div className="group relative h-6 cursor-pointer" onClick={seek}>
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
            <div
              className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
        {playing || current > 0 ? formatClock(current) : formatClock(durationMs)}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar nota de voz"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
