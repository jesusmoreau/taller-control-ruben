"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/image";
import { readPlate } from "@/lib/ocr";

export type ScanResult = { plate: string; valid: boolean; confidence: string; photo: Blob };

// Botón que abre la cámara trasera y lee la matrícula en el propio navegador.
export function PlateScanner({
  onResult,
  label = "Escanear matrícula",
  className = "",
}: {
  onResult: (r: ScanResult) => void;
  label?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const photo = await compressImage(file, 1600, 0.9);
      const data = await readPlate(photo);
      if (!data.plate) {
        throw new Error("No he podido leer la matrícula. Acércate más, con buena luz, o escríbela a mano.");
      }
      onResult({ ...data, photo });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white active:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Leyendo matrícula… (la primera vez tarda más)" : `📷 ${label}`}
      </button>
      <p className="mt-1 text-xs text-neutral-500">Encuadra solo la matrícula, que ocupe casi todo el ancho.</p>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
