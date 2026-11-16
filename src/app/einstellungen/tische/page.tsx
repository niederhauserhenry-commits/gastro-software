import Link from "next/link";
import { Auswahl, feldKlasse, karteKlasse, knopfKlasse, knopfLoeschKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { tischEntfernen, tischeAnlegen, vergabeSpeichern } from "@/app/einstellungen/aktionen";
import { EinrichtungsRahmen } from "@/app/einstellungen/rahmen";
import { ladeEinstellungen, ladeTische, type Tisch } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function Tische({ searchParams }: PageProps<"/einstellungen/tische">) {
  const t = texte();
  const ich = await leitungErforderlich();
  const [einstellungen, tische] = await Promise.all([
    ladeEinstellungen(ich.restaurantId),
    ladeTische(ich.restaurantId),
  ]);

  // Tische nach Bereich gruppieren, in der Reihenfolge des ersten Auftretens.
  const gruppen = new Map<string, Tisch[]>();
  for (const tisch of tische) {
    const liste = gruppen.get(tisch.bereich) ?? [];
    liste.push(tisch);
    gruppen.set(tisch.bereich, liste);
  }
  const plaetzeSumme = tische.reduce((summe, tisch) => summe + tisch.plaetze, 0);
  const bereiche = [...gruppen.keys()].filter(Boolean);

  return (
    <EinrichtungsRahmen ich={ich} schritt="tische" parameter={await searchParams}>
      <section className={karteKlasse}>
        <h2 className="mb-4 text-xl font-semibold">{t.tische.vergabeTitel}</h2>
        <form action={vergabeSpeichern} className="space-y-3">
          <Auswahl name="vergabeModus" wert="tische" gewaehlt={einstellungen.vergabeModus === "tische"} titel={t.tische.vergabeTische} text={t.tische.vergabeTischeText} />
          <Auswahl name="vergabeModus" wert="plaetze" gewaehlt={einstellungen.vergabeModus === "plaetze"} titel={t.tische.vergabePlaetze} text={t.tische.vergabePlaetzeText} />
          <label className="block max-w-xs pt-2 font-medium">
            {t.tische.plaetzeGesamt}
            <input type="number" name="plaetzeGesamt" min={1} max={2000} inputMode="numeric" defaultValue={einstellungen.plaetzeGesamt ?? ""} className={`${feldKlasse} ziffern`} />
            <span className="mt-1.5 block text-sm font-normal text-stift">{t.tische.plaetzeHinweis}</span>
          </label>
          <button className={knopfZweitKlasse}>{t.allgemein.speichern}</button>
        </form>
      </section>

      {einstellungen.vergabeModus === "tische" && (
        <>
          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">{t.tische.listeTitel}</h2>
              {tische.length > 0 && (
                <p className="ziffern text-stift">
                  {tische.length} {t.tische.summe} {plaetzeSumme} {t.tische.plaetze}
                </p>
              )}
            </div>

            {tische.length === 0 ? (
              <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-8 text-center text-stift">{t.tische.keine}</p>
            ) : (
              <div className="space-y-5">
                {[...gruppen.entries()].map(([bereich, liste]) => (
                  <div key={bereich || "ohne"}>
                    <h3 className="mb-2 font-semibold text-stift">{bereich || t.tische.ohneBereich}</h3>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {liste.map((tisch) => (
                        <li key={tisch.id} className="flex items-center justify-between gap-2 rounded-lg border border-linie bg-papier py-2 pl-4 pr-1">
                          <span>
                            <span className="block font-semibold">{tisch.name}</span>
                            <span className="ziffern block text-sm text-stift">
                              {tisch.plaetze} {t.tische.plaetze}
                            </span>
                          </span>
                          <form action={tischEntfernen}>
                            <input type="hidden" name="id" value={tisch.id} />
                            <button className={knopfLoeschKlasse} aria-label={`${tisch.name} ${t.allgemein.entfernen}`}>
                              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
                              </svg>
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${karteKlasse} mt-8`}>
            <h2 className="text-xl font-semibold">{t.tische.neuTitel}</h2>
            <p className="mb-4 text-stift">{t.tische.neuHinweis}</p>
            <form action={tischeAnlegen} className="grid gap-4 sm:grid-cols-3">
              <label className="block font-medium">
                {t.tische.anzahl}
                <input type="number" name="anzahl" min={1} max={50} defaultValue={1} required inputMode="numeric" className={`${feldKlasse} ziffern`} />
              </label>
              <label className="block font-medium">
                {t.tische.plaetzeJeTisch}
                <input type="number" name="plaetze" min={1} max={99} defaultValue={4} required inputMode="numeric" className={`${feldKlasse} ziffern`} />
              </label>
              <label className="block font-medium">
                {t.tische.bereich}
                <input name="bereich" maxLength={40} list="bereiche" className={feldKlasse} />
                <datalist id="bereiche">
                  {bereiche.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </label>
              <label className="block font-medium sm:col-span-2">
                {t.tische.eigenerName}
                <input name="name" maxLength={40} className={feldKlasse} />
              </label>
              <div className="flex items-end">
                <button className={`${knopfKlasse} w-full`}>{t.allgemein.hinzufuegen}</button>
              </div>
            </form>
          </section>
        </>
      )}

      {!ich.einrichtungAbgeschlossen && (
        <div className="mt-8">
          <Link href="/einstellungen/tischdauer" className={`${knopfKlasse} w-full px-6 py-3.5 text-lg sm:w-auto`}>
            {t.tische.weiter}
          </Link>
        </div>
      )}
    </EinrichtungsRahmen>
  );
}
