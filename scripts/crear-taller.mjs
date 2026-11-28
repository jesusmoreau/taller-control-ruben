// Da de alta un taller nuevo con su contraseña y, opcionalmente, sus operarios:
//
//   node scripts/crear-taller.mjs --taller "Taller de Pepe" --password "su-contraseña" --operarios "Juan,Luis"
//
// Con esa contraseña se entra a la app y solo se ven los datos de ese taller.
import { hashPassword, isValidPassword } from "../src/lib/password.ts";
import { adminClient, args, assertPasswordFree, fail } from "./lib.mjs";

const a = args({ taller: { type: "string" }, password: { type: "string" }, operarios: { type: "string" } });
if (!a.taller || !a.password) {
  fail('Uso: node scripts/crear-taller.mjs --taller "Nombre" --password "…" [--operarios "A,B"]');
}
if (!isValidPassword(a.password)) fail("La contraseña debe tener al menos 6 caracteres");

const db = adminClient();
await assertPasswordFree(db, a.password);
const { data: shop, error } = await db
  .from("workshops")
  .insert({ name: a.taller.trim(), password_hash: hashPassword(a.password) })
  .select("id, name")
  .single();
if (error) fail(`No se pudo crear el taller: ${error.message}`);

const names = (a.operarios ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (names.length) {
  const { error: wError } = await db
    .from("workers")
    .insert(names.map((name, i) => ({ workshop_id: shop.id, name, sort: i + 1 })));
  if (wError) console.error(`· No se pudieron crear los operarios: ${wError.message}`);
}
console.log(`✓ Taller "${shop.name}" creado${names.length ? ` con ${names.length} operarios` : ""}. Ya se puede entrar con su contraseña.`);
