"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

// Visor de fotos a pantalla completa: flechas, teclado (← → Esc) y deslizar con el dedo.
export function Lightbox({
  urls,
  start,
  onClose,
}: {
  urls: string[];
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const prev = useCallback(() => setI((n) => (n - 1 + urls.length) % urls.length), [urls.length]);
  const next = useCallback(() => setI((n) => (n + 1) % urls.length), [urls.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  const many = urls.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      className="animate-pop-in fixed inset-0 z-50 flex flex-col bg-black/95"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null || !many) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) prev();
        if (dx < -50) next();
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums">
          {i + 1} / {urls.length}
        </span>
        <div className="flex gap-1">
          <a
            href={urls[i]}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir original"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <Icon name="external" />
          </a>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
            <Icon name="x" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={urls[i]}
          src={urls[i]}
          alt=""
          className="animate-pop-in max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {many && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Foto anterior"
              className="absolute left-2 hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
            >
              <Icon name="left" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Foto siguiente"
              className="absolute right-2 hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
            >
              <Icon name="right" />
            </button>
          </>
        )}
      </div>

      {many && (
        <div className="flex justify-center gap-1.5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {urls.map((u, n) => (
            <button
              key={u}
              onClick={() => setI(n)}
              aria-label={`Ir a la foto ${n + 1}`}
              className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
