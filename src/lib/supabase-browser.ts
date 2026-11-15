import { createClient } from "@supabase/supabase-js";

// Solo se usa para subir fotos con URLs firmadas que genera el servidor.
// La clave publicable no da acceso a los datos: las tablas tienen RLS sin políticas.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);
