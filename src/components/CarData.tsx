"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Notice, SectionTitle, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import type { CarInfo } from "@/lib/types";

type Fields = { make: string; model: string; engine: string; km: string };

const toFields = (c: CarInfo): Fields => ({
  make: c.make ?? "",
  model: c.model ?? "",
  engine: c.engine ?? "",
  km: c.km != null ? String(c.km) : "",
});

/** Marca, modelo, motor y km del coche, editables a mano. */
export function CarDataCard({ car, onSaved }: { car: CarInfo; onSaved: (c: CarInfo) => void }) {
  const empty = !car.make && !car.model && !car.engine && car.km == null;
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Fields>(() => toFields(car));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/cars/${car.plate}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...fields, km: fields.km.replace(/\D/g, "") }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? "No se pudo guardar");
    onSaved(data);
    setEditing(false);
  }

  if (!editing) {
    return (
      <Card className="animate-fade-up">
        <SectionTitle
          aside={
            <button
              onClick={() => {
                setFields(toFields(car));
                setEditing(true);
              }}
              className="text-sm font-semibold text-accent"
            >
              {empty ? "Añadir" : "Editar"}
            </button>
          }
        >
          Datos del coche
        </SectionTitle>
        {empty ? (
          <p className="text-sm text-muted">Sin datos. Añade marca, modelo, motor y kilómetros.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Item label="Marca" value={car.make} />
            <Item label="Modelo" value={car.model} />
            <Item label="Motor" value={car.engine} />
            <Item label="Km" value={car.km != null ? car.km.toLocaleString("es-ES") : null} />
          </dl>
        )}
      </Card>
    );
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Card className="animate-fade-up">
      <SectionTitle>Datos del coche</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Marca">
          <input value={fields.make} onChange={set("make")} placeholder="Seat" autoCapitalize="words" className={inputClass} />
        </Field>
        <Field label="Modelo">
          <input value={fields.model} onChange={set("model")} placeholder="Ibiza" autoCapitalize="words" className={inputClass} />
        </Field>
        <Field label="Motor">
          <input value={fields.engine} onChange={set("engine")} placeholder="1.6 TDI" className={inputClass} />
        </Field>
        <Field label="Km">
          <input
            value={fields.km}
            onChange={set("km")}
            inputMode="numeric"
            placeholder="125000"
            className={inputClass}
          />
        </Field>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button onClick={() => setEditing(false)} className={`${secondaryButton} flex-1`}>
          Cancelar
        </button>
        <button onClick={save} disabled={saving} className={`${primaryButton} flex-[2]`}>
          <Icon name={saving ? "loader" : "check"} size={18} />
          Guardar
        </button>
      </div>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value || "—"}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
