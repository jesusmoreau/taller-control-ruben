import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isStatus, type WorkStatus } from "@/lib/status";
import type { ReportEvent } from "@/lib/report";

const PAGE = 1000; // tope de filas por petición en Supabase

// GET /api/report?until=ISO → todos los eventos anteriores a "until" (sin fotos ni audios)
// y el semáforo actual de cada coche. El cliente arma el reporte del día con su zona horaria.
export async function GET(request: Request) {
  const until = new URL(request.url).searchParams.get("until");
  const end = until ? new Date(until) : new Date();
  if (Number.isNaN(end.getTime())) return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });

  const db = supabaseAdmin();
  const events: ReportEvent[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("events")
      .select("id, plate, occurred_at, description")
      .lt("occurred_at", end.toISOString())
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    events.push(...data);
    if (data.length < PAGE) break;
  }

  const statuses: Record<string, WorkStatus> = {};
  const { data: cars } = await db.from("cars").select("plate, status").not("status", "is", null);
  cars?.forEach((c) => isStatus(c.status) && (statuses[c.plate] = c.status));

  return NextResponse.json({ events, statuses });
}
