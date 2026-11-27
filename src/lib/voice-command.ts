// Intérprete de comandos de voz: de la frase transcrita a { coche, acción }.
// Reglas simples, sin IA ni conexión. El resultado siempre se confirma en pantalla antes de aplicarse.
//
//   "el 1234 está terminado"                    → 1234BCD · Terminado
//   "el cinco seis siete ocho bloqueado, falta la bomba de agua"
//                                               → 5678FGH · Bloqueado (Sin material) "Falta la bomba de agua"
//   "el Ibiza diagnosticado, hay que cambiar el embrague"
//                                               → evento "Diagnosticado: Hay que cambiar el embrague"

import type { WorkStatus } from "./status";

// ── Acciones ──────────────────────────────────────────────────────────────────

export const VOICE_ACTIONS = ["red", "yellow", "green", "blue", "clear", "Llegada", "Diagnosticado", "Reparación", "Salida"] as const;
export type VoiceActionKind = (typeof VOICE_ACTIONS)[number];

export type VoiceAction = {
  kind: VoiceActionKind;
  /** Solo en rojo: uno de BLOCK_REASONS. */
  reason: string | null;
  /** Nota del rojo o texto del evento. */
  text: string;
};

export function isStatusAction(k: VoiceActionKind): k is WorkStatus | "clear" {
  return k === "red" || k === "yellow" || k === "green" || k === "blue" || k === "clear";
}

// Palabras clave sobre el texto en minúsculas y sin tildes. Gana la que aparece antes en la frase:
// "bloqueado porque no ha llegado la pieza" es rojo, no una llegada.
const RULES: { kind: VoiceActionKind; re: RegExp }[] = [
  { kind: "clear", re: /\b(quita(r|le)? (el )?(estado|semaforo|color)|sin estado)\b/ },
  { kind: "red", re: /\b(bloquead[oa]s?|bloquea(r|lo)?|parad[oa]|en rojo|rojo)\b/ },
  { kind: "Salida", re: /\b(ha salido|sale|salida|se (lo|la) (ha )?llevad[oa]|se (lo|la) (ha|han) llevado|se (lo|la) lleva|se ha ido|entregad[oa]|recogid[oa]|lo (han|ha) recogido)\b/ },
  { kind: "Diagnosticado", re: /\b(diagnosticad[oa]|diagnostico|diagnosticar)\b/ },
  { kind: "Reparación", re: /\b(reparacion|reparad[oa]|he cambiado|hemos cambiado|cambiad[oa]|he puesto|hemos puesto)\b/ },
  { kind: "Llegada", re: /\b(ha llegado|ha entrado|llegada|entrada|acaba de llegar|nuevo en el taller)\b/ },
  { kind: "blue", re: /\b(terminad[oa]s?|acabad[oa]s?|list[oa]s?|finalizad[oa]|en azul|azul)\b/ },
  { kind: "green", re: /\b(en curso|empiezo|empezamos|empieza|empezando|empezado|estoy con|estamos con|trabajando|me pongo|en verde|verde)\b/ },
  { kind: "yellow", re: /\b(en espera|esperando|espera|en amarillo|amarillo|pendiente)\b/ },
];

// "Esperando la pieza" o "ha llegado... falta material" en realidad es un bloqueo.
const MATERIAL = /\b(pieza|piezas|material|recambio|recambios|repuesto|repuestos|falta|faltan)\b/;
const REASONS: { reason: string; re: RegExp }[] = [
  { reason: "Sin presupuesto", re: /\bpresupuesto\b/ },
  { reason: "El cliente no acepta", re: /\b(no (lo |la )?acepta|no quiere|no lo quiere|cliente no)\b/ },
  { reason: "Sin material", re: MATERIAL },
  { reason: "Capacidad del taller", re: /\b(capacidad|no damos abasto|no hay sitio|no hay hueco|no hay tiempo)\b/ },
];

/** Pasa a minúsculas y quita tildes conservando la longitud, para que los índices valgan en el original. */
export function fold(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = ch.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += base.length === ch.length ? base : ch.toLowerCase();
  }
  return out;
}

const LEADING_JUNK = /^[\s,.:;!¡?¿-]*((porque|que|y|de|del|con|ya|esta|está|es|son|por|pues|vale)\b[\s,.:;-]*)*/i;

