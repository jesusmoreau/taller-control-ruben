import { NextResponse } from "next/server";
import { SESSION_COLUMNS, ensureCar, toSession, type SessionRow } from "@/lib/cars";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizePlate } from "@/lib/plate";

const MAX_MS = 24 * 60 * 60 * 1000; // un tramo metido a mano no puede pasar de 24 h

// GET /api/work?plate=1234BCD → tramos de trabajo de ese coche
// GET /api/work?running=1     → todos los cronómetros en marcha
// GET /api/work?free=1        → trabajo sin coche: en marcha y de los últimos 7 días
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const db = supabaseAdmin();
  let query = db.from("work_sessions").select(SESSION_COLUMNS).order("started_at", { ascending: false });

  const plate = params.get("plate");
  if (plate) query = query.eq("plate", normalizePlate(plate));
  else if (params.get("running")) query = query.is("ended_at", null);
  else if (params.get("free")) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.is("plate", null).or(`started_at.gte.${since},ended_at.is.null`);
  } else return NextResponse.json({ error: "Falta plate, running o free" }, { status: 400 });

  const { data, error } = await query.limit(500).returns<SessionRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data.map(toSession) });
}

type Body = {
  action?: "start" | "stop" | "manual";
  workerId?: string;
  workerIds?: string[];
  plate?: string | null;
  eventId?: string | null;
  description?: string;
  startedAt?: string;
  endedAt?: string;
};

// POST /api/work
//   { action: "start", workerId, plate?, description? }  arranca el cronómetro (pausa el que tuviera en marcha)
//   { action: "stop", workerId }                          pausa su cronómetro
//   { action: "manual", workerIds, plate?, eventId?, description?, startedAt, endedAt }  tiempo metido a mano
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const plate = body.plate ? normalizePlate(body.plate) : null;
  const description = (body.description ?? "").trim().slice(0, 500);

  if (plate) {
    const { error } = await ensureCar(db, plate);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stopRunning = (workerId: string) =>
    db.from("work_sessions").update({ ended_at: now }).eq("worker_id", workerId).is("ended_at", null);

  if (body.action === "start" || body.action === "stop") {
    if (!body.workerId) return NextResponse.json({ error: "Falta el operario" }, { status: 400 });
    // Validar antes de pausar nada, para no parar un cronómetro por una petición incorrecta.
    if (body.action === "start" && !plate && !description) {
      return NextResponse.json({ error: "Describe el trabajo sin coche" }, { status: 400 });
    }
    const { error: stopError } = await stopRunning(body.workerId);
    if (stopError) return NextResponse.json({ error: stopError.message }, { status: 500 });
    if (body.action === "stop") return NextResponse.json({ ok: true });

    const { error } = await db
      .from("work_sessions")
      .insert({ worker_id: body.workerId, plate, description, started_at: now, source: "timer" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "manual") {
    const workerIds = [...new Set(body.workerIds ?? [])];
    const start = new Date(body.startedAt ?? "");
    const end = new Date(body.endedAt ?? "");
    if (!workerIds.length) return NextResponse.json({ error: "Elige al menos un operario" }, { status: 400 });
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "El tiempo no es válido" }, { status: 400 });
    }
    if (end.getTime() - start.getTime() > MAX_MS) {
      return NextResponse.json({ error: "Un tramo no puede pasar de 24 h" }, { status: 400 });
    }
    if (!plate && !description) {
      return NextResponse.json({ error: "Describe el trabajo sin coche" }, { status: 400 });
    }
    const rows = workerIds.map((worker_id) => ({
      worker_id,
      plate,
      event_id: body.eventId ?? null,
      description,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      source: "manual",
    }));
    const { error } = await db.from("work_sessions").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
