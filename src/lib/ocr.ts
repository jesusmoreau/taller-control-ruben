// Lectura de matrículas en el navegador con Tesseract.js (gratis, sin claves).
// El primer uso descarga el motor y el idioma (~5 MB); después queda en caché.
//
// Se usa sobre un recorte ajustado a la matrícula (el recuadro guía del escáner en vivo):
// con la foto completa el OCR se confunde con el resto de la imagen.

import type { Worker } from "tesseract.js";

const LETTERS = "BCDFGHJKLMNPRSTVWXYZ"; // consonantes válidas en matrículas actuales
const CURRENT = new RegExp(`^\\d{4}[${LETTERS}]{3}$`);

// Confusiones típicas del OCR según la posición sea número o letra.
const TO_DIGIT: Record<string, string> = { O: "0", D: "0", Q: "0", U: "0", I: "1", L: "1", J: "1", Z: "2", S: "5", B: "8", G: "6", T: "7", A: "4" };
const TO_LETTER: Record<string, string> = { "8": "B", "5": "S", "2": "Z", "6": "G", "0": "D", "1": "J", "4": "L", "7": "T" };

let workerPromise: Promise<Worker> | null = null;

export function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        tessedit_pageseg_mode: PSM.SINGLE_LINE, // el recorte contiene una sola línea: la matrícula
      });
      return worker;
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

// Busca una matrícula actual (1234 BCD) en el texto reconocido, corrigiendo
// confusiones típicas. Devuelve la candidata con menos correcciones.
export function extractPlate(text: string): { plate: string; fixes: number } | null {
  const lines = text.toUpperCase().split(/\n+/).map((l) => l.replace(/[^A-Z0-9]/g, ""));
  const sources = [...lines, lines.join("")].filter((s) => s.length >= 7);

  let best: { plate: string; fixes: number } | null = null;
  for (const s of sources) {
    for (let i = 0; i + 7 <= s.length; i++) {
      let fixes = 0;
      let candidate = "";
      for (let j = 0; j < 7; j++) {
        const ch = s[i + j];
        if (j < 4) {
          if (/\d/.test(ch)) candidate += ch;
          else if (TO_DIGIT[ch]) {
            candidate += TO_DIGIT[ch];
            fixes++;
          } else break;
        } else {
          if (LETTERS.includes(ch)) candidate += ch;
          else if (TO_LETTER[ch]) {
            candidate += TO_LETTER[ch];
            fixes++;
          } else break;
        }
      }
      if (CURRENT.test(candidate) && fixes <= 1 && (!best || fixes < best.fixes)) {
        best = { plate: candidate, fixes };
      }
    }
  }
  return best;
}

// Prepara un recorte para el OCR: escala a un tamaño cómodo, gris y binarizado (Otsu).
export function prepareCrop(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): HTMLCanvasElement {
  // Se descarta el ~11 % izquierdo (franja azul con la "E") para que no se lea como carácter.
  const band = sw * 0.11;
  const cropX = sx + band;
  const cropW = sw - band;
  const targetW = 900;
  const scale = targetW / cropW;
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, cropX, sy, cropW, sh, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
  }
  // Umbral de Otsu
  const total = d.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function readCrop(canvas: HTMLCanvasElement): Promise<{ plate: string; fixes: number; confidence: number } | null> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  const found = extractPlate(data.text);
  return found ? { ...found, confidence: data.confidence } : null;
}

// Para una foto ya hecha (sin escáner en vivo): se lee la franja central,
// que es donde queda la matrícula si se encuadra de cerca.
export async function readPlateFromPhoto(photo: Blob): Promise<{ plate: string } | null> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  const w = bitmap.width;
  const h = bitmap.height;
  const attempts = [
    [0.05, 0.3, 0.9, 0.4],
    [0.1, 0.35, 0.8, 0.3],
    [0, 0.2, 1, 0.6],
  ];
  try {
    for (const [x, y, cw, ch] of attempts) {
      const found = await readCrop(prepareCrop(bitmap, w * x, h * y, w * cw, h * ch));
      if (found) return { plate: found.plate };
    }
    return null;
  } finally {
    bitmap.close();
  }
}
