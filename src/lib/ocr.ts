// Lectura de matrículas en el navegador con Tesseract.js (gratis, sin claves).
// El primer uso descarga el motor y el idioma (~5 MB); después queda en caché.

import type { Worker } from "tesseract.js";

export type PlateRead = { plate: string; valid: boolean; confidence: "high" | "medium" | "low" };

const LETTERS = "BCDFGHJKLMNPRSTVWXYZ"; // consonantes válidas en matrículas actuales
const CURRENT = new RegExp(`^\\d{4}[${LETTERS}]{3}$`);

// Confusiones típicas del OCR según la posición sea número o letra.
const TO_DIGIT: Record<string, string> = { O: "0", D: "0", Q: "0", U: "0", I: "1", L: "1", J: "1", Z: "2", S: "5", B: "8", G: "6", T: "7", A: "4" };
const TO_LETTER: Record<string, string> = { "8": "B", "5": "S", "2": "Z", "6": "G", "0": "D", "1": "J", "4": "L", "7": "T" };

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // probado: el que mejor lee matrículas
      });
      return worker;
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

// Escala de grises + estiramiento de contraste: mejora mucho el OCR en fotos de móvil.
async function preprocess(photo: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  const scale = Math.min(2, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Busca una matrícula actual (1234 BCD) en el texto reconocido, corrigiendo
// confusiones típicas. Devuelve la candidata con menos correcciones.
export function extractPlate(text: string): { plate: string; fixes: number } | null {
  const lines = text.toUpperCase().split(/\n+/).map((l) => l.replace(/[^A-Z0-9]/g, ""));
  // Probamos cada línea y también todo el texto junto (por si el OCR parte la matrícula).
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
          }
          else break;
        } else {
          if (LETTERS.includes(ch)) candidate += ch;
          else if (TO_LETTER[ch]) {
            candidate += TO_LETTER[ch];
            fixes++;
          }
          else break;
        }
      }
      if (CURRENT.test(candidate) && fixes <= 2 && (!best || fixes < best.fixes)) {
        best = { plate: candidate, fixes };
      }
    }
  }
  return best;
}

// Gira la imagen para enderezar matrículas fotografiadas algo inclinadas.
function rotated(src: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (degrees === 0) return src;
  const rad = (degrees * Math.PI) / 180;
  const w = src.width;
  const h = src.height;
  const cw = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  const ch = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, cw, ch);
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -w / 2, -h / 2);
  return canvas;
}

// Ángulos que se prueban en orden hasta encontrar una matrícula válida.
const ANGLES = [0, 6, -6, 12, -12];

export async function readPlate(photo: Blob): Promise<PlateRead> {
  const worker = await getWorker();
  const base = await preprocess(photo);

  for (const angle of ANGLES) {
    const { data } = await worker.recognize(rotated(base, angle));
    const found = extractPlate(data.text);
    if (found) {
      const confidence = found.fixes === 0 && angle === 0 && data.confidence >= 60 ? "high" : "medium";
      return { plate: found.plate, valid: true, confidence };
    }
  }
  return { plate: "", valid: false, confidence: "low" };
}
