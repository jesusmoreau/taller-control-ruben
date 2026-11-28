import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

// DELETE /api/work/:id → borra un tramo de trabajo (para corregir errores).
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const { error } = await s.db.delete("work_sessions").eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
