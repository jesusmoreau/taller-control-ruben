"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

// Tipos mínimos de la Web Speech API (no vienen en todas las versiones de lib.dom).
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

// Botón de dictado: transcribe lo que se dice (español) y lo entrega con onText.
// Si el navegador no soporta reconocimiento de voz, no se muestra.
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const supported = useSyncExternalStore(noop, () => Boolean(getCtor()), () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => () => rec.current?.abort(), []);

  function start() {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError("");
    const r = new Ctor();
    r.lang = "es-ES";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onTextRef.current(res[0].transcript.trim());
        else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Sin permiso para usar el micrófono. Actívalo en los ajustes del navegador.");
      } else if (e.error === "no-speech") {
        setError("No se ha oído nada. Prueba otra vez.");
      } else if (e.error !== "aborted") {
        setError("El dictado no está disponible ahora mismo.");
      }
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      if (navigator.vibrate) navigator.vibrate(20);
    } catch {
      setError("No se pudo iniciar el dictado.");
    }
  }

  function stop() {
    rec.current?.stop();
  }

  if (!supported) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
          listening ? "bg-danger text-white" : "bg-accent-soft text-accent hover:brightness-95"
        }`}
      >
        <span className="relative grid place-items-center">
          {listening && <span className="absolute h-6 w-6 animate-ping rounded-full bg-white/40" />}
          <Icon name={listening ? "stop" : "mic"} size={18} />
        </span>
        {listening ? "Parar dictado" : "Dictar por voz"}
      </button>
      {listening && (
        <p className="animate-fade-up mt-2 text-sm text-muted">
          {interim ? <span className="italic">“{interim}”</span> : "Escuchando… habla con normalidad."}
        </p>
      )}
      {error && <p className="animate-fade-up mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
