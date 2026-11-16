import { mitgliedAendern, mitgliedEntfernen, mitgliedHinzufuegen } from "@/app/aktionen";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse, knopfLoeschKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ladeTeam } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft, darfRolleVerwalten, istLeitung, type Rolle } from "@/lib/sitzung";
import { texte } from "@/texte";

const alleRollen: Rolle[] = ["inhaber", "manager", "mitarbeiter", "azubi"];

export default async function Team({ searchParams }: PageProps<"/team">) {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  const fehler = fehlerText(parameter.fehler);
  const team = await ladeTeam(ich.restaurantId);

  // Rollen, die ich vergeben darf.
  const vergebbar = alleRollen.filter((r) => darfRolleVerwalten(ich.rolle, r));

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen">{t.einstellungen.zurueck}</Zurueck>
        <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{t.team.titel}</h1>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "1" && <Meldung art="ok">{t.team.gespeichert}</Meldung>}

        <ul className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
          {team.map((person) => {
            const bearbeitbar = darfRolleVerwalten(ich.rolle, person.rolle);
            const leitung = istLeitung(person.rolle);
            return (
              <li key={person.userId} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="text-xl font-semibold">
                    {person.anzeigename}
                    {person.userId === ich.userId && (
                      <span className="ml-2 rounded-md bg-tafel-hell px-2 py-0.5 text-sm font-medium text-tafel-tief">
                        {t.team.du}
                      </span>
                    )}
                  </p>
                  <p className="text-stift">{person.email}</p>
                </div>

                {bearbeitbar ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <form action={mitgliedAendern} className="flex flex-1 flex-wrap items-end gap-x-4 gap-y-3">
                      <input type="hidden" name="restaurantId" value={ich.restaurantId} />
                      <input type="hidden" name="userId" value={person.userId} />
                      <label className="block text-sm text-stift">
                        {t.team.rolle}
                        <select name="rolle" defaultValue={person.rolle} className={`${feldKlasse} py-2.5`}>
                          {vergebbar.map((r) => (
                            <option key={r} value={r}>
                              {t.rollen[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2.5 py-2.5">
                        <input type="checkbox" name="darfReservieren" defaultChecked={person.darfReservieren} className="h-5 w-5 accent-tafel" />
                        {t.team.darfReservieren}
                      </label>
                      <button className={`${knopfZweitKlasse} py-2.5`}>{t.allgemein.speichern}</button>
                    </form>
                    {/* Sich selbst entfernt man nicht versehentlich mit einem Klick. */}
                    {person.userId !== ich.userId && (
                    <form action={mitgliedEntfernen}>
                      <input type="hidden" name="restaurantId" value={ich.restaurantId} />
                      <input type="hidden" name="userId" value={person.userId} />
                      <button className={knopfLoeschKlasse}>{t.team.entfernen}</button>
                    </form>
                    )}
                  </div>
                ) : (
                  <p className="mt-1">
                    <span className="font-medium">{t.rollen[person.rolle]}</span>
                    <span className="text-stift">
                      {leitung ? `, ${t.team.immerErlaubt}` : person.darfReservieren ? `, ${t.team.darfReservieren}` : ""}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {istLeitung(ich.rolle) && (
          <section className={`${karteKlasse} mt-8`}>
            <h2 className="text-xl font-semibold">{t.team.hinzufuegenTitel}</h2>
            <p className="mb-4 text-stift">{t.team.hinzufuegenHinweis}</p>
            <form action={mitgliedHinzufuegen} className="grid gap-4 sm:grid-cols-2">
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
              <label className="flex items-center gap-2.5 sm:pt-7">
                <input type="checkbox" name="darfReservieren" className="h-5 w-5 accent-tafel" />
                {t.team.darfReservieren}
              </label>
              <div className="sm:col-span-2">
                <button className={knopfKlasse}>{t.team.hinzufuegen}</button>
              </div>
            </form>
          </section>
        )}
      </Seite>
    </>
  );
}
