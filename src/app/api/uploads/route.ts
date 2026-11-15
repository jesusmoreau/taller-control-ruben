import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";
import { normalizePlate } from "@/lib/plate";

// Devuelve URLs firmadas de subida. El móvil sube las fotos directamente a
// Supabase Storage, así no pasan por Vercel (que limita el cuerpo a ~4,5 MB).
export async function POST(request: Request) {
  const { plate, count } = (await request.json().catch(() => ({}))) as {
    plate?: string;
    count?: number;
  };
  const p = normalizePlate(plate ?? "");
  const n = Math.min(Math.max(Number(count) || 0, 0), 30);
  if (!p || n === 0) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = supabaseAdmin();
  const uploads = [];
  for (let i = 0; i < n; i++) {
    const path = `${p}/${Date.now()}-${crypto.randomUUID()}.jpg`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    uploads.push({ path: data.path, token: data.token });
  }
  return NextResponse.json({ uploads });
}
