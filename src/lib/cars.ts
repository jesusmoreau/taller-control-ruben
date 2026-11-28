import "server-only";
import type { Scoped } from "./session";
import { isStatus } from "./status";
import type { CarInfo, WorkSession } from "./types";

const CAR_COLUMNS = "plate, status, blocked_reason, blocked_note, make, model, engine, km";

type CarRow = {
  plate: string;
  status: string | null;
  blocked_reason: string | null;
  blocked_note: string | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  km: number | null;
};

export function emptyCar(plate: string): CarInfo {
  return { plate, status: null, blockedReason: null, blockedNote: null, make: null, model: null, engine: null, km: null };
}

function toCar(r: CarRow): CarInfo {
  return {
    plate: r.plate,
    status: isStatus(r.status) ? r.status : null,
    blockedReason: r.blocked_reason,
    blockedNote: r.blocked_note,
    make: r.make,
    model: r.model,
    engine: r.engine,
    km: r.km,
  };
}

/** Ficha de cada matrícula pedida. Si falla la consulta, devuelve un mapa vacío. */
export async function carsByPlate(db: Scoped, plates: string[]): Promise<Map<string, CarInfo>> {
  const map = new Map<string, CarInfo>();
  if (!plates.length) return map;
  const { data } = await db.select("cars", CAR_COLUMNS).in("plate", plates).returns<CarRow[]>();
  data?.forEach((r) => map.set(r.plate, toCar(r)));
  return map;
}

/** Matrículas con el semáforo puesto. */
export async function platesWithStatus(db: Scoped): Promise<Set<string>> {
  const { data } = await db.select("cars", "plate").not("status", "is", null);
  return new Set(data?.map((r) => r.plate) ?? []);
}

export const SESSION_COLUMNS = "id, worker_id, plate, description, started_at, ended_at, source, workers(name)";

export type SessionRow = {
  id: string;
  worker_id: string;
  plate: string | null;
  description: string;
  started_at: string;
  ended_at: string | null;
  source: "timer" | "manual";
  workers: { name: string } | null;
};

export function toSession(r: SessionRow): WorkSession {
  return {
    id: r.id,
    workerId: r.worker_id,
    workerName: r.workers?.name ?? "",
    plate: r.plate,
    description: r.description,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    source: r.source,
  };
}

/** Crea la ficha del coche si no existe (cada evento y cada tramo de trabajo apunta a un coche). */
export async function ensureCar(db: Scoped, plate: string) {
  return db.upsert("cars", { plate }, { onConflict: "workshop_id,plate", ignoreDuplicates: true });
}
