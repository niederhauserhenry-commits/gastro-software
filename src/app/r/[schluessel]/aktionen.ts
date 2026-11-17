"use server";

import { redirect } from "next/navigation";
import { datenbank } from "@/lib/supabase/server";

// Der Gast sagt über den Link aus seiner SMS ab. Keine Anmeldung nötig,
// der Schlüssel im Link ist der Nachweis.
export async function absagenPerLink(form: FormData) {
  const wert = form.get("schluessel");
  const schluessel = typeof wert === "string" && /^[0-9a-f]{12}$/.test(wert) ? wert : null;
  if (!schluessel) redirect("/anmelden");
  const db = await datenbank();
  await db.rpc("reservierung_absagen_per_link", { p_schluessel: schluessel });
  redirect(`/r/${schluessel}`);
}
