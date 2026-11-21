import { NextResponse } from "next/server";
import { carsByPlate, emptyCar, ensureCar } from "@/lib/cars";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizePlate } from "@/lib/plate";
import { isStatus } from "@/lib/status";

const text = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// PATCH /api/cars/:plate → cambia solo los campos enviados:
//   { status: "red" | "yellow" | "green" | null, blockedReason?, blockedNote? }  semáforo (el motivo solo en rojo)
//   { make?, model?, engine?, km? }                                              datos del coche
export async function PATCH(request: Request, ctx: { params: Promise<{ plate: string }> }) {
  const plate = normalizePlate(decodeURIComponent((await ctx.params).plate));
  if (!plate) return NextResponse.json({ error: "Falta la matrícula" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ("status" in body) {
    const status = body.status === null ? null : isStatus(body.status) ? body.status : undefined;
    if (status === undefined) return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    update.status = status;
    update.status_at = new Date().toISOString();
    update.blocked_reason = status === "red" ? text(body.blockedReason) : null;
    update.blocked_note = status === "red" ? text(body.blockedNote, 500) : null;
  }
  for (const [key, column] of [["make", "make"], ["model", "model"], ["engine", "engine"]] as const) {
    if (key in body) update[column] = text(body[key]);
  }
  if ("km" in body) {
    const km = body.km === null || body.km === "" ? null : Math.round(Number(body.km));
    if (km !== null && (!Number.isFinite(km) || km < 0)) {
      return NextResponse.json({ error: "Kilómetros no válidos" }, { status: 400 });
    }
    update.km = km;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });

  const db = supabaseAdmin();
  const { error: carError } = await ensureCar(db, plate);
  if (carError) return NextResponse.json({ error: carError.message }, { status: 500 });
  const { error } = await db.from("cars").update(update).eq("plate", plate);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const car = (await carsByPlate(db, [plate])).get(plate) ?? emptyCar(plate);
  return NextResponse.json(car);
}
