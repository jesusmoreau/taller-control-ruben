// Comprueba, contra la app en marcha, que un taller no puede ver ni tocar los datos de otro.
//
//   npm run dev            (en otra terminal)
//   node scripts/probar-aislamiento.mjs [--url http://localhost:3000]
//
// Crea dos talleres de prueba (A y B), entra en la app con la contraseña de cada uno y usa la API
// como lo haría el móvil. Al terminar borra los dos talleres y todo lo suyo, aunque falle algo.
import { hashPassword } from "../src/lib/password.ts";
import { adminClient, args, fail } from "./lib.mjs";

const a = args({ url: { type: "string" } });
const BASE = (a.url ?? "http://localhost:3000").replace(/\/$/, "");
const db = adminClient();
const tag = `prueba-${Date.now()}`;
const PLATE = "0000TST";
const ids = [];
let failures = 0;

function check(ok, label) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return { status: res.status, json: await res.json().catch(() => null), res };
}

async function setup(letter) {
  const password = `${tag}-${letter}`;
  const { data, error } = await db
    .from("workshops")
    .insert({ name: `${tag}-${letter}`, password_hash: hashPassword(password) })
    .select("id")
    .single();
  if (error) throw error;
  ids.push(data.id);
  const login = await api(null, "POST", "/api/login", { password });
  if (login.status !== 200) throw new Error(`No se pudo entrar como ${letter}: ${login.status}`);
  const cookie = login.res.headers.get("set-cookie").split(";")[0];
  return { id: data.id, cookie, letter };
}

try {
  const up = await fetch(BASE).catch(() => null);
  if (!up) fail(`La app no responde en ${BASE}. Arráncala con npm run dev.`);

  const A = await setup("a");
  const B = await setup("b");

  // Cada taller registra la MISMA matrícula: deben ser dos coches distintos.
  const evs = {};
  for (const T of [A, B]) {
    const r = await api(T.cookie, "POST", "/api/events", { plate: PLATE, description: `Llegada: coche de ${T.letter}` });
    check(r.status === 200, `${T.letter.toUpperCase()} registra la llegada de ${PLATE}`);
    evs[T.letter] = r.json?.id;
    const p = await api(T.cookie, "PATCH", `/api/cars/${PLATE}`, { make: T.letter.toUpperCase(), status: "green" });
    check(p.status === 200, `${T.letter.toUpperCase()} pone marca y semáforo a su coche`);
  }

  // Leer
  const list = await api(A.cookie, "GET", "/api/events?q=");
  check(list.json?.plates?.length === 1 && list.json.plates[0].lastDescription.includes("de a"), "La lista de A solo tiene su coche");
  const car = await api(A.cookie, "GET", `/api/events?plate=${PLATE}`);
  check(car.json?.events?.length === 1 && car.json.events[0].id === evs.a && car.json.car.make === "A", "La ficha de A solo tiene sus eventos y sus datos");
  const today = new Date();
  const rep = await api(A.cookie, "GET", `/api/report?from=${new Date(today.getTime() - 864e5).toISOString()}&until=${new Date(today.getTime() + 864e5).toISOString()}`);
  check(rep.json?.events?.length === 1 && rep.json.events[0].id === evs.a, "El reporte de A solo tiene sus eventos");
  const me = await api(A.cookie, "GET", "/api/me");
  check(me.json?.workshopName === `${tag}-a`, "A ve el nombre de su taller");

  // Tocar lo de B
  const del = await api(A.cookie, "DELETE", `/api/events/${evs.b}`);
  const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("id", evs.b);
  check(del.status === 404 && count === 1, "A no puede borrar un evento de B");
  const { data: bCar } = await db.from("cars").select("make").eq("workshop_id", B.id).eq("plate", PLATE).single();
  check(bCar.make === "B", "Cambiar el coche de A no toca el de B");

  const { data: bWorker } = await db.from("workers").insert({ workshop_id: B.id, name: "Operario B" }).select("id").single();
  const work = await api(A.cookie, "POST", "/api/work", { action: "start", workerId: bWorker.id, plate: PLATE });
  check(work.status !== 200, "A no puede usar un operario de B");
  const workers = await api(A.cookie, "GET", "/api/workers");
  check(workers.json?.workers?.length === 0, "A no ve los operarios de B");

  const up2 = await api(A.cookie, "POST", "/api/events", {
    plate: PLATE,
    description: "Intento con foto ajena",
    photos: [{ path: `${B.id}/${PLATE}/foto.jpg`, kind: "car" }],
  });
  const { count: foreign } = await db.from("photos").select("id", { count: "exact", head: true }).eq("workshop_id", A.id);
  check(up2.status === 200 && foreign === 0, "A no puede enlazar archivos de la carpeta de B");

  // Cookies
  const none = await api(null, "GET", "/api/events?q=");
  check(none.status === 401, "Sin sesión: 401");
  const forged = `auth=${B.id}.${A.cookie.split(".").slice(1).join(".")}`;
  const bad = await api(forged, "GET", "/api/events?q=");
  check(bad.status === 401, "Cookie de A cambiando el id por el de B: 401");
  const wrong = await api(null, "POST", "/api/login", { password: "no-es-ninguna" });
  check(wrong.status === 401, "Contraseña que no es de ningún taller: 401");
} catch (e) {
  failures++;
  console.error("✗ Error en la prueba:", e.message ?? e);
} finally {
  // Borrar el taller borra en cascada sus coches, eventos, fotos, operarios y tramos.
  for (const id of ids) {
    const { error } = await db.from("workshops").delete().eq("id", id);
    if (error) console.error(`✗ No se pudo borrar el taller de prueba ${id}: ${error.message}`);
  }
  console.log("· Talleres de prueba borrados.");
}

if (failures) fail(`${failures} prueba(s) fallaron`);
console.log("✓ Aislamiento entre talleres correcto.");
