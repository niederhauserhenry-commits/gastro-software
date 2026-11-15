import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Verbindung zur Datenbank im Namen des angemeldeten Nutzers.
// Die Datenbank selbst entscheidet, welche Zeilen er sehen darf.
export async function datenbank() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Beim reinen Anzeigen einer Seite dürfen keine Cookies gesetzt
            // werden. Die Sitzung wird dann in proxy.ts erneuert.
          }
        },
      },
    },
  );
}
