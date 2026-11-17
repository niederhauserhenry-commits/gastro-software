"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { datumGueltig, istUuid, ladeGaesteListe, type GastEintrag } from "@/lib/daten";
import { fehlerCode } from "@/lib/fehler";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";
import type { FehlerCode } from "@/texte/de";

export type GastZustand = { fehler: FehlerCode | null };

function text(form: FormData, feld: string, max: number) {
  const wert = form.get(feld);
  return typeof wert === "string" ? wert.trim().slice(0, max) : "";
}

// Legt eine Karteikarte an oder speichert Änderungen.
// Bei einem Fehler bleibt das Formular mit allen Eingaben stehen.
export async function gastSpeichern(_vorher: GastZustand, form: FormData): Promise<GastZustand> {
  const ich = await aktuelleMitgliedschaft();
  if (!ich.darfReservieren) return { fehler: "KEINE_BERECHTIGUNG" };

  const id = text(form, "id", 40);
  const name = text(form, "name", 80);
  const geburtstag = text(form, "geburtstag", 10);
  const allergien = text(form, "allergien", 300);
  const einwilligung = form.get("einwilligung") === "on";
  if (!name) return { fehler: "EINGABE_FEHLT" };
  if (geburtstag && !datumGueltig(geburtstag)) return { fehler: "EINGABE_FEHLT" };
  if (allergien && !einwilligung) return { fehler: "EINWILLIGUNG_FEHLT" };

  const db = await datenbank();
  // Eine bestehende Einwilligung behält ihr ursprüngliches Datum.
  let einwilligungAm: string | null = null;
  if (allergien) {
    einwilligungAm = new Date().toISOString();
    if (istUuid(id)) {
      const { data } = await db.from("gaeste").select("allergien_einwilligung_am").eq("id", id).maybeSingle();
      if (data?.allergien_einwilligung_am) einwilligungAm = data.allergien_einwilligung_am;
    }
  }

  const werte = {
    name,
    telefon: text(form, "telefon", 40),
    email: text(form, "email", 120),
    geburtstag: geburtstag || null,
    vorlieben: text(form, "vorlieben", 500),
    notizen: text(form, "notizen", 1000),
    allergien,
    allergien_einwilligung_am: einwilligungAm,
  };

  let gastId = id;
  if (istUuid(id)) {
    const { data, error } = await db.from("gaeste").update(werte).eq("id", id).eq("restaurant_id", ich.restaurantId).select("id");
    if (error) return { fehler: error.code === "23505" ? "TELEFON_DOPPELT" : fehlerCode(error.message) };
    if (!data?.length) return { fehler: "GAST_UNBEKANNT" };
  } else {
    const { data, error } = await db
      .from("gaeste")
      .insert({ ...werte, restaurant_id: ich.restaurantId })
      .select("id")
      .single();
    if (error) return { fehler: error.code === "23505" ? "TELEFON_DOPPELT" : fehlerCode(error.message) };
    gastId = data.id;
  }

  revalidatePath("/", "layout");
  redirect(`/gaeste/${gastId}?ok=1`);
}

export async function gastLoeschen(form: FormData) {
  const ich = await aktuelleMitgliedschaft();
  const id = text(form, "id", 40);
  if (!istUuid(id)) redirect("/gaeste");
  if (!istLeitung(ich.rolle)) redirect(`/gaeste/${id}/bearbeiten?fehler=KEINE_BERECHTIGUNG`);
  if (form.get("bestaetigt") !== "on") redirect(`/gaeste/${id}/bearbeiten?fehler=LOESCHEN_NICHT_BESTAETIGT`);

  const db = await datenbank();
  const { error } = await db.from("gaeste").delete().eq("id", id).eq("restaurant_id", ich.restaurantId);
  if (error) redirect(`/gaeste/${id}/bearbeiten?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/gaeste?ok=geloescht");
}

export async function aufenthaltAnlegen(form: FormData) {
  const ich = await aktuelleMitgliedschaft();
  const gastId = text(form, "gastId", 40);
  const anreise = text(form, "anreise", 10);
  const abreise = text(form, "abreise", 10);
  if (!istUuid(gastId)) redirect("/gaeste");
  if (!datumGueltig(anreise) || !datumGueltig(abreise) || abreise < anreise) {
    redirect(`/gaeste/${gastId}?fehler=EINGABE_FEHLT#aufenthalte`);
  }
  const db = await datenbank();
  const { error } = await db.from("aufenthalte").insert({
    restaurant_id: ich.restaurantId,
    gast_id: gastId,
    zimmer: text(form, "zimmer", 20),
    anreise,
    abreise,
  });
  if (error) redirect(`/gaeste/${gastId}?fehler=${fehlerCode(error.message)}#aufenthalte`);
  revalidatePath("/", "layout");
  redirect(`/gaeste/${gastId}?ok=1#aufenthalte`);
}

export async function aufenthaltEntfernen(form: FormData) {
  const ich = await aktuelleMitgliedschaft();
  const gastId = text(form, "gastId", 40);
  const id = text(form, "id", 40);
  if (!istUuid(gastId) || !istUuid(id)) redirect("/gaeste");
  const db = await datenbank();
  const { error } = await db.from("aufenthalte").delete().eq("id", id).eq("restaurant_id", ich.restaurantId);
  if (error) redirect(`/gaeste/${gastId}?fehler=${fehlerCode(error.message)}#aufenthalte`);
  revalidatePath("/", "layout");
  redirect(`/gaeste/${gastId}?ok=1#aufenthalte`);
}

// Für die Gastsuche im Reservierungsformular.
export async function gaesteSuchen(suche: string): Promise<GastEintrag[]> {
  const ich = await aktuelleMitgliedschaft();
  const begriff = suche.trim().slice(0, 80);
  if (begriff.length < 2) return [];
  const treffer = await ladeGaesteListe(ich.restaurantId, begriff, "alle");
  return treffer.slice(0, 6);
}
