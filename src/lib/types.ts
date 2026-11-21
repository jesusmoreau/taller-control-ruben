import type { WorkStatus } from "./status";

export type Photo = {
  id: string;
  kind: "plate" | "car";
  url: string;
};

export type VoiceNote = {
  id: string;
  url: string;
  durationMs: number;
  mime: string;
};

export type CarEvent = {
  id: string;
  plate: string;
  occurred_at: string;
  description: string;
  photos: Photo[];
  audios: VoiceNote[];
};

export type PlateSummary = {
  plate: string;
  events: number;
  last: string;
  lastDescription: string;
  thumb: string | null;
  /** Fecha de la llegada si el coche sigue en el taller; null si no. */
  insideSince: string | null;
  /** Semáforo de trabajo; null si no se ha marcado. */
  status: WorkStatus | null;
  /** Motivo del rojo. */
  blockedReason: string | null;
  make: string | null;
  model: string | null;
};

/** Lo que es del coche y no de un evento: semáforo y datos del vehículo. */
export type CarInfo = {
  plate: string;
  status: WorkStatus | null;
  blockedReason: string | null;
  blockedNote: string | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  km: number | null;
};

export type Worker = { id: string; name: string };

/** Tramo de trabajo de un operario. endedAt null = cronómetro en marcha. plate null = sin coche. */
export type WorkSession = {
  id: string;
  workerId: string;
  workerName: string;
  plate: string | null;
  description: string;
  startedAt: string;
  endedAt: string | null;
  source: "timer" | "manual";
};
