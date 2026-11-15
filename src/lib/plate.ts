// Matrículas españolas.
// Actual (desde 2000): 4 dígitos + 3 consonantes, sin vocales, Ñ ni Q → 1234 BCD
// Provincial antigua: 1-2 letras de provincia + 4 dígitos + 0-2 letras → M-1234-AB

const CURRENT = /^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/;
const OLD = /^([A-Z]{1,2})(\d{4})([A-Z]{0,2})$/;

export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidPlate(plate: string): boolean {
  const p = normalizePlate(plate);
  return CURRENT.test(p) || OLD.test(p);
}

export function formatPlate(plate: string): string {
  const p = normalizePlate(plate);
  if (CURRENT.test(p)) return `${p.slice(0, 4)} ${p.slice(4)}`;
  const m = p.match(OLD);
  if (m) return [m[1], m[2], m[3]].filter(Boolean).join("-");
  return p;
}
