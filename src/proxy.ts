import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, workshopFromToken } from "@/lib/auth";

// Exige una cookie de taller válida. Cuál es el taller y su existencia se comprueban en cada ruta (requireSession).
export async function proxy(request: NextRequest) {
  const ok = await workshopFromToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Todo menos el login, su API y los estáticos.
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon).*)"],
};
