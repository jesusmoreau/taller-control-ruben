// Semáforo de trabajo por coche.
//   red    → el trabajo está bloqueado por algo (piezas, cliente, aprobación…)
//   yellow → listo para empezar, pero aún no se ha empezado
//   green  → se está trabajando en él

export const STATUSES = ["red", "yellow", "green"] as const;
export type WorkStatus = (typeof STATUSES)[number];

export const STATUS_INFO: Record<WorkStatus, { label: string; hint: string }> = {
  red: { label: "Bloqueado", hint: "El trabajo está parado por algo" },
  yellow: { label: "Listo", hint: "Listo para empezar, aún sin comenzar" },
  green: { label: "En curso", hint: "Se está trabajando en él" },
};

export function isStatus(v: unknown): v is WorkStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}
