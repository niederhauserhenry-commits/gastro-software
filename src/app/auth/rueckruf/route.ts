import { NextResponse, type NextRequest } from "next/server";
import { datenbank } from "@/lib/supabase/server";

// Ziel des Bestätigungslinks aus der Registrierungs-Mail.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const ziel = request.nextUrl.clone();
  ziel.search = "";
  if (code) {
    const db = await datenbank();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      ziel.pathname = "/";
      return NextResponse.redirect(ziel);
    }
  }
  ziel.pathname = "/anmelden";
  ziel.search = "?fehler=UNBEKANNT";
  return NextResponse.redirect(ziel);
}
