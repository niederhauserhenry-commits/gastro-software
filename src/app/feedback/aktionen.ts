"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fehlerCode } from "@/lib/fehler";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";

const arten = ["wunsch", "problem", "lob"];

export async function feedbackSenden(form: FormData) {
  const ich = await aktuelleMitgliedschaft();
  const art = String(form.get("art") ?? "");
  const text = String(form.get("text") ?? "").trim();
  if (!arten.includes(art) || text.length < 3) redirect("/feedback?fehler=EINGABE_FEHLT");
  const db = await datenbank();
  const { error } = await db.rpc("feedback_senden", { p_restaurant: ich.restaurantId, p_art: art, p_text: text.slice(0, 2000) });
  if (error) redirect(`/feedback?fehler=${fehlerCode(error.message)}`);
  revalidatePath("/feedback");
  redirect("/feedback?ok=1");
}
