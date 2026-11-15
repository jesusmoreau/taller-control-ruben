import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";

// DELETE /api/events/:id → borra el evento, sus filas de fotos y los archivos.
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data: photos } = await db.from("photos").select("path").eq("event_id", id);
  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (photos?.length) await db.storage.from(BUCKET).remove(photos.map((p) => p.path));
  return NextResponse.json({ ok: true });
}
