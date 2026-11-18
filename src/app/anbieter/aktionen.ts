"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { istPlattformAdmin } from "@/lib/daten";
import { fehlerCode } from "@/lib/fehler";
import { datenbank } from "@/lib/supabase/server";

const stati = ["neu", "gelesen", "geplant", "erledigt", "abgelehnt"];

async function nurAnbieter() {
  if (!(await istPlattformAdmin())) redirect("/");
}

export async function feedbackBeantworten(form: FormData) {
  await nurAnbieter();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  const antwort = String(form.get("antwort") ?? "").slice(0, 2000);
  if (!stati.includes(status)) redirect("/anbieter?fehler=EINGABE_FEHLT");
  const db = await datenbank();
  const { error } = await db.rpc("feedback_beantworten", { p_id: id, p_status: status, p_antwort: antwort });
  if (error) redirect(`/anbieter?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/anbieter");
  redirect(`/anbieter?ok=gespeichert#f-${id}`);
}

export async function berichtErstellen() {
  await nurAnbieter();
  const db = await datenbank();
  const { error } = await db.rpc("wochenbericht_erstellen");
  if (error) redirect(`/anbieter?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/anbieter");
  redirect("/anbieter?ok=bericht#berichte");
}
