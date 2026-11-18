"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gaesteAusCsv } from "@/lib/csv";
import { fehlerCode } from "@/lib/fehler";
import { leitungErforderlich } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";

const ziel = "/einstellungen/daten";

export async function gaesteImportieren(form: FormData) {
  const ich = await leitungErforderlich();
  const datei = form.get("datei");
  if (!(datei instanceof File) || datei.size === 0 || datei.size > 3_000_000) redirect(`${ziel}?fehler=DATEI_UNGUELTIG`);

  // Excel speichert CSV oft im alten Windows-Zeichensatz. Dann sind Umlaute kaputt.
  const roh = await datei.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(roh);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(roh);

  const { gaeste, spaltenGefunden } = gaesteAusCsv(text);
  if (!spaltenGefunden || gaeste.length === 0) redirect(`${ziel}?fehler=DATEI_UNGUELTIG`);
  if (gaeste.length > 5000) redirect(`${ziel}?fehler=ZAHL_UNGUELTIG`);

  const db = await datenbank();
  const { data, error } = await db.rpc("gaeste_importieren", { p_restaurant: ich.restaurantId, p_zeilen: gaeste });
  if (error) redirect(`${ziel}?fehler=${fehlerCode(error.message)}`);
  const e = data as { neu: number; doppelt: number; fehler: number };
  revalidatePath("/", "layout");
  redirect(`${ziel}?import=${e.neu}-${e.doppelt}-${e.fehler}`);
}

export async function restaurantLoeschen(form: FormData) {
  const ich = await leitungErforderlich();
  const name = form.get("name");
  const db = await datenbank();
  const { error } = await db.rpc("restaurant_loeschen", {
    p_restaurant: ich.restaurantId,
    p_name: typeof name === "string" ? name : "",
  });
  if (error) redirect(`${ziel}?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/einrichten");
}
