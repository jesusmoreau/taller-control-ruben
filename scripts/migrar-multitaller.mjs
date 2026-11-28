// Pasa la app a varios talleres. Se ejecuta UNA vez sobre la base de datos actual:
//
//   node scripts/migrar-multitaller.mjs --taller "Taller de Rubén"
//
// Aplica supabase/multitaller.sql en una transacción (todo o nada). Los datos que ya existen
// pasan a ese taller, cuya contraseña es la de siempre (APP_PASSWORD de .env.local).
// Las sesiones ya abiertas siguen valiendo: nadie tiene que volver a entrar.
//
// Con --ensayo aplica el SQL, comprueba el resultado y lo deshace todo (ROLLBACK): no cambia nada.
import { readFileSync } from "node:fs";
import { hashPassword } from "../src/lib/password.ts";
import { ROOT, args, fail, pgClient } from "./lib.mjs";

const a = args({ taller: { type: "string" }, ensayo: { type: "boolean" } });
if (!a.taller) fail('Uso: node scripts/migrar-multitaller.mjs --taller "Nombre" [--ensayo]');
const password = process.env.APP_PASSWORD;
if (!password) fail("Falta APP_PASSWORD en .env.local (la contraseña actual de la app)");

const sql = readFileSync(`${ROOT}supabase/multitaller.sql`, "utf8");
const c = await pgClient();
const { rows: ver } = await c.query("show server_version_num");
if (Number(ver[0].server_version_num) < 150000) fail("Hace falta Postgres 15 o superior");

const summary = `
  select
    (select count(*)::int from public.workshops) as talleres,
    (select count(*)::int from public.cars) as coches,
    (select count(*)::int from public.events) as eventos,
    (select count(*)::int from public.photos) as fotos,
    (select count(*)::int from public.audios) as audios,
    (select count(*)::int from public.workers) as operarios,
    (select count(*)::int from public.work_sessions) as tramos,
    (select count(*)::int from public.cars c join public.workshops w on w.id = c.workshop_id where w.legacy) as coches_del_taller`;

const before = (await c.query("select count(*)::int as n from public.cars")).rows[0].n;
try {
  await c.query("begin");
  await c.query("select set_config('app.taller', $1, true), set_config('app.password_hash', $2, true)", [
    a.taller,
    hashPassword(password),
  ]);
  await c.query(sql);
  const { rows } = await c.query(summary);
  console.table(rows);
  if (rows[0].coches_del_taller !== before) throw new Error(`Se esperaban ${before} coches en el taller y hay ${rows[0].coches_del_taller}`);
  if (a.ensayo) {
    await c.query(sql); // aplicarlo dos veces no debe fallar
    await c.query("rollback");
    console.log("✓ Ensayo correcto (también se puede aplicar dos veces). No se ha cambiado nada.");
  } else {
    await c.query("commit");
    console.log(`✓ Migración aplicada. Taller "${a.taller}" con la contraseña de siempre.`);
  }
} catch (e) {
  await c.query("rollback").catch(() => {});
  fail(`La migración ha fallado y no se ha cambiado nada: ${e.message}`);
} finally {
  await c.end();
}
