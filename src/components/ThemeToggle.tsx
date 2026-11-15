"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Tema del sistema", light: "Tema claro", dark: "Tema oscuro" };
const ICON = { system: "monitor", light: "sun", dark: "moon" } as const;

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    /* almacenamiento no disponible: el tema solo dura esta visita */
  }
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system" as Theme,
  );
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
      aria-label={`${LABEL[theme]}. Cambiar a ${LABEL[next].toLowerCase()}`}
      title={LABEL[theme]}
    >
      <Icon name={ICON[theme]} />
    </button>
  );
}

// Script que se ejecuta antes de pintar para evitar el parpadeo de tema.
export const themeInitScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
