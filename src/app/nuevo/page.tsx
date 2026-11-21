"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { PlateScanner } from "@/components/PlateScanner";
import { VoiceRecorder, type RecordedNote } from "@/components/VoiceRecorder";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DurationInput, WorkerPicker, postWork, useWorkers } from "@/components/work";
import { Card, Header, Notice, SectionTitle, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { compressImage } from "@/lib/image";
import { formatPlate, isValidPlate, normalizePlate } from "@/lib/plate";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ENTRY_TAG, TAGS, computeStays, formatDuration } from "@/lib/tags";
import type { CarEvent } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { transcribe, type TranscribeProgress } from "@/lib/transcribe";

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
  const [tag, setTag] = useState<string | null>(null);
  // Si el usuario elige el tipo a mano, ya no se cambia automáticamente.
  const [tagTouched, setTagTouched] = useState(false);
  const now = useNow();
  const [carStatus, setCarStatus] = useState<{ plate: string; isNew: boolean; insideSince: string | null } | null>(null);
  const [description, setDescription] = useState("");
  // Tiempo de trabajo opcional: quién trabajó y cuánto (termina a la hora del evento).
  const workers = useWorkers();
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [workMinutes, setWorkMinutes] = useState(0);
  const [photos, setPhotos] = useState<Pending[]>([]);
  const [notes, setNotes] = useState<RecordedNote[]>([]);
  // Estado de la transcripción de cada nota de voz, por id.
  const [stt, setStt] = useState<Record<string, { state: "working" | "done" | "error"; info?: string }>>({});
  const transcribing = Object.values(stt).some((t) => t.state === "working");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const normalized = normalizePlate(plate);
  const plateOk = isValidPlate(normalized);
  const dirty = Boolean(description || photos.length || notes.length || tagTouched || workerIds.length);

  // Al tener una matrícula válida, consultar su historial:
  // coche nuevo o fuera del taller → se marca "Llegada"; si está dentro, se avisa.
  useEffect(() => {
    if (!plateOk) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/events?plate=${normalized}`);
      if (!res.ok || cancelled) return;
      const { events } = (await res.json()) as { events: CarEvent[] };
      const { openSince } = computeStays(events);
      setCarStatus({ plate: normalized, isNew: events.length === 0, insideSince: openSince });
      if (!tagTouched) setTag(openSince ? null : ENTRY_TAG);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [normalized, plateOk, tagTouched]);
  const status = carStatus?.plate === normalized ? carStatus : null;

  // Avisar si se intenta cerrar la página con datos sin guardar.
  useEffect(() => {
    if (!dirty || saving) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty, saving]);

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

  function removePhoto(p: Pending) {
    URL.revokeObjectURL(p.preview);
    setPhotos((l) => l.filter((x) => x.id !== p.id));
  }

  // Guarda la nota y la pasa a texto en el dispositivo; el texto se añade a la descripción.
  async function addNote(n: RecordedNote) {
    setNotes((l) => [...l, n]);
    const set = (state: "working" | "done" | "error", info: string) =>
      setStt((m) => ({ ...m, [n.id]: { state, info } }));
    set("working", "Preparando transcripción…");
    try {
      const text = await transcribe(n.blob, (p: TranscribeProgress) =>
        p.stage === "download"
          ? set("working", `Descargando el transcriptor (solo la primera vez): ${Math.round(p.progress)} %`)
          : set("working", "Pasando a texto…"),
      );
      if (!text) return set("error", "No se ha entendido nada; el audio se guarda igual.");
      setDescription((d) => {
        const clean = text.charAt(0).toUpperCase() + text.slice(1);
        return d.trim() ? `${d.trim()}${/[.!?]$/.test(d.trim()) ? "" : "."} ${clean}` : clean;
      });
      set("done", "Texto añadido a la descripción. Revísalo antes de guardar.");
    } catch {
      set("error", "No se pudo pasar a texto; el audio se guarda igual.");
    }
  }

  async function save() {
    setError("");
    if (!normalized) return setError("Falta la matrícula");
    setSaving(true);
    try {
      // Fotos y notas de voz se suben juntas, directamente a Supabase Storage.
      const files = [
        ...photos.map((p) => ({ blob: p.blob, ext: "jpg", contentType: "image/jpeg" })),
        ...notes.map((n) => ({ blob: n.blob, ext: n.ext, contentType: n.mime })),
      ];
      let paths: string[] = [];
      if (files.length) {
        setProgress({ done: 0, total: files.length });
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plate: normalized, exts: files.map((f) => f.ext) }),
        });
        const { uploads, error: e } = await res.json();
        if (!res.ok) throw new Error(e);
        paths = await Promise.all(
          files.map(async (f, i) => {
            const { path, token } = uploads[i];
            const { error: upErr } = await supabaseBrowser.storage
              .from("photos")
              .uploadToSignedUrl(path, token, f.blob, { contentType: f.contentType });
            if (upErr) throw upErr;
            setProgress((pr) => (pr ? { ...pr, done: pr.done + 1 } : pr));
            return path;
          }),
        );
      }
      const uploadedPhotos = photos.map((p, i) => ({ path: paths[i], kind: p.kind }));
      const uploadedNotes = notes.map((n, i) => ({
        path: paths[photos.length + i],
        durationMs: n.durationMs,
        mime: n.mime,
      }));
      const text = [tag, description.trim()].filter(Boolean).join(": ");
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: normalized,
          occurredAt: new Date(occurredAt).toISOString(),
          description: text,
          photos: uploadedPhotos,
          audios: uploadedNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // El evento ya está guardado: si falla el tiempo, se avisa en la ficha en vez de repetir el evento.
      let saved = "1";
      if (workerIds.length && workMinutes > 0) {
        const end = new Date(occurredAt);
        try {
          await postWork({
            action: "manual",
            workerIds,
            plate: normalized,
            eventId: data.id,
            description: text,
            startedAt: new Date(end.getTime() - workMinutes * 60000).toISOString(),
            endedAt: end.toISOString(),
          });
        } catch {
          saved = "sin-tiempo";
        }
      }
      router.push(`/coche/${normalized}?guardado=${saved}`);
    } catch (e) {
      setSaving(false);
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }


  const buttonLabel = progress
    ? progress.done < progress.total
      ? `Subiendo archivos ${progress.done}/${progress.total}…`
      : "Guardando…"
    : saving
      ? "Guardando…"
      : transcribing
        ? "Pasando la nota a texto…"
        : "Guardar evento";

  return (
    <>
      <Header back={normalized ? `/coche/${normalized}` : "/"} title="Nuevo evento" />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-36 pt-5">
        {/* Matrícula */}
        <Card className="animate-fade-up">
          <SectionTitle>Matrícula</SectionTitle>
          <div className="flex overflow-hidden rounded-xl border-2 border-neutral-900 bg-white shadow-sm focus-within:ring-4 focus-within:ring-accent/25">
            <div className="flex w-10 flex-col items-center justify-end bg-[#003399] pb-1.5 text-sm font-bold text-white">
              <span className="mb-auto mt-1.5 text-[10px] text-[#ffcc00]">★</span>E
            </div>
            <input
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value);
                setScanInfo("");
              }}
              placeholder="1234 BCD"
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Matrícula"
              className="min-w-0 flex-1 bg-white px-3 py-3 text-center font-mono text-3xl font-bold uppercase tracking-[0.15em] text-neutral-900 outline-none placeholder:text-neutral-300"
            />
            {normalized && plateOk && (
              <div className="grid place-items-center pr-3 text-[#12a150]">
                <Icon name="check" />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {normalized && !plateOk && (
              <Notice tone="warn">
                “{formatPlate(normalized)}” no parece una matrícula española. Puedes guardarla igualmente.
              </Notice>
            )}
            {scanInfo && <Notice tone="warn">{scanInfo}</Notice>}
            {status?.isNew && (
              <Notice tone="success">Coche nuevo: se registrará como llegada al taller.</Notice>
            )}
            {status?.insideSince && (
              <Notice tone="success">
                Este coche está en el taller desde hace{" "}
                {formatDuration(now - new Date(status.insideSince).getTime())}. Si sale ahora, marca “Salida” o
                “Entrega al cliente” y se calculará el tiempo.
              </Notice>
            )}
          </div>
          <div className="mt-3">
            <PlateScanner
              label={normalized ? "Volver a escanear" : "Escanear matrícula"}
              onResult={(r) => {
                setPlate(r.plate);
                setScanInfo("Leída con la cámara: comprueba que coincide antes de guardar.");
                addPhoto(r.photo, "plate");
              }}
            />
          </div>
        </Card>

        {/* Qué ha pasado */}
        <Card className="animate-fade-up [animation-delay:40ms]">
          <SectionTitle>¿Qué ha pasado?</SectionTitle>
          <div className="-mx-1 mb-3 flex flex-wrap gap-2 px-1">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTagTouched(true);
                  setTag((cur) => (cur === t ? null : t));
                }}
                aria-pressed={tag === t}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                  tag === t
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-line bg-surface-2 text-fg hover:border-accent/40"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Ej.: llega con daños en la parte interna de la puerta del conductor."
            className={`${inputClass} resize-none`}
          />
          <VoiceRecorder onRecorded={addNote} />
          {notes.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {notes.map((n) => (
                <div key={n.id} className="animate-pop-in">
                  <AudioPlayer
                    src={n.url}
                    durationMs={n.durationMs}
                    onRemove={() => {
                      URL.revokeObjectURL(n.url);
                      setNotes((l) => l.filter((x) => x.id !== n.id));
                      setStt((m) => {
                        const rest = { ...m };
                        delete rest[n.id];
                        return rest;
                      });
                    }}
                  />
                  {stt[n.id] && (
                    <p
                      className={`mt-1 flex items-center gap-1.5 px-2 text-xs ${
                        stt[n.id].state === "error" ? "text-danger" : stt[n.id].state === "done" ? "text-success" : "text-muted"
                      }`}
                    >
                      <Icon
                        name={stt[n.id].state === "working" ? "loader" : stt[n.id].state === "done" ? "check" : "alert"}
                        size={13}
                      />
                      {stt[n.id].info}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <Icon name="clock" size={18} className="text-muted" />
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              aria-label="Fecha y hora"
              className={`${inputClass} min-w-0 flex-1 px-3 py-2.5 text-[15px]`}
            />
            <button
              type="button"
              onClick={() => setOccurredAt(nowLocal())}
              className="shrink-0 rounded-lg px-2 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
            >
              Ahora
            </button>
          </div>
        </Card>

        {/* Tiempo de trabajo */}
        {workers && workers.length > 0 && (
          <Card className="animate-fade-up [animation-delay:60ms]">
            <SectionTitle aside={<span className="text-xs text-muted">Opcional</span>}>Tiempo de trabajo</SectionTitle>
            <p className="mb-2 text-sm text-muted">¿Quién trabajó en el coche?</p>
            <WorkerPicker workers={workers} selected={workerIds} onChange={setWorkerIds} />
            {workerIds.length > 0 && (
              <div className="animate-fade-up mt-4">
                <p className="mb-2 text-sm text-muted">¿Cuánto tiempo{workerIds.length > 1 ? " cada uno" : ""}?</p>
                <DurationInput minutes={workMinutes} onChange={setWorkMinutes} />
                {workMinutes === 0 && <p className="mt-2 text-xs text-warn">Indica el tiempo o quita los operarios.</p>}
              </div>
            )}
          </Card>
        )}

        {/* Fotos */}
        <Card className="animate-fade-up [animation-delay:80ms]">
          <SectionTitle aside={photos.length > 0 && <span className="text-xs text-muted">{photos.length}</span>}>
            Fotos
          </SectionTitle>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="animate-pop-in relative aspect-square overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                {p.kind === "plate" && (
                  <span className="absolute bottom-1 left-1 rounded-md bg-[#003399] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    MATRÍCULA
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p)}
                  className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition active:scale-90"
                  aria-label="Quitar foto"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted transition hover:border-accent hover:text-accent active:scale-95"
            >
              <Icon name="camera" size={24} />
              <span className="text-xs font-medium">Hacer foto</span>
            </button>
          </div>
          <button type="button" onClick={() => gallery.current?.click()} className={`${secondaryButton} mt-3 w-full py-2.5 text-sm`}>
            <Icon name="image" size={18} />
            Añadir desde la galería
          </button>
        </Card>

        {error && <Notice tone="danger">{error}</Notice>}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/60 bg-header p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
        <button onClick={save} disabled={saving || transcribing || !normalized || (workerIds.length > 0 && workMinutes === 0)} className={`${primaryButton} relative mx-auto flex w-full max-w-xl overflow-hidden py-4 text-lg`}>
          {progress && (
            <span
              className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          )}
          <span className="relative flex items-center gap-2">
            <Icon name={saving ? "loader" : "check"} />
            {buttonLabel}
          </span>
        </button>
      </div>
    </>
  );
}

export default function NewEventPage() {
  return (
    <Suspense>
      <NewEventForm />
    </Suspense>
  );
}
