import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

// GET /api/workers → operarios activos, en su orden.
export async function GET() {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { data, error } = await s.db
    .select("workers", "id, name")
    .eq("active", true)
    .order("sort")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workers: data });
}
