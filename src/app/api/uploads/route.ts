import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";
import { normalizePlate } from "@/lib/plate";

// Extensiones permitidas: fotos (jpg) y notas de voz (webm, m4a, ogg).
const ALLOWED = new Set(["jpg", "webm", "m4a", "ogg"]);

// Devuelve URLs firmadas de subida. El móvil sube los archivos directamente a
// Supabase Storage, así no pasan por Vercel (que limita el cuerpo a ~4,5 MB).
// Body: { plate, exts: ["jpg", "jpg", "webm"] }  (o { plate, count } → todo jpg)
export async function POST(request: Request) {
  const { plate, count, exts } = (await request.json().catch(() => ({}))) as {
    plate?: string;
    count?: number;
    exts?: string[];
  };
  const p = normalizePlate(plate ?? "");
  const list = (exts ?? Array.from({ length: Number(count) || 0 }, () => "jpg")).slice(0, 40);
  if (!p || list.length === 0 || list.some((e) => !ALLOWED.has(e))) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const uploads = [];
  for (const ext of list) {
    const prefix = ext === "jpg" ? "" : "audio-";
    const path = `${p}/${prefix}${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    uploads.push({ path: data.path, token: data.token });
  }
  return NextResponse.json({ uploads });
}
