import { NextResponse } from "next/server";
import { SESSION_COLUMNS, toSession, type SessionRow } from "@/lib/cars";
import { requireSession } from "@/lib/session";
import { isStatus, type WorkStatus } from "@/lib/status";
import type { ReportEvent } from "@/lib/report";

const PAGE = 1000; // tope de filas por petición en Supabase

// GET /api/report?from=ISO&until=ISO → todos los eventos anteriores a "until" (sin fotos ni audios),
// el semáforo actual de cada coche y los tramos de trabajo que tocan el día [from, until).
// El cliente arma el reporte del día con su zona horaria.
export async function GET(request: Request) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const params = new URL(request.url).searchParams;
  const until = params.get("until");
  const from = params.get("from");
  const end = until ? new Date(until) : new Date();
  if (Number.isNaN(end.getTime())) return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });

  const { db } = s;
  const events: ReportEvent[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .select("events", "id, plate, occurred_at, description")
      .lt("occurred_at", end.toISOString())
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    events.push(...data);
    if (data.length < PAGE) break;
  }

  const statuses: Record<string, WorkStatus> = {};
  const { data: cars } = await db.select("cars", "plate, status").not("status", "is", null);
  cars?.forEach((c) => isStatus(c.status) && (statuses[c.plate] = c.status));

  let sessions: ReturnType<typeof toSession>[] = [];
  const start = from ? new Date(from) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const { data, error } = await db
      .select("work_sessions", SESSION_COLUMNS)
      .lt("started_at", end.toISOString())
      .or(`ended_at.gt.${start.toISOString()},ended_at.is.null`)
      .order("started_at")
      .returns<SessionRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    sessions = data.map(toSession);
  }

  return NextResponse.json({ events, statuses, sessions });
}