/** Texto después de la palabra clave, sin conectores al principio y con mayúscula. */
function tail(original: string, from: number): string {
  const t = original.slice(from).replace(LEADING_JUNK, "").replace(/[\s.]+$/, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

export function parseAction(transcript: string): VoiceAction | null {
  const f = fold(transcript);
  let best: { kind: VoiceActionKind; index: number; end: number } | null = null;
  for (const r of RULES) {
    const m = r.re.exec(f);
    if (!m) continue;
    // Una "llegada" de una pieza no es la llegada del coche.
    if (r.kind === "Llegada" && MATERIAL.test(f)) continue;
    if (!best || m.index < best.index) best = { kind: r.kind, index: m.index, end: m.index + m[0].length };
  }
  if (!best) return null;

  let kind = best.kind;
  // "Esperando la pieza": la nota es la frase desde "esperando".
  let noteFrom = best.end;
  if (kind === "yellow" && MATERIAL.test(f)) {
    kind = "red";
    noteFrom = best.index;
  }

  if (kind === "red") {
    const after = f.slice(best.end);
    const reason = REASONS.find((r) => r.re.test(after))?.reason ?? REASONS.find((r) => r.re.test(f))?.reason ?? "Otro";
    // Con "Otro" y sin nota, la tarjeta pide escribirla antes de confirmar.
    return { kind, reason, text: tail(transcript, noteFrom) };
  }
  if (isStatusAction(kind)) return { kind, reason: null, text: "" };
  return { kind, reason: null, text: tail(transcript, best.end) };
}

// ── Matrícula dicha en voz alta ───────────────────────────────────────────────

const UNITS: Record<string, number> = {
  cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const TEENS: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

type NumKind = "unit" | "teen" | "ten" | "hundred" | "mil";
function numWord(w: string): { kind: NumKind; value: number } | null {
  if (w in UNITS) return { kind: "unit", value: UNITS[w] };
  if (w in TEENS) return { kind: "teen", value: TEENS[w] };
  if (w in TENS) return { kind: "ten", value: TENS[w] };
  if (w in HUNDREDS) return { kind: "hundred", value: HUNDREDS[w] };
  if (w === "mil") return { kind: "mil", value: 1000 };
  return null;
}

/**
 * Cambia los números dichos con palabras por cifras. Cada número es un token aparte, así
 * "uno dos tres cuatro" → "1 2 3 4", "doce treinta y cuatro" → "12 34",
 * "mil doscientos treinta y cuatro" → "1234".
 */
export function wordsToDigits(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let total = 0;
  let group = 0;
  let last: NumKind | null = null;

  const flush = () => {
    if (last !== null) out.push(String(total + group));
    total = 0;
    group = 0;
    last = null;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // "treinta y cuatro": la "y" solo une decena y unidad.
    if (w === "y" && last === "ten" && words[i + 1] && numWord(words[i + 1])?.kind === "unit" && words[i + 1] !== "cero") continue;
    const n = w === "cero" ? null : numWord(w);
    if (w === "cero") {
      flush();
      out.push("0");
      continue;
    }
    if (!n) {
      flush();
      out.push(w);
      continue;
    }
    const fits =
      last === null ||
      (n.kind === "mil" && total === 0 && last !== "mil") ||
      (n.kind === "hundred" && last === "mil") ||
      ((n.kind === "teen" || n.kind === "ten") && (last === "hundred" || last === "mil") && group % 100 === 0) ||
      (n.kind === "unit" && (last === "ten" || ((last === "hundred" || last === "mil") && group % 100 === 0)) && group % 10 === 0);
    if (!fits) flush();
    if (n.kind === "mil") {
      total = (group || 1) * 1000;
      group = 0;
    } else group += n.value;
    last = n.kind;
  }
  flush();
  return out.join(" ");
}

const LETTER_NAMES: Record<string, string> = {
  be: "B", ce: "C", de: "D", efe: "F", ge: "G", hache: "H", jota: "J", ka: "K", ele: "L", eme: "M",
  ene: "N", pe: "P", erre: "R", ere: "R", ese: "S", te: "T", uve: "V", ve: "V", equis: "X", ye: "Y",
  zeta: "Z", ceta: "Z",
};

export type SpokenPlate = {
  /** Grupos de cifras seguidas (p. ej. "1234"). */
  digits: string[];
  /** Letras dichas justo después de cada grupo, si las hay (p. ej. "BCD"). */
  letters: string[];
};

/** Busca cifras y letras de matrícula en la frase. */
export function spokenPlate(transcript: string): SpokenPlate {
  const base = fold(transcript)
    .replace(/(\d)[.,](?=\d)/g, "$1") // "1.234" → "1234"
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\buve doble\b|\bdoble uve\b/g, "w")
    .replace(/\bi griega\b/g, "y");
  const tokens = wordsToDigits(base).split(/\s+/).filter(Boolean);

  const digits: string[] = [];
  const letters: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\d+$/.test(tokens[i])) continue;
    let run = "";
    while (i < tokens.length && /^\d+$/.test(tokens[i])) run += tokens[i++];
    // Letras justo detrás: "bcd", "b c d" o "be ce de".
    let lets = "";
    while (i < tokens.length && lets.length < 3) {
      const t = tokens[i];
      if (/^[a-z]{1,3}$/.test(t) && !(t in LETTER_NAMES) && /^[bcdfghjklmnprstvwxyz]+$/.test(t) && lets.length + t.length <= 3) {
        lets += t.toUpperCase();
      } else if (t in LETTER_NAMES) {
        lets += LETTER_NAMES[t];
      } else break;
      i++;
    }
    i--;
    digits.push(run);
    letters.push(lets);
  }
  return { digits, letters };
}

