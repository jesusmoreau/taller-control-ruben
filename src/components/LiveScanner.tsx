"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import { formatPlate } from "@/lib/plate";
import { getWorker, prepareCrop, readCrop } from "@/lib/ocr";
import { Icon } from "./icons";

// Proporción de una placa europea (520 × 110 mm).
const PLATE_RATIO = 520 / 110;
// Lecturas iguales necesarias para dar una matrícula por buena.
const VOTES_NEEDED = 3;

export type LiveResult = { plate: string; photo: Blob };

// Escáner en vivo: cámara a pantalla completa con un recuadro guía.
// Solo se lee lo que queda dentro del recuadro y se exige que varias lecturas coincidan.
export function LiveScanner({ onResult, onClose }: { onResult: (r: LiveResult) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"starting" | "loading" | "scanning" | "error">("starting");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const votes = new Map<string, number>();

    async function capturePhoto(): Promise<Blob> {
      const v = video.current!;
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("captura"))), "image/jpeg", 0.9));
      return compressImage(blob);
    }

    async function finish(plate: string) {
      if (doneRef.current) return;
      doneRef.current = true;
      if (navigator.vibrate) navigator.vibrate(40);
      const photo = await capturePhoto();
      onResultRef.current({ plate, photo });
    }

    // Convierte el recuadro guía (coordenadas de pantalla) a coordenadas del vídeo.
    function guideInVideo() {
      const v = video.current!;
      const box = frame.current!.getBoundingClientRect();
      const g = guide.current!.getBoundingClientRect();
      const scale = Math.max(box.width / v.videoWidth, box.height / v.videoHeight);
      const ox = (box.width - v.videoWidth * scale) / 2;
      const oy = (box.height - v.videoHeight * scale) / 2;
      // Un pequeño margen extra por si la matrícula no está perfectamente centrada.
      const padX = g.width * 0.04;
      const padY = g.height * 0.15;
      return {
        x: Math.max(0, (g.left - box.left - padX - ox) / scale),
        y: Math.max(0, (g.top - box.top - padY - oy) / scale),
        w: (g.width + padX * 2) / scale,
        h: (g.height + padY * 2) / scale,
      };
    }

    async function tick() {
      if (stopped || doneRef.current) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const r = guideInVideo();
        const found = await readCrop(prepareCrop(v, r.x, r.y, r.w, r.h)).catch(() => null);
        if (found && !stopped) {
          const n = (votes.get(found.plate) ?? 0) + 1;
          votes.set(found.plate, n);
          setCandidate(found.plate);
          if (n >= VOTES_NEEDED) return finish(found.plate);
        }
      }
      timer = setTimeout(tick, 250);
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        if (caps.torch) setTorch(false);
        video.current!.srcObject = stream;
        await video.current!.play();
        setStatus("loading");
        await getWorker();
        if (stopped) return;
        setStatus("scanning");
        tick();
      } catch (e) {
        setStatus("error");
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Sin permiso para usar la cámara. Actívalo en los ajustes del navegador."
            : "No se pudo abrir la cámara.",
        );
      }
    }

    start();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      stopped = true;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      document.body.style.overflow = overflow;
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch(!torch);
  }

  async function acceptCandidate() {
    if (!candidate || doneRef.current) return;
    doneRef.current = true;
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
    onResult({ plate: candidate, photo: await compressImage(blob) });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Escanear matrícula" className="animate-pop-in fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div ref={frame} className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        {/* Recuadro guía con el resto oscurecido */}
        <div className="absolute inset-0 flex items-center justify-center px-[7%]">
          <div
            ref={guide}
            className="relative w-full rounded-xl shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
            style={{ aspectRatio: PLATE_RATIO }}
          >
            <span className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-white" />
            <span className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-white" />
            <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-white" />
            {status === "scanning" && (
              <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
            )}
          </div>
        </div>

        {/* Barra superior */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <button onClick={onClose} aria-label="Cerrar escáner" className="grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur">
            <Icon name="x" />
          </button>
          {torch !== null && (
            <button
              onClick={toggleTorch}
              aria-label={torch ? "Apagar linterna" : "Encender linterna"}
              className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur ${torch ? "bg-white text-black" : "bg-black/40"}`}
            >
              <Icon name="sun" />
            </button>
          )}
        </div>
      </div>

      {/* Panel inferior */}
      <div className="flex flex-col items-center gap-3 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 text-center">
        {status === "error" ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : candidate ? (
          <>
            <p className="text-sm text-white/70">Leyendo… ¿es esta?</p>
            <button
              onClick={acceptCandidate}
              className="animate-pop-in flex items-center gap-3 rounded-2xl bg-white px-5 py-3 font-mono text-2xl font-bold tracking-widest text-neutral-900"
            >
              {formatPlate(candidate)}
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#12a150] text-white">
                <Icon name="check" size={18} />
              </span>
            </button>
          </>
        ) : (
          <>
            <p className="font-medium">
              {status === "scanning" ? "Encaja la matrícula en el recuadro" : status === "loading" ? "Preparando el lector…" : "Abriendo la cámara…"}
            </p>
            <p className="text-sm text-white/60">
              {status === "loading" ? "Solo la primera vez tarda unos segundos." : "Acércate hasta que ocupe todo el recuadro, con buena luz."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
