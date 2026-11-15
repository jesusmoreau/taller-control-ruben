"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { inputClass, primaryButton } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace("/");
      return;
    }
    setBusy(false);
    setError("Contraseña incorrecta");
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      {/* Fondo con brillo suave */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>

      <div className="animate-fade-up relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-accent text-accent-fg shadow-card">
            <Icon name="car" size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Control del taller</h1>
          <p className="mt-1 text-sm text-muted">Registro de coches, eventos y fotos</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-12 ${error ? "border-danger" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg"
            >
              <Icon name={show ? "eyeOff" : "eye"} size={18} />
            </button>
          </div>
          {error && <p className="animate-fade-up mt-2 text-sm text-danger">{error}</p>}
          <button disabled={busy || !password} className={`${primaryButton} mt-4 w-full`}>
            {busy ? <Icon name="loader" /> : <Icon name="lock" size={18} />}
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
