"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { PlateScanner } from "@/components/PlateScanner";
import { compressImage } from "@/lib/image";
import { formatPlate, isValidPlate, normalizePlate } from "@/lib/plate";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Pending = { id: string; blob: Blob; preview: string; kind: "plate" | "car" };

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function NewEventForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [plate, setPlate] = useState(params.get("plate") ?? "");
  const [scanInfo, setScanInfo] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocal);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Pending[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  function addPhoto(blob: Blob, kind: Pending["kind"]) {
    setPhotos((list) => [
      // Solo una foto de matrícula por evento: si se escanea otra vez, se reemplaza.
      ...(kind === "plate" ? list.filter((p) => p.kind !== "plate") : list),
      { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob), kind },
    ]);
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) addPhoto(await compressImage(f), "car");
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
  }

  const normalized = normalizePlate(plate);
  const plateOk = isValidPlate(normalized);

  async function save() {
    setError("");
    if (!normalized) return setError("Falta la matrícula");
    try {
      let uploaded: { path: string; kind: Pending["kind"] }[] = [];
      if (photos.length) {
        setStatus(`Subiendo ${photos.length} foto(s)…`);
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plate: normalized, count: photos.length }),
        });
        const { uploads, error: e } = await res.json();
        if (!res.ok) throw new Error(e);
        uploaded = await Promise.all(
          photos.map(async (p, i) => {
            const { path, token } = uploads[i];
            const { error: upErr } = await supabaseBrowser.storage
              .from("photos")
              .uploadToSignedUrl(path, token, p.blob, { contentType: "image/jpeg" });
            if (upErr) throw upErr;
            return { path, kind: p.kind };
          }),
        );
      }
      setStatus("Guardando evento…");
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: normalized,
          occurredAt: new Date(occurredAt).toISOString(),
          description,
          photos: uploaded,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/coche/${normalized}`);
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = Boolean(status);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-4 pb-28">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl">←</Link>
        <h1 className="text-2xl font-bold">Nuevo evento</h1>
      </header>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold uppercase text-neutral-500">Matrícula</label>
        <PlateScanner
          onResult={(r) => {
            setPlate(r.plate);
            setScanInfo(
              r.confidence === "high" && r.valid
                ? ""
                : "Revisa la matrícula: la lectura no es del todo segura.",
            );
            addPhoto(r.photo, "plate");
          }}
        />
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="1234 BCD"
          autoCapitalize="characters"
          className="rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-center font-mono text-2xl uppercase tracking-widest dark:border-neutral-700"
        />
        {normalized && !plateOk && (
          <p className="text-sm text-amber-600">
            “{formatPlate(normalized)}” no parece una matrícula española. Puedes guardarla igualmente.
          </p>
        )}
        {scanInfo && <p className="text-sm text-amber-600">{scanInfo}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold uppercase text-neutral-500">Fecha y hora</label>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="rounded-xl border border-neutral-300 bg-transparent px-4 py-3 dark:border-neutral-700"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold uppercase text-neutral-500">Evento</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Ej.: Coche llegando con daños en la parte interna de la puerta."
          className="rounded-xl border border-neutral-300 bg-transparent px-4 py-3 dark:border-neutral-700"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold uppercase text-neutral-500">Fotos ({photos.length})</label>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => camera.current?.click()} className="rounded-xl border border-neutral-300 px-4 py-3 font-semibold dark:border-neutral-700">
            📷 Hacer foto
          </button>
          <button type="button" onClick={() => gallery.current?.click()} className="rounded-xl border border-neutral-300 px-4 py-3 font-semibold dark:border-neutral-700">
            🖼️ Galería
          </button>
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                {p.kind === "plate" && (
                  <span className="absolute left-1 top-1 rounded bg-blue-700 px-1 text-[10px] font-bold text-white">MATRÍCULA</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(p.preview);
                    setPhotos((l) => l.filter((x) => x.id !== p.id));
                  }}
                  className="absolute right-1 top-1 h-7 w-7 rounded-full bg-black/60 text-white"
                  aria-label="Quitar foto"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-background p-4 dark:border-neutral-800">
        <button
          onClick={save}
          disabled={busy || !normalized}
          className="mx-auto block w-full max-w-xl rounded-xl bg-green-600 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60"
        >
          {status || "Guardar evento"}
        </button>
      </div>
    </main>
  );
}

export default function NewEventPage() {
  return (
    <Suspense>
      <NewEventForm />
    </Suspense>
  );
}
