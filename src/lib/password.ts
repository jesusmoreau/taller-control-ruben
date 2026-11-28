// Hash de las contraseñas de los talleres con scrypt (node:crypto, sin dependencias).
// Formato: "scrypt$<salt hex>$<hash hex>". Lo usan el servidor y los scripts de scripts/.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, KEYLEN).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Mínimo para la contraseña de un taller. */
export function isValidPassword(p: string): boolean {
  return p.length >= 6;
}
