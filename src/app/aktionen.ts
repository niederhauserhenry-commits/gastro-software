"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fehlerCode } from "@/lib/fehler";
import { datenbank } from "@/lib/supabase/server";
import type { FehlerCode } from "@/texte/de";

function text(form: FormData, feld: string) {
  const wert = form.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

function anmeldeFehler(meldung: string, code?: string): FehlerCode {
  if (code === "email_not_confirmed") return "EMAIL_NICHT_BESTAETIGT";
  if (code === "user_already_exists") return "KONTO_EXISTIERT";
  if (code === "weak_password") return "PASSWORT_ZU_KURZ";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "ZU_VIELE_VERSUCHE";
  if (code === "invalid_credentials") return "ANMELDUNG_FALSCH";
  return fehlerCode(meldung);
}

export async function anmelden(form: FormData) {
  const email = text(form, "email");
  const passwort = text(form, "passwort");
  if (!email || !passwort) redirect("/anmelden?fehler=EINGABE_FEHLT");

  const db = await datenbank();
  const { error } = await db.auth.signInWithPassword({ email, password: passwort });
  if (error) redirect(`/anmelden?fehler=${anmeldeFehler(error.message, error.code)}`);
  redirect("/");
}

export async function registrieren(form: FormData) {
  const email = text(form, "email");
  const passwort = text(form, "passwort");
  if (!email || !passwort) redirect("/anmelden?fehler=EINGABE_FEHLT");
  if (passwort.length < 8) redirect("/anmelden?fehler=PASSWORT_ZU_KURZ");

  const kopf = await headers();
  const herkunft = kopf.get("origin") ?? `https://${kopf.get("host")}`;
  const db = await datenbank();
  const { data, error } = await db.auth.signUp({
    email,
    password: passwort,
    options: { emailRedirectTo: `${herkunft}/auth/rueckruf` },
  });
  if (error) redirect(`/anmelden?fehler=${anmeldeFehler(error.message, error.code)}`);
  // Ohne Sitzung wartet Supabase auf die Bestätigung per E-Mail.
  if (!data.session) redirect("/anmelden?hinweis=bestaetigen");
  redirect("/");
}

export async function abmelden() {
  const db = await datenbank();
  await db.auth.signOut();
  redirect("/anmelden");
}

export async function restaurantAnlegen(form: FormData) {
  const name = text(form, "restaurantName");
  const anzeigename = text(form, "anzeigename");
  if (name.length < 2 || !anzeigename) redirect("/einrichten?fehler=EINGABE_FEHLT");

  const db = await datenbank();
  const { error } = await db.rpc("restaurant_anlegen", { p_name: name, p_anzeigename: anzeigename });
  if (error) redirect(`/einrichten?fehler=${fehlerCode(error.message)}`);
  redirect("/");
}

const rollen = ["inhaber", "manager", "mitarbeiter", "azubi"];

export async function mitgliedHinzufuegen(form: FormData) {
  const restaurant = text(form, "restaurantId");
  const email = text(form, "email");
  const anzeigename = text(form, "anzeigename");
  const rolle = text(form, "rolle");
  if (!restaurant || !email || !anzeigename || !rollen.includes(rolle)) redirect("/team?fehler=EINGABE_FEHLT");

  const db = await datenbank();
  const { error } = await db.rpc("mitglied_hinzufuegen", {
    p_restaurant: restaurant,
    p_email: email,
    p_anzeigename: anzeigename,
    p_rolle: rolle,
    p_darf_reservieren: form.get("darfReservieren") === "on",
  });
  if (error) redirect(`/team?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/team");
  redirect("/team?ok=1");
}

export async function mitgliedAendern(form: FormData) {
  const restaurant = text(form, "restaurantId");
  const user = text(form, "userId");
  const rolle = text(form, "rolle");
  if (!restaurant || !user || !rollen.includes(rolle)) redirect("/team?fehler=EINGABE_FEHLT");

  const db = await datenbank();
  const { error } = await db.rpc("mitglied_aendern", {
    p_restaurant: restaurant,
    p_user: user,
    p_rolle: rolle,
    p_darf_reservieren: form.get("darfReservieren") === "on",
  });
  if (error) redirect(`/team?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/team");
  redirect("/team?ok=1");
}

export async function mitgliedEntfernen(form: FormData) {
  const restaurant = text(form, "restaurantId");
  const user = text(form, "userId");
  if (!restaurant || !user) redirect("/team?fehler=EINGABE_FEHLT");

  const db = await datenbank();
  const { error } = await db.rpc("mitglied_entfernen", { p_restaurant: restaurant, p_user: user });
  if (error) redirect(`/team?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/team");
  redirect("/team?ok=1");
}
