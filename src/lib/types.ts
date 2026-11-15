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
};
