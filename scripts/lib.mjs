// Utilidades de los scripts de administración. Leen .env.local de la raíz del proyecto.
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { verifyPassword } from "../src/lib/password.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
try {
  process.loadEnvFile(`${root}.env.local`);
} catch {
  /* en el servidor las variables ya vienen del entorno */
}

export const ROOT = root;

export function args(spec) {
  return parseArgs({ options: spec, allowPositionals: false }).values;
}

export function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

export async function pgClient() {
  const url = process.env.POSTGRES_URL_NON_POOLING;
  if (!url) fail("Falta POSTGRES_URL_NON_POOLING en .env.local");
  const c = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Falla si la contraseña ya la usa otro taller (la contraseña decide el taller al entrar). */
export async function assertPasswordFree(db, password) {
  const { data, error } = await db.from("workshops").select("name, password_hash");
  if (error) fail(error.message);
  const clash = data.find((w) => verifyPassword(password, w.password_hash));
  if (clash) fail(`Esa contraseña ya es la del taller "${clash.name}". Elige otra.`);
}
