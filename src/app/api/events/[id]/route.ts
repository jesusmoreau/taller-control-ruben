import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";
import { requireSession } from "@/lib/session";

// DELETE /api/events/:id → borra el evento, sus fotos y notas de voz (filas y archivos).
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const { db } = s;

  const { data: photos } = await db.select("photos", "path").eq("event_id", id);
  const { data: audios } = await db.select("audios", "path").eq("event_id", id);
  const { data: deleted, error } = await db.delete("events").eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted.length) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const files = [...(photos ?? []), ...(audios ?? [])].map((f) => f.path);
  // Las rutas salen de filas de su taller; borrar los archivos requiere la clave secreta.
  if (files.length) await supabaseAdmin().storage.from(BUCKET).remove(files);
  return NextResponse.json({ ok: true });
}
