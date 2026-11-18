import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { vorschauAktiv } from "@/lib/vorschau";

// Läuft vor jeder Seite: erneuert die Anmeldung und schickt
// nicht angemeldete Besucher zur Anmeldeseite.
export async function proxy(request: NextRequest) {
  if (vorschauAktiv()) return NextResponse.next({ request });

  let antwort = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          antwort = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            antwort.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const pfad = request.nextUrl.pathname;
  // Absage-Link (/r/…) und Wartelisten-Angebot (/w/…) für Gäste funktionieren ohne Anmeldung.
  const oeffentlich = pfad.startsWith("/anmelden") || pfad.startsWith("/auth/") || pfad.startsWith("/r/") || pfad.startsWith("/w/");

  if (!data.user && !oeffentlich) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/anmelden";
    ziel.search = "";
    return NextResponse.redirect(ziel);
  }
  return antwort;
}

export const config = {
  // Bilder, App-Symbole und das Manifest brauchen keine Anmeldung.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
