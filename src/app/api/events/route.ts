import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";
import { normalizePlate } from "@/lib/plate";
import type { CarEvent, PlateSummary } from "@/lib/types";

type PhotoRow = { id: string; path: string; kind: "plate" | "car" };
type EventRow = {
  id: string;
  plate: string;
  occurred_at: string;
  description: string;
  photos: PhotoRow[];
};

// GET /api/events?plate=1234BCD → eventos de esa matrícula con fotos (URLs firmadas)
// GET /api/events?q=12          → resumen de matrículas que contienen "12" (o las últimas)
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const db = supabaseAdmin();

  const plate = params.get("plate");
  if (plate) {
    const { data, error } = await db
      .from("events")
      .select("id, plate, occurred_at, description, photos(id, path, kind)")
      .eq("plate", normalizePlate(plate))
      .order("occurred_at", { ascending: false })
      .returns<EventRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const paths = data.flatMap((e) => e.photos.map((p) => p.path));
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
      signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
    }

    const events: CarEvent[] = data.map((e) => ({
      id: e.id,
      plate: e.plate,
      occurred_at: e.occurred_at,
      description: e.description,
      photos: e.photos
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "plate" ? 1 : -1))
        .map((p) => ({ id: p.id, kind: p.kind, url: urls.get(p.path) ?? "" })),
    }));
    return NextResponse.json({ events });
  }

  const q = normalizePlate(params.get("q") ?? "");
  let query = db
    .from("events")
    .select("plate, occurred_at, description, photos(path, kind)")
    .order("occurred_at", { ascending: false })
    .limit(400);
  if (q) query = query.ilike("plate", `%${q}%`);
  const { data, error } = await query.returns<
    { plate: string; occurred_at: string; description: string; photos: { path: string; kind: string }[] }[]
  >();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resumen por matrícula: nº de eventos, último evento y una miniatura
  // (la foto del coche más reciente; si no hay, la de la matrícula).
  const map = new Map<string, PlateSummary & { thumbPath: string | null }>();
  for (const row of data) {
    const photo = row.photos.find((p) => p.kind === "car") ?? row.photos[0];
    const s = map.get(row.plate);
    if (s) {
      s.events++;
      if (!s.thumbPath && photo) s.thumbPath = photo.path;
    } else {
      map.set(row.plate, {
        plate: row.plate,
        events: 1,
        last: row.occurred_at,
        lastDescription: row.description,
        thumb: null,
        thumbPath: photo?.path ?? null,
      });
    }
  }
  const list = [...map.values()].slice(0, 50);

  const paths = list.map((s) => s.thumbPath).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  const plates: PlateSummary[] = list.map(({ thumbPath, ...s }) => ({
    ...s,
    thumb: thumbPath ? (urls.get(thumbPath) ?? null) : null,
  }));
  return NextResponse.json({ plates });
}

// POST /api/events { plate, occurredAt, description, photos: [{ path, kind }] }
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    plate?: string;
    occurredAt?: string;
    description?: string;
    photos?: { path: string; kind: "plate" | "car" }[];
  };
  const plate = normalizePlate(body.plate ?? "");
  if (!plate) return NextResponse.json({ error: "Falta la matrícula" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: event, error } = await db
    .from("events")
    .insert({
      plate,
      occurred_at: body.occurredAt ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
      description: (body.description ?? "").trim(),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const photos = (body.photos ?? [])
    .filter((p) => p.path.startsWith(`${plate}/`))
    .map((p) => ({ event_id: event.id, path: p.path, kind: p.kind === "plate" ? "plate" : "car" }));
  if (photos.length) {
    const { error: photoError } = await db.from("photos").insert(photos);
    if (photoError) return NextResponse.json({ error: photoError.message }, { status: 500 });
  }

  return NextResponse.json({ id: event.id, plate });
}
