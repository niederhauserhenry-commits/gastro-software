import { redirect } from "next/navigation";
import { abmelden, restaurantAnlegen } from "@/app/aktionen";
import { Kopfleiste, Meldung, Seite, feldKlasse, knopfKlasse } from "@/app/bausteine";
import { fehlerText } from "@/lib/fehler";
import { datenbank } from "@/lib/supabase/server";
import { texte } from "@/texte";

export default async function Einrichten({ searchParams }: PageProps<"/einrichten">) {
  const t = texte();
  const db = await datenbank();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/anmelden");
  // Wer schon zu einem Restaurant gehört, braucht diese Seite nicht.
  const { count } = await db.from("mitglieder").select("*", { count: "exact", head: true }).eq("user_id", data.user.id);
  if (count && count > 0) redirect("/");

  const fehler = fehlerText((await searchParams).fehler);

  return (
    <>
      <Kopfleiste restaurantName={t.appName} />
      <Seite schmal>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">{t.einrichten.titel}</h1>
      <p className="mb-6 text-stift">{t.einrichten.hinweis}</p>

      {fehler && <Meldung art="fehler">{fehler}</Meldung>}

      <form action={restaurantAnlegen} className="space-y-4">
        <label className="block font-medium">
          {t.einrichten.restaurantName}
          <input name="restaurantName" required minLength={2} maxLength={80} className={feldKlasse} />
        </label>
        <label className="block font-medium">
          {t.einrichten.deinName}
          <input name="anzeigename" required maxLength={80} autoComplete="name" className={feldKlasse} />
        </label>
        <button className={`${knopfKlasse} w-full`}>{t.einrichten.anlegen}</button>
      </form>

      <form action={abmelden} className="mt-8">
        <button className="text-stift underline underline-offset-4">{t.allgemein.abmelden}</button>
      </form>
      </Seite>
    </>
  );
}
