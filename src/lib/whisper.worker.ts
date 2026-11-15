// Worker que transcribe audio con Whisper en el propio navegador (transformers.js).
// Corre en un hilo aparte para no congelar la interfaz.
// El modelo (~135 MB) se descarga la primera vez y queda en la caché del navegador.

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

const MODEL = "onnx-community/whisper-base";

env.allowLocalModels = false;

let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  if (!transcriber) {
    transcriber = pipeline("automatic-speech-recognition", MODEL, {
      dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress_total") {
          self.postMessage({ type: "progress", progress: p.progress, loaded: p.loaded, total: p.total });
        }
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    transcriber.catch(() => (transcriber = null));
  }
  return transcriber;
}

self.addEventListener("message", async (e: MessageEvent<{ id: string; audio: Float32Array }>) => {
  const { id, audio } = e.data;
  try {
    const asr = await load();
    self.postMessage({ type: "working", id });
    const out = await asr(audio, {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
    self.postMessage({ type: "result", id, text });
  } catch (err) {
    self.postMessage({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
  }
});
