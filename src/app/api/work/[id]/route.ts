import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// DELETE /api/work/:id → borra un tramo de trabajo (para corregir errores).
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin().from("work_sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
