// Semáforo de trabajo por coche.
//   red    → el trabajo está bloqueado por algo (piezas, cliente, aprobación…)
//   yellow → en espera: se puede empezar, pero aún no se ha empezado
//   green  → se está trabajando en él
//   blue   → terminado: el trabajo está hecho y el coche espera a que lo recojan

export const STATUSES = ["red", "yellow", "green", "blue"] as const;
export type WorkStatus = (typeof STATUSES)[number];

export const STATUS_INFO: Record<WorkStatus, { label: string; hint: string }> = {
  red: { label: "Bloqueado", hint: "El trabajo está parado por algo" },
  yellow: { label: "En espera", hint: "Esperando a que se empiece a trabajar en él" },
  green: { label: "En curso", hint: "Se está trabajando en él" },
  blue: { label: "Terminado", hint: "Trabajo hecho, esperando a que lo recojan" },
};

export function isStatus(v: unknown): v is WorkStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

// Motivos por los que un coche está en rojo (no se puede tocar).
export const BLOCK_REASONS = [
  "Sin presupuesto",
  "El cliente no acepta",
  "Sin material",
  "Capacidad del taller",
  "Otro",
] as const;
