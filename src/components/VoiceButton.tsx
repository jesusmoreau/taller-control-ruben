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
  maxAlternatives: number;
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

const ERRORS: Record<string, string> = {
  "not-allowed": "Sin permiso para usar el micrófono. Actívalo en los ajustes del navegador.",
  "service-not-allowed": "El navegador no permite el dictado aquí. Prueba a abrir la app desde Safari o Chrome.",
  "no-speech": "No se ha oído nada. Pulsa y habla de nuevo.",
  "audio-capture": "No se puede usar el micrófono. Cierra otras apps que lo estén usando.",
  network: "El dictado necesita conexión a internet.",
};

// Botón de dictado. Cada pulsación graba una frase: se para solo al dejar de hablar
// (más fiable en iPhone y Android que el modo continuo). El texto se entrega con onText.
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

    // Solo una sesión a la vez: cerrar cualquier resto de la anterior.
    if (rec.current) {
      rec.current.onend = null;
      rec.current.onresult = null;
      rec.current.onerror = null;
      rec.current.abort();
      rec.current = null;
    }

    const r = new Ctor();
    r.lang = "es-ES";
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    // Lo último oído en esta sesión. Algunos navegadores (Safari) no marcan el
    // resultado como final; en ese caso se usa esto al terminar.
    let latest = "";
    let delivered = false;

    r.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      latest = text.trim();
      if (final && latest && !delivered) {
        delivered = true;
        onTextRef.current(latest);
        setInterim("");
      } else {
        setInterim(latest);
      }
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      setError(ERRORS[e.error] ?? `El dictado ha fallado (${e.error}). Pulsa para intentarlo otra vez.`);
    };
    r.onend = () => {
      if (!delivered && latest) {
        delivered = true;
        onTextRef.current(latest);
      }
      if (rec.current === r) rec.current = null;
      setListening(false);
      setInterim("");
    };

    rec.current = r;
    try {
      r.start();
      setListening(true);
      if (navigator.vibrate) navigator.vibrate(20);
    } catch (err) {
      rec.current = null;
      setError(`No se pudo iniciar el dictado${err instanceof Error ? ` (${err.message})` : ""}. Pulsa otra vez.`);
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
        {listening ? "Terminar" : "Dictar por voz"}
      </button>
      {listening && (
        <p className="animate-fade-up mt-2 text-sm text-muted">
          {interim ? <span className="italic">“{interim}”</span> : "Escuchando… di la frase y se parará solo."}
        </p>
      )}
      {error && <p className="animate-fade-up mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
