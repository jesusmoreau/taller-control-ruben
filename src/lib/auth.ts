// Autenticación por taller: cada taller tiene su contraseña. Al entrar se guarda una cookie
// "<id del taller>.<firma HMAC>" (AUTH_SECRET). Funciona tanto en proxy.ts como en las rutas.
//
// Las sesiones abiertas antes de haber varios talleres llevan la cookie antigua (solo la firma);
// siguen valiendo y corresponden al taller marcado como legacy (el primero).

export const AUTH_COOKIE = "auth";

/** Valor especial: sesión antigua → taller legacy. */
export const LEGACY = "legacy";

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Falta la variable de entorno AUTH_SECRET");
  return s;
}

/** Cookie para un taller. */
export async function tokenFor(workshopId: string): Promise<string> {
  return `${workshopId}.${await hmac(secret(), `taller-v2:${workshopId}`)}`;
}

/** Comparación en tiempo constante para no filtrar la firma byte a byte. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Taller de la cookie (su id, o LEGACY), o null si no es válida. */
export async function workshopFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot === -1) {
    // Cookie de antes de haber varios talleres.
    return same(token, await hmac(secret(), "matriculas-session-v1")) ? LEGACY : null;
  }
  const id = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return same(token, await tokenFor(id)) ? id : null;
}
