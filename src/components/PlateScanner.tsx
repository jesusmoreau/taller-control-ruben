"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import { readPlateFromPhoto } from "@/lib/ocr";
import { Icon } from "./icons";
import { LiveScanner } from "./LiveScanner";
import { primaryButton } from "./ui";

export type ScanResult = { plate: string; photo: Blob };

const canUseLiveCamera = () =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

// Botón que abre el escáner en vivo. Si el navegador no permite la cámara en vivo,
// usa la cámara normal y lee la franja central de la foto.
// variant "button": botón grande con texto. variant "icon": botón compacto (para el buscador).
export function PlateScanner({
  onResult,
  label = "Escanear matrícula",
  variant = "button",
}: {
  onResult: (r: ScanResult) => void;
  label?: string;
  variant?: "button" | "icon";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setError("");
    if (canUseLiveCamera()) setLive(true);
    else input.current?.click();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const photo = await compressImage(file, 1600, 0.9);
      const found = await readPlateFromPhoto(photo);
      if (!found) throw new Error("No he podido leer la matrícula. Acércate más o escríbela a mano.");
      onResult({ plate: found.plate, photo });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const hidden = (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      {live && (
        <LiveScanner
          onClose={() => setLive(false)}
          onResult={(r) => {
            setLive(false);
            onResult(r);
          }}
        />
      )}
    </>
  );

  if (variant === "icon") {
    return (
      <>
        {hidden}
        <button
          type="button"
          disabled={busy}
          onClick={open}
          aria-label="Escanear matrícula con la cámara"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm transition hover:brightness-110 active:scale-95 disabled:opacity-70"
        >
          <Icon name={busy ? "loader" : "scan"} size={22} />
        </button>
        {error && <p className="animate-fade-up col-span-full mt-1 text-sm text-danger">{error}</p>}
      </>
    );
  }

  return (
    <div>
      {hidden}
      <button type="button" disabled={busy} onClick={open} className={`${primaryButton} w-full py-3.5`}>
        <Icon name={busy ? "loader" : "scan"} />
        {busy ? "Leyendo matrícula…" : label}
      </button>
      {error && <p className="animate-fade-up mt-2 text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
