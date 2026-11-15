"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

export function Header({
  title,
  back,
  actions,
}: {
  title?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-header backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-4">
        {back && (
          <Link
            href={back}
            aria-label="Volver"
            className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-surface-2 active:scale-95"
          >
            <Icon name="back" />
          </Link>
        )}
        <div className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</div>
        <div className="flex items-center gap-1">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 shadow-card ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {aside}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function Notice({
  tone,
  children,
}: {
  tone: "warn" | "danger" | "success";
  children: ReactNode;
}) {
  const styles = {
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  }[tone];
  return (
    <div className={`animate-fade-up flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${styles}`}>
      <Icon name={tone === "success" ? "check" : "alert"} size={16} className="mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

// Aviso flotante que desaparece solo.
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 2600);
    const t2 = setTimeout(onDone, 2900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);
  return (
    <div
      role="status"
      className={`fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg shadow-card">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-success text-white">
          <Icon name="check" size={14} />
        </span>
        {message}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-base text-fg placeholder:text-muted/70 outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
