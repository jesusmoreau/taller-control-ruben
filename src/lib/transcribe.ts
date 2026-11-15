"use client";

// Transcripción de notas de voz en el dispositivo (Whisper vía transformers.js en un Worker).

export type TranscribeProgress =
  | { stage: "download"; progress: number; loadedMb: number; totalMb: number }
  | { stage: "working" };

let worker: Worker | null = null;
const pending = new Map<
  string,
  { resolve: (t: string) => void; reject: (e: Error) => void; onProgress?: (p: TranscribeProgress) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e) => {
      const msg = e.data as
        | { type: "progress"; progress: number; loaded: number; total: number }
        | { type: "working"; id: string }
        | { type: "result"; id: string; text: string }
        | { type: "error"; id: string; message: string };
      if (msg.type === "progress") {
        // La descarga del modelo es común a todas las transcripciones pendientes.
        for (const p of pending.values()) {
          p.onProgress?.({
            stage: "download",
            progress: msg.progress,
            loadedMb: msg.loaded / 1e6,
            totalMb: msg.total / 1e6,
          });
        }
        return;
      }
      const job = pending.get(msg.id);
      if (!job) return;
      if (msg.type === "working") job.onProgress?.({ stage: "working" });
      else {
        pending.delete(msg.id);
        if (msg.type === "result") job.resolve(msg.text);
        else job.reject(new Error(msg.message));
      }
    });
    worker.addEventListener("error", (e) => {
      for (const [id, job] of pending) {
        job.reject(new Error(e.message || "Error en el transcriptor"));
        pending.delete(id);
      }
      worker = null;
    });
  }
  return worker;
}

// Convierte el audio grabado (m4a/webm) a PCM mono de 16 kHz, que es lo que espera Whisper.
async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(data);
    const length = Math.ceil(decoded.duration * 16000);
    const offline = new OfflineAudioContext(1, Math.max(1, length), 16000);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    ctx.close().catch(() => {});
  }
}

// Si la grabación es prácticamente silencio, Whisper se inventa palabras sueltas ("Y", "Gracias").
// Por debajo de este volumen medio se considera que no se ha dicho nada.
const SILENCE_RMS = 0.003;

export async function transcribe(blob: Blob, onProgress?: (p: TranscribeProgress) => void): Promise<string> {
  const audio = await toPcm16k(blob);
  let sum = 0;
  for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i];
  if (Math.sqrt(sum / Math.max(1, audio.length)) < SILENCE_RMS) return "";
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, audio }, [audio.buffer]);
  });
}
