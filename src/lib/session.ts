import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, LEGACY, workshopFromToken } from "./auth";
import { supabaseAdmin } from "./supabase-server";

// Acceso a los datos de UN taller. La base de datos se usa con la clave secreta (sin RLS),
// así que el aislamiento entre talleres depende de que TODAS las consultas pasen por aquí:
// cada lectura, modificación y borrado lleva workshop_id = taller, y cada alta lo rellena.
// Las rutas de la API no deben usar supabaseAdmin().from(...) directamente.

type Row = Record<string, unknown>;

function scoped(workshopId: string) {
  const db = supabaseAdmin();
  const withWs = <T extends Row>(rows: T | T[]) =>
    Array.isArray(rows) ? rows.map((r) => ({ ...r, workshop_id: workshopId })) : { ...rows, workshop_id: workshopId };
  return {
    // Las columnas se tipan como "*": sin esquema generado, supabase-js no aporta tipos y analizar
    // cadenas dinámicas dispara el compilador. Cada ruta indica el tipo de sus filas con .returns<T>().
    select: (table: string, columns: string, opts?: { count?: "exact"; head?: boolean }) =>
      db.from(table).select(columns as "*", opts).eq("workshop_id", workshopId),
    insert: (table: string, rows: Row | Row[]) => db.from(table).insert(withWs(rows)),
    upsert: (table: string, rows: Row | Row[], opts: { onConflict: string; ignoreDuplicates?: boolean }) =>
      db.from(table).upsert(withWs(rows), opts),
    update: (table: string, values: Row) => db.from(table).update(values).eq("workshop_id", workshopId),
    delete: (table: string) => db.from(table).delete().eq("workshop_id", workshopId),
  };
}

export type Scoped = ReturnType<typeof scoped>;

export type Session = {
  workshopId: string;
  workshopName: string;
  db: Scoped;
};

/**
 * Taller de la petición (por la cookie), o una respuesta 401 lista para devolver.
 *
 *   const s = await requireSession();
 *   if (s instanceof NextResponse) return s;
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const id = await workshopFromToken(token);
  if (!id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = supabaseAdmin().from("workshops").select("id, name");
  const { data } = await (id === LEGACY ? q.eq("legacy", true) : q.eq("id", id)).maybeSingle();
  // Taller borrado, o la cookie antigua antes de migrar.
  if (!data) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return { workshopId: data.id, workshopName: data.name, db: scoped(data.id) };
}

/** Las rutas de Storage de cada taller empiezan por su id. */
export function storagePrefix(s: Session, plate: string) {
  return `${s.workshopId}/${plate}/`;
}
