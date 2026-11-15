import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La integración Supabase de Vercel crea SUPABASE_URL; el navegador necesita la versión NEXT_PUBLIC_.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  },
  // Sin cacheComponents: con él, Next mantiene montadas las pantallas visitadas (React Activity)
  // y el formulario de "Nuevo evento" reaparecía con los datos del evento anterior.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
