import { NextResponse } from "next/server";
import { BUCKET, supabaseAdmin } from "@/lib/supabase-server";
import { requireSession, storagePrefix } from "@/lib/session";
import { normalizePlate } from "@/lib/plate";
import { computeStays } from "@/lib/tags";
import { carsByPlate, emptyCar, ensureCar, platesWithStatus } from "@/lib/cars";
import type { CarEvent, PlateSummary } from "@/lib/types";

type PhotoRow = { id: string; path: string; kind: "plate" | "car" };
type AudioRow = { id: string; path: string; duration_ms: number; mime: string };
type EventRow = {
  id: string;
  plate: string;
  occurred_at: string;
  description: string;
  photos: PhotoRow[];
  audios: AudioRow[];
};

// GET /api/events?plate=1234BCD → eventos de esa matrícula con fotos y notas de voz (URLs firmadas)
// GET /api/events?q=12          → resumen de matrículas que contienen "12" (o las últimas)
export async function GET(request: Request) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const params = new URL(request.url).searchParams;
  const { db } = s;
  // Las rutas a firmar salen de filas de su taller; firmar requiere la clave secreta.
  const storage = supabaseAdmin().storage.from(BUCKET);

  const plate = params.get("plate");
  if (plate) {
    const { data, error } = await db
      .select("events", "id, plate, occurred_at, description, photos(id, path, kind), audios(id, path, duration_ms, mime)")
      .eq("plate", normalizePlate(plate))
      .order("occurred_at", { ascending: false })
      .returns<EventRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const paths = data.flatMap((e) => [...e.photos.map((p) => p.path), ...e.audios.map((a) => a.path)]);
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await storage.createSignedUrls(paths, 60 * 60);
      signed?.forEach((u) => u.path && u.signedUrl && urls.set(u.path, u.signedUrl));
    }

    const events: CarEvent[] = data.map((e) => ({
      id: e.id,
      plate: e.plate,
      occurred_at: e.occurred_at,
      description: e.description,
      photos: e.photos
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "plate" ? 1 : -1))
        .map((p) => ({ id: p.id, kind: p.kind, url: urls.get(p.path) ?? "" })),
      audios: e.audios.map((a) => ({ id: a.id, url: urls.get(a.path) ?? "", durationMs: a.duration_ms, mime: a.mime })),
    }));
    const p = normalizePlate(plate);
    const car = (await carsByPlate(db, [p])).get(p) ?? emptyCar(p);
    return NextResponse.json({ events, car });
  }

  const q = normalizePlate(params.get("q") ?? "");
  let query = db
    .select("events", "id, plate, occurred_at, description, photos(path, kind)")
    .order("occurred_at", { ascending: false })
    .limit(1000);
  if (q) query = query.ilike("plate", `%${q}%`);
  const { data, error } = await query.returns<
    { id: string; plate: string; occurred_at: string; description: string; photos: { path: string; kind: string }[] }[]
  >();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resumen por matrícula: nº de eventos, último evento y una miniatura
  // (la foto del coche más reciente; si no hay, la de la matrícula).
  const map = new Map<string, PlateSummary & { thumbPath: string | null }>();
  const byPlate = new Map<string, typeof data>();
  for (const row of data) {
    const list = byPlate.get(row.plate);
    if (list) list.push(row);
    else byPlate.set(row.plate, [row]);
  }
  for (const row of data) {
    const photo = row.photos.find((p) => p.kind === "car") ?? row.photos[0];
    const sum = map.get(row.plate);
    if (sum) {
      sum.events++;
      if (!sum.thumbPath && photo) sum.thumbPath = photo.path;
    } else {
      map.set(row.plate, {
        plate: row.plate,
        events: 1,
        last: row.occurred_at,
        lastDescription: row.description,
        thumb: null,
        thumbPath: photo?.path ?? null,
        insideSince: computeStays(byPlate.get(row.plate) ?? []).openSince,
        status: null,
        blockedReason: null,
        make: null,
        model: null,
      });
    }
  }
  // Los 50 más recientes, más cualquier coche que esté en el taller o tenga el semáforo
  // puesto, para que los filtros de la lista no se dejen ninguno.
  const withStatus = await platesWithStatus(db);
  const list = [...map.values()].filter((s, i) => i < 50 || s.insideSince || withStatus.has(s.plate));
  const cars = await carsByPlate(db, list.map((s) => s.plate));

  const paths = list.map((s) => s.thumbPath).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await storage.createSignedUrls(paths, 60 * 60);
    signed?.forEach((u) => u.path && u.signedUrl && urls.set(u.path, u.signedUrl));
  }

  const plates: PlateSummary[] = list.map(({ thumbPath, ...s }) => ({
    ...s,
    status: cars.get(s.plate)?.status ?? null,
    blockedReason: cars.get(s.plate)?.blockedReason ?? null,
    make: cars.get(s.plate)?.make ?? null,
    model: cars.get(s.plate)?.model ?? null,
    thumb: thumbPath ? (urls.get(thumbPath) ?? null) : null,
  }));
  return NextResponse.json({ plates });
}

// POST /api/events { plate, occurredAt, description, photos: [{ path, kind }], audios: [{ path, durationMs, mime }] }
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    plate?: string;
    occurredAt?: string;
    description?: string;
    photos?: { path: string; kind: "plate" | "car" }[];
    audios?: { path: string; durationMs: number; mime: string }[];
  };
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const plate = normalizePlate(body.plate ?? "");
  if (!plate) return NextResponse.json({ error: "Falta la matrícula" }, { status: 400 });

  const { db } = s;
  // Cada evento pertenece a un coche: si es la primera vez que entra, se crea su ficha.
  const { error: carError } = await ensureCar(db, plate);
  if (carError) return NextResponse.json({ error: carError.message }, { status: 500 });

  const { data: event, error } = await db
    .insert("events", {
      plate,
      occurred_at: body.occurredAt ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
      description: (body.description ?? "").trim(),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Solo se aceptan archivos subidos con /api/uploads para este taller y este coche.
  const prefix = storagePrefix(s, plate);
  const photos = (body.photos ?? [])
    .filter((p) => p.path.startsWith(prefix))
    .map((p) => ({ event_id: event.id, path: p.path, kind: p.kind === "plate" ? "plate" : "car" }));
  if (photos.length) {
    const { error: photoError } = await db.insert("photos", photos);
    if (photoError) return NextResponse.json({ error: photoError.message }, { status: 500 });
  }

  const audios = (body.audios ?? [])
    .filter((a) => a.path.startsWith(prefix))
    .map((a) => ({
      event_id: event.id,
      path: a.path,
      duration_ms: Math.max(0, Math.round(Number(a.durationMs) || 0)),
      mime: String(a.mime || "audio/webm").slice(0, 60),
    }));
  if (audios.length) {
    const { error: audioError } = await db.insert("audios", audios);
    if (audioError) return NextResponse.json({ error: audioError.message }, { status: 500 });
  }

  return NextResponse.json({ id: event.id, plate });
}
