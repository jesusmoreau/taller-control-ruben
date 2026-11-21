import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// GET /api/workers → operarios activos, en su orden.
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("workers")
    .select("id, name")
    .eq("active", true)
    .order("sort")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workers: data });
}
