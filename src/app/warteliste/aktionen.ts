"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { datumGueltig, istUuid } from "@/lib/daten";
import { fehlerCode } from "@/lib/fehler";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";

function text(form: FormData, feld: string, max = 200) {
  const wert = form.get(feld);
  return typeof wert === "string" ? wert.trim().slice(0, max) : "";
}

const zeitMuster = /^([01]\d|2[0-3]):[0-5]\d$/;

function zurueck(datum: string, zusatz: string): never {
  const d = datumGueltig(datum) ? `datum=${datum}&` : "";
  redirect(`/warteliste?${d}${zusatz}`);
}

export async function wartelisteHinzufuegen(form: FormData) {
  const ich = await aktuelleMitgliedschaft();
  const datum = text(form, "datum", 10);
  const von = text(form, "von", 5);
  const bis = text(form, "bis", 5);
  const personen = Number(text(form, "personen", 4));
  const name = text(form, "name", 80);
  if (!datumGueltig(datum) || !name || !zeitMuster.test(von) || !zeitMuster.test(bis)) zurueck(datum, "fehler=EINGABE_FEHLT");
  if (bis < von) zurueck(datum, "fehler=ZEIT_UNGUELTIG");
  if (!Number.isInteger(personen) || personen < 1 || personen > 500) zurueck(datum, "fehler=ZAHL_UNGUELTIG");

  const db = await datenbank();
  const { error } = await db.from("warteliste").insert({
    restaurant_id: ich.restaurantId,
    gast_name: name,
    telefon: text(form, "telefon", 40),
    personen,
    datum,
    von,
    bis,
    notiz: text(form, "notiz", 300),
  });
  if (error) zurueck(datum, `fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  zurueck(datum, "ok=hinzugefuegt");
}

export async function wartelisteEintragen(form: FormData) {
  await aktuelleMitgliedschaft();
  const id = text(form, "id", 40);
  const datum = text(form, "datum", 10);
  const uhrzeit = text(form, "uhrzeit", 5);
  const durchgang = text(form, "durchgang", 40);
  if (!istUuid(id) || !zeitMuster.test(uhrzeit)) zurueck(datum, "fehler=EINGABE_FEHLT");
  const db = await datenbank();
  const { error } = await db.rpc("warteliste_eintragen", {
    p_id: id,
    p_uhrzeit: uhrzeit,
    p_durchgang: istUuid(durchgang) ? durchgang : null,
  });
  if (error) zurueck(datum, `fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  zurueck(datum, "ok=eingetragen");
}

export async function wartelisteAnbieten(form: FormData) {
  await aktuelleMitgliedschaft();
  const id = text(form, "id", 40);
  const datum = text(form, "datum", 10);
  if (!istUuid(id)) zurueck(datum, "fehler=EINGABE_FEHLT");
  const db = await datenbank();
  const { data, error } = await db.rpc("warteliste_anbieten", { p_id: id });
  if (error) zurueck(datum, `fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  zurueck(datum, data ? "ok=angeboten" : "ok=nichts");
}

export async function wartelisteEntfernen(form: FormData) {
  await aktuelleMitgliedschaft();
  const id = text(form, "id", 40);
  const datum = text(form, "datum", 10);
  if (!istUuid(id)) zurueck(datum, "fehler=EINGABE_FEHLT");
  const db = await datenbank();
  const { error } = await db.rpc("warteliste_entfernen", { p_id: id });
  if (error) zurueck(datum, `fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  zurueck(datum, "ok=entfernt");
}
