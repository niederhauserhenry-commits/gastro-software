import Link from "next/link";
import { mitgliedAendern, mitgliedEntfernen, mitgliedHinzufuegen } from "@/app/aktionen";
import { Meldung, feldKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft, darfRolleVerwalten, istLeitung, type Rolle } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";
import { texte } from "@/texte";

const alleRollen: Rolle[] = ["inhaber", "manager", "mitarbeiter", "azubi"];

export default async function Team({ searchParams }: PageProps<"/team">) {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  const fehler = fehlerText(parameter.fehler);

  const db = await datenbank();
  const { data: team, error } = await db
    .from("mitglieder")
    .select("user_id, anzeigename, email, rolle, darf_reservieren")
    .eq("restaurant_id", ich.restaurantId)
    .order("erstellt_am", { ascending: true });
  if (error) throw new Error(error.message);

  // Rollen, die ich vergeben darf.
  const vergebbar = alleRollen.filter((r) => darfRolleVerwalten(ich.rolle, r));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/" className="text-green-900 underline">
        ← {t.allgemein.zurueck}
      </Link>
      <p className="mt-4 text-sm font-medium text-green-900">{ich.restaurantName}</p>
      <h1 className="mb-6 text-3xl font-bold">{t.team.titel}</h1>

      {fehler && <Meldung art="fehler">{fehler}</Meldung>}
      {parameter.ok === "1" && <Meldung art="ok">{t.team.gespeichert}</Meldung>}

      <ul className="space-y-4">
        {(team ?? []).map((person) => {
          const rolle = person.rolle as Rolle;
          const bearbeitbar = darfRolleVerwalten(ich.rolle, rolle);
          const leitung = istLeitung(rolle);
          return (
            <li key={person.user_id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xl font-semibold">
                {person.anzeigename}
                {person.user_id === ich.userId && (
                  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                    {t.team.du}
                  </span>
                )}
              </p>
              <p className="text-stone-600">{person.email}</p>

              {bearbeitbar ? (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <form action={mitgliedAendern} className="flex flex-1 flex-wrap items-end gap-3">
                    <input type="hidden" name="restaurantId" value={ich.restaurantId} />
                    <input type="hidden" name="userId" value={person.user_id} />
                    <label className="block font-medium">
                      {t.team.rolle}
                      <select name="rolle" defaultValue={rolle} className={feldKlasse}>
                        {vergebbar.map((r) => (
                          <option key={r} value={r}>
                            {t.rollen[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 py-3">
                      <input type="checkbox" name="darfReservieren" defaultChecked={person.darf_reservieren} className="h-5 w-5" />
                      {t.team.darfReservieren}
                    </label>
                    <button className={knopfZweitKlasse}>{t.allgemein.speichern}</button>
                  </form>
                  <form action={mitgliedEntfernen}>
                    <input type="hidden" name="restaurantId" value={ich.restaurantId} />
                    <input type="hidden" name="userId" value={person.user_id} />
                    <button className="rounded-xl px-3 py-3 font-medium text-red-800 underline">{t.team.entfernen}</button>
                  </form>
                </div>
              ) : (
                <p className="mt-2 text-stone-800">
                  {t.rollen[rolle]} ·{" "}
                  {leitung ? t.team.immerErlaubt : person.darf_reservieren ? t.team.darfReservieren : "–"}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {istLeitung(ich.rolle) && (
        <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">{t.team.hinzufuegenTitel}</h2>
          <p className="mb-4 text-stone-600">{t.team.hinzufuegenHinweis}</p>
          <form action={mitgliedHinzufuegen} className="space-y-4">
            <input type="hidden" name="restaurantId" value={ich.restaurantId} />
            <label className="block font-medium">
              {t.anmelden.email}
              <input name="email" type="email" required className={feldKlasse} />
            </label>
            <label className="block font-medium">
              {t.team.name}
              <input name="anzeigename" required maxLength={80} className={feldKlasse} />
            </label>
            <label className="block font-medium">
              {t.team.rolle}
              <select name="rolle" defaultValue="mitarbeiter" className={feldKlasse}>
                {vergebbar.map((r) => (
                  <option key={r} value={r}>
                    {t.rollen[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="darfReservieren" className="h-5 w-5" />
              {t.team.darfReservieren}
            </label>
            <button className={knopfKlasse}>{t.team.hinzufuegen}</button>
          </form>
        </section>
      )}
    </main>
  );
}
