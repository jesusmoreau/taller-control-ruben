import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";

// DELETE /api/events/:id → borra el evento, sus fotos y notas de voz (filas y archivos).
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data: photos } = await db.from("photos").select("path").eq("event_id", id);
  const { data: audios } = await db.from("audios").select("path").eq("event_id", id);
  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files = [...(photos ?? []), ...(audios ?? [])].map((f) => f.path);
  if (files.length) await db.storage.from(BUCKET).remove(files);
  return NextResponse.json({ ok: true });
}
