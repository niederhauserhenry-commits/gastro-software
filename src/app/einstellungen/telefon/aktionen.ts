"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fehlerCode } from "@/lib/fehler";
import { leitungErforderlich } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";

const ziel = "/einstellungen/telefon";

export async function telefonSpeichern(form: FormData) {
  const ich = await leitungErforderlich();
  const max = Number(form.get("max_personen"));
  const db = await datenbank();
  const { error } = await db.rpc("telefon_einstellungen_speichern", {
    p_restaurant: ich.restaurantId,
    p_aktiv: form.get("aktiv") === "an",
    p_hinweise: String(form.get("hinweise") ?? "").slice(0, 1500),
    p_max_personen: Number.isInteger(max) ? max : 0,
  });
  if (error) redirect(`${ziel}?fehler=${fehlerCode(error.message)}`);
  revalidatePath(ziel);
  redirect(`${ziel}?ok=gespeichert`);
}

export async function telefonSchluesselErneuern() {
  const ich = await leitungErforderlich();
  const db = await datenbank();
  const { error } = await db.rpc("telefon_schluessel_erneuern", { p_restaurant: ich.restaurantId });
  if (error) redirect(`${ziel}?fehler=${fehlerCode(error.message)}`);
  revalidatePath(ziel);
  redirect(`${ziel}?ok=schluessel`);
}
