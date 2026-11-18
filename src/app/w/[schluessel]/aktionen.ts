"use server";

import { redirect } from "next/navigation";
import { datenbank } from "@/lib/supabase/server";

// Der Gast antwortet auf ein Angebot von der Warteliste. Keine Anmeldung nötig,
// der Schlüssel im Link ist der Nachweis.
export async function angebotBeantworten(form: FormData) {
  const wert = form.get("schluessel");
  const schluessel = typeof wert === "string" && /^[0-9a-f]{12}$/.test(wert) ? wert : null;
  if (!schluessel) redirect("/anmelden");
  const db = await datenbank();
  const { data } = await db.rpc("warteliste_antworten", {
    p_schluessel: schluessel,
    p_annehmen: form.get("antwort") === "ja",
  });
  const ergebnis = typeof data === "string" ? data : "ABGELAUFEN";
  redirect(`/w/${schluessel}?ergebnis=${ergebnis}`);
}
