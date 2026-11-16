"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { datumGueltig } from "@/lib/daten";
import { fehlerCode } from "@/lib/fehler";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";
import type { FehlerCode } from "@/texte/de";

export type FormularZustand = { fehler: FehlerCode | null };

function text(form: FormData, feld: string) {
  const wert = form.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

// Trägt eine Reservierung ein. Ob der Tisch frei ist, entscheidet allein die
// Datenbank. Bei einem Fehler bleibt das Formular mit allen Eingaben stehen.
export async function reservierungAnlegen(_vorher: FormularZustand, form: FormData): Promise<FormularZustand> {
  const ich = await aktuelleMitgliedschaft();
  const datum = text(form, "datum");
  const uhrzeit = text(form, "uhrzeit");
  const durchgang = text(form, "durchgang");
  const personen = Number(text(form, "personen"));
  const name = text(form, "name");
  if (!datumGueltig(datum) || !name || (!uhrzeit && !durchgang)) return { fehler: "EINGABE_FEHLT" };
  if (!Number.isInteger(personen) || personen < 1 || personen > 500) return { fehler: "ZAHL_UNGUELTIG" };

  const db = await datenbank();
  const { error } = await db.rpc("reservierung_anlegen", {
    p_restaurant: ich.restaurantId,
    p_datum: datum,
    p_uhrzeit: uhrzeit || null,
    p_personen: personen,
    p_gast_name: name.slice(0, 80),
    p_telefon: text(form, "telefon").slice(0, 40),
    p_tisch: text(form, "tisch") || null,
    p_durchgang: durchgang || null,
    p_anlass: text(form, "anlass").slice(0, 80),
    p_notiz: text(form, "notiz").slice(0, 500),
    p_quelle: "personal",
    p_ausserhalb: form.get("ausserhalb") === "on",
  });
  if (error) return { fehler: fehlerCode(error.message) };

  revalidatePath("/", "layout");
  redirect(`/reservierungen?datum=${datum}&ok=neu`);
}

const erlaubteStatus = ["angekommen", "abgeschlossen", "storniert", "nicht_erschienen"];

export async function statusSetzen(form: FormData) {
  await aktuelleMitgliedschaft();
  const id = text(form, "id");
  const status = text(form, "status");
  const datum = text(form, "datum");
  const zurueck = `/reservierungen${datumGueltig(datum) ? `?datum=${datum}` : ""}`;
  const trenner = zurueck.includes("?") ? "&" : "?";
  if (!id || !erlaubteStatus.includes(status)) redirect(`${zurueck}${trenner}fehler=EINGABE_FEHLT`);

  const db = await datenbank();
  const { error } = await db.rpc("reservierung_status_setzen", { p_id: id, p_status: status });
  if (error) redirect(`${zurueck}${trenner}fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  redirect(`${zurueck}${trenner}ok=1`);
}
