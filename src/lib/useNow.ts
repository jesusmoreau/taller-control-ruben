"use client";

import { useEffect, useState } from "react";

// Hora actual que se refresca sola (por defecto cada minuto),
// para contadores tipo "lleva 2 h en el taller".
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
