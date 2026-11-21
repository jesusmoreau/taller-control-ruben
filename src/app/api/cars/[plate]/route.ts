import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizePlate } from "@/lib/plate";
import { isStatus } from "@/lib/status";

// PATCH /api/cars/:plate { status: "red" | "yellow" | "green" | null } → cambia el semáforo del coche.
export async function PATCH(request: Request, ctx: { params: Promise<{ plate: string }> }) {
  const plate = normalizePlate(decodeURIComponent((await ctx.params).plate));
  if (!plate) return NextResponse.json({ error: "Falta la matrícula" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status === null ? null : isStatus(body.status) ? body.status : undefined;
  if (status === undefined) return NextResponse.json({ error: "Estado no válido" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("cars")
    .upsert({ plate, status, status_at: new Date().toISOString() }, { onConflict: "plate" })
    .select("plate, status, status_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
