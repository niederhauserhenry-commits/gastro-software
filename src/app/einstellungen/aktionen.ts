"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fehlerCode } from "@/lib/fehler";
import { leitungErforderlich } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";
import type { FehlerCode } from "@/texte/de";

const seiten = {
  oeffnungszeiten: "/einstellungen/oeffnungszeiten",
  tische: "/einstellungen/tische",
  tischdauer: "/einstellungen/tischdauer",
  warteliste: "/einstellungen/warteliste",
} as const;
type SeitenName = keyof typeof seiten;

function text(form: FormData, feld: string) {
  const wert = form.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

function zahl(form: FormData, feld: string) {
  const wert = Number(text(form, feld));
  return Number.isInteger(wert) ? wert : NaN;
}

// Übersetzt Datenbankfehler: doppelter Name, Zahl außerhalb des Bereichs, sonstiges.
function dbFehler(error: { message: string; code?: string }): FehlerCode {
  if (error.code === "23505") return "TISCH_DOPPELT";
  if (error.code === "23514" || error.code === "22003") return "ZAHL_UNGUELTIG";
  return fehlerCode(error.message);
}

function zurueckMitFehler(seite: SeitenName, code: FehlerCode): never {
  redirect(`${seiten[seite]}?fehler=${code}`);
}

// Nach dem Speichern: während der Ersteinrichtung weiter zum nächsten Schritt,
// sonst auf derselben Seite bleiben.
function fertig(seite: SeitenName, form: FormData, naechste: string): never {
  revalidatePath("/", "layout");
  if (text(form, "weiter") === "1") redirect(naechste);
  redirect(`${seiten[seite]}?ok=1`);
}

const zeitMuster = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function oeffnungszeitenSpeichern(form: FormData) {
  const ich = await leitungErforderlich();
  const zeiten: { wochentag: number; von: string; bis: string }[] = [];
  for (let tag = 1; tag <= 7; tag++) {
    for (const slot of [1, 2]) {
      const von = text(form, `von_${tag}_${slot}`);
      const bis = text(form, `bis_${tag}_${slot}`);
      if (!von && !bis) continue;
      if (!zeitMuster.test(von) || !zeitMuster.test(bis) || von === bis) {
        zurueckMitFehler("oeffnungszeiten", "ZEIT_UNGUELTIG");
      }
      zeiten.push({ wochentag: tag, von, bis });
    }
  }
  const db = await datenbank();
  const { error } = await db.rpc("oeffnungszeiten_setzen", { p_restaurant: ich.restaurantId, p_zeiten: zeiten });
  if (error) zurueckMitFehler("oeffnungszeiten", dbFehler(error));
  fertig("oeffnungszeiten", form, seiten.tische);
}

export async function vergabeSpeichern(form: FormData) {
  const ich = await leitungErforderlich();
  const modus = text(form, "vergabeModus");
  if (modus !== "tische" && modus !== "plaetze") zurueckMitFehler("tische", "EINGABE_FEHLT");
  const plaetze = zahl(form, "plaetzeGesamt");
  if (modus === "plaetze" && !(plaetze >= 1 && plaetze <= 2000)) zurueckMitFehler("tische", "ZAHL_UNGUELTIG");

  const db = await datenbank();
  const { error } = await db
    .from("restaurants")
    .update({ vergabe_modus: modus, plaetze_gesamt: modus === "plaetze" ? plaetze : null })
    .eq("id", ich.restaurantId);
  if (error) zurueckMitFehler("tische", dbFehler(error));
  revalidatePath("/", "layout");
  redirect(`${seiten.tische}?ok=1`);
}

export async function tischeAnlegen(form: FormData) {
  const ich = await leitungErforderlich();
  const anzahl = zahl(form, "anzahl");
  const plaetze = zahl(form, "plaetze");
  const bereich = text(form, "bereich").slice(0, 40);
  const eigenerName = text(form, "name").slice(0, 40);
  if (!(anzahl >= 1 && anzahl <= 50) || !(plaetze >= 1 && plaetze <= 99)) {
    zurueckMitFehler("tische", "ZAHL_UNGUELTIG");
  }

  const db = await datenbank();
  let namen: string[];
  if (anzahl === 1 && eigenerName) {
    namen = [eigenerName];
  } else {
    // Fortlaufend nummerieren und dabei schon vergebene Nummern überspringen.
    const { data: vorhandene, error: leseFehler } = await db
      .from("tische")
      .select("name")
      .eq("restaurant_id", ich.restaurantId);
    if (leseFehler) zurueckMitFehler("tische", dbFehler(leseFehler));
    const belegt = new Set((vorhandene ?? []).map((t) => t.name));
    namen = [];
    for (let nummer = 1; namen.length < anzahl; nummer++) {
      const name = `Tisch ${nummer}`;
      if (!belegt.has(name)) namen.push(name);
    }
  }

  const { error } = await db
    .from("tische")
    .insert(namen.map((name) => ({ restaurant_id: ich.restaurantId, name, plaetze, bereich })));
  if (error) zurueckMitFehler("tische", dbFehler(error));
  revalidatePath("/", "layout");
  redirect(`${seiten.tische}?ok=1`);
}

export async function tischEntfernen(form: FormData) {
  const ich = await leitungErforderlich();
  const id = text(form, "id");
  if (!id) zurueckMitFehler("tische", "EINGABE_FEHLT");
  const db = await datenbank();
  const { error } = await db.from("tische").delete().eq("id", id).eq("restaurant_id", ich.restaurantId);
  if (error) zurueckMitFehler("tische", dbFehler(error));
  revalidatePath("/", "layout");
  redirect(`${seiten.tische}?ok=1`);
}

export async function dauerSpeichern(form: FormData) {
  const ich = await leitungErforderlich();
  const modus = text(form, "dauerModus");
  const dauer = zahl(form, "standardDauerMinuten");
  if (modus !== "fest" && modus !== "offen" && modus !== "durchgaenge") zurueckMitFehler("tischdauer", "EINGABE_FEHLT");
  if (!(dauer >= 30 && dauer <= 480 && dauer % 15 === 0)) zurueckMitFehler("tischdauer", "ZAHL_UNGUELTIG");

  const db = await datenbank();
  const { error } = await db
    .from("restaurants")
    .update({ dauer_modus: modus, standard_dauer_minuten: dauer })
    .eq("id", ich.restaurantId);
  if (error) zurueckMitFehler("tischdauer", dbFehler(error));
  fertig("tischdauer", form, seiten.warteliste);
}

export async function durchgangAnlegen(form: FormData) {
  const ich = await leitungErforderlich();
  const von = text(form, "von");
  const bis = text(form, "bis");
  const tag = text(form, "wochentag");
  const wochentag = tag === "" ? null : Number(tag);
  if (!zeitMuster.test(von) || !zeitMuster.test(bis) || von === bis) zurueckMitFehler("tischdauer", "ZEIT_UNGUELTIG");
  if (wochentag !== null && !(Number.isInteger(wochentag) && wochentag >= 1 && wochentag <= 7)) {
    zurueckMitFehler("tischdauer", "EINGABE_FEHLT");
  }

  const db = await datenbank();
  const { error } = await db.from("durchgaenge").insert({
    restaurant_id: ich.restaurantId,
    wochentag,
    name: text(form, "name").slice(0, 40),
    von,
    bis,
  });
  if (error) zurueckMitFehler("tischdauer", dbFehler(error));
  revalidatePath("/", "layout");
  redirect(`${seiten.tischdauer}?ok=1`);
}

export async function durchgangEntfernen(form: FormData) {
  const ich = await leitungErforderlich();
  const id = text(form, "id");
  if (!id) zurueckMitFehler("tischdauer", "EINGABE_FEHLT");
  const db = await datenbank();
  const { error } = await db.from("durchgaenge").delete().eq("id", id).eq("restaurant_id", ich.restaurantId);
  if (error) zurueckMitFehler("tischdauer", dbFehler(error));
  revalidatePath("/", "layout");
  redirect(`${seiten.tischdauer}?ok=1`);
}

export async function wartelisteSpeichern(form: FormData) {
  const ich = await leitungErforderlich();
  const modus = text(form, "wartelisteModus");
  const frist = zahl(form, "wartelisteFristMinuten");
  const loeschfrist = zahl(form, "loeschfristMonate");
  if (modus !== "automatisch" && modus !== "manuell") zurueckMitFehler("warteliste", "EINGABE_FEHLT");
  if (!(frist >= 5 && frist <= 120) || !(loeschfrist >= 1 && loeschfrist <= 120)) {
    zurueckMitFehler("warteliste", "ZAHL_UNGUELTIG");
  }

  const db = await datenbank();
  const { error } = await db
    .from("restaurants")
    .update({
      warteliste_modus: modus,
      warteliste_frist_minuten: frist,
      loeschfrist_monate: loeschfrist,
      // Der letzte Schritt schließt die Ersteinrichtung ab.
      einrichtung_abgeschlossen: true,
    })
    .eq("id", ich.restaurantId);
  if (error) zurueckMitFehler("warteliste", dbFehler(error));
  revalidatePath("/", "layout");
  redirect("/einstellungen?fertig=1");
}