// ── Coche ─────────────────────────────────────────────────────────────────────

export type CandidateCar = {
  plate: string;
  insideSince: string | null;
  make: string | null;
  model: string | null;
};

export type CarMatch = {
  /** El coche elegido, si solo hay uno posible. */
  plate: string | null;
  /** Posibles coches cuando hay dudas (para elegir en pantalla). */
  options: string[];
};

const plateDigits = (plate: string) => plate.match(/\d{4}/)?.[0] ?? plate.replace(/\D/g, "");
const plateLetters = (plate: string) => plate.replace(/\d/g, "");

/**
 * Elige el coche del que se habla. Busca primero entre los que están en el taller,
 * por los 4 números; si hay empate, por las letras. Sin números, por marca o modelo.
 */
export function matchCar(transcript: string, cars: CandidateCar[]): CarMatch {
  const { digits, letters } = spokenPlate(transcript);
  const inside = cars.filter((c) => c.insideSince);

  const byDigits = (list: CandidateCar[]) =>
    list.filter((c) => {
      const d = plateDigits(c.plate);
      return d.length >= 3 && digits.some((run) => run.includes(d) || (run.length >= 3 && d.endsWith(run) && run.length === d.length));
    });

  const pick = (list: CandidateCar[]): CarMatch | null => {
    if (!list.length) return null;
    if (list.length === 1) return { plate: list[0].plate, options: [] };
    const said = letters.filter(Boolean);
    const narrowed = said.length ? list.filter((c) => said.some((l) => plateLetters(c.plate).startsWith(l))) : [];
    if (narrowed.length === 1) return { plate: narrowed[0].plate, options: [] };
    return { plate: null, options: (narrowed.length ? narrowed : list).map((c) => c.plate) };
  };

  if (digits.length) {
    const m = pick(byDigits(inside)) ?? pick(byDigits(cars));
    if (m) return m;
  }

  // Marca o modelo: "el Ibiza está terminado".
  const f = fold(transcript);
  const has = (w: string | null) => {
    const k = w && fold(w).trim();
    return Boolean(k && k.length >= 3 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(f));
  };
  const byModel = (list: CandidateCar[]) => {
    const models = list.filter((c) => has(c.model));
    return models.length ? models : list.filter((c) => has(c.make));
  };
  return pick(byModel(inside)) ?? pick(byModel(cars)) ?? { plate: null, options: [] };
}

// ── Todo junto ────────────────────────────────────────────────────────────────

export type VoiceCommand = { transcript: string; car: CarMatch; action: VoiceAction | null };

export function parseVoiceCommand(transcript: string, cars: CandidateCar[]): VoiceCommand {
  return { transcript, car: matchCar(transcript, cars), action: parseAction(transcript) };
}

/** Texto del evento tal y como se guarda: "Diagnosticado: hay que cambiar el embrague". */
export function eventDescription(action: VoiceAction): string {
  return [action.kind, action.text.trim()].filter(Boolean).join(": ");
}
