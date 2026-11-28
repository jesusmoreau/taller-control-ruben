import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

// GET /api/me → { workshopName }: el taller de la sesión, para mostrarlo en la cabecera.
export async function GET() {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ workshopName: s.workshopName });
}
