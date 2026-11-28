import { NextResponse } from "next/server";
import { AUTH_COOKIE, tokenFor } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { supabaseAdmin } from "@/lib/supabase-server";

// POST /api/login { password } → la contraseña decide el taller.
export async function POST(request: Request) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (!password) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });

  // Pocos talleres: se prueba la contraseña contra cada uno (scrypt).
  const { data: shops, error } = await supabaseAdmin().from("workshops").select("id, password_hash");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const shop = shops.find((w) => verifyPassword(password, w.password_hash));
  if (!shop) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await tokenFor(shop.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
