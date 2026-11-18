import Link from "next/link";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { gaesteImportieren, restaurantLoeschen } from "@/app/einstellungen/daten/aktionen";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ladeEinstellungen } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function Daten({ searchParams }: PageProps<"/einstellungen/daten">) {
  const t = texte();
  const d = t.daten;
  const ich = await leitungErforderlich();
  const parameter = await searchParams;
  const einstellungen = await ladeEinstellungen(ich.restaurantId);
  const fehler = fehlerText(parameter.fehler);
  const importErgebnis = typeof parameter.import === "string" ? /^(\d+)-(\d+)-(\d+)$/.exec(parameter.import) : null;

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen">{t.einstellungen.zurueck}</Zurueck>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.einstellungen.bereiche.daten.titel}</h1>
        <p className="mb-6 mt-2 max-w-2xl text-stift">{d.hinweis}</p>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {importErgebnis && (
          <Meldung art="ok">
            {d.importErgebnis.replace("{neu}", importErgebnis[1]).replace("{doppelt}", importErgebnis[2]).replace("{fehler}", importErgebnis[3])}
          </Meldung>
        )}

        <div className="space-y-6">
          <section className={karteKlasse}>
            <h2 className="text-xl font-semibold">{d.exportTitel}</h2>
            <p className="mb-4 mt-1 max-w-2xl text-stift">{d.exportText}</p>
            {/* Ein normaler Link, damit der Browser die Datei herunterlädt. */}
            <a href="/einstellungen/daten/export" className={knopfKlasse} download>
              {d.exportKnopf}
            </a>
          </section>

          <section className={karteKlasse}>
            <h2 className="text-xl font-semibold">{d.importTitel}</h2>
            <p className="mb-4 mt-1 max-w-2xl text-stift">{d.importText}</p>
            <form action={gaesteImportieren} className="flex flex-wrap items-end gap-3">
              <label className="block min-w-0 flex-1 font-medium">
                {d.importDatei}
                <input
                  type="file"
                  name="datei"
                  required
                  accept=".csv,text/csv,text/plain"
                  className={`${feldKlasse} file:mr-3 file:rounded-md file:border-0 file:bg-kreide file:px-3 file:py-1.5 file:font-medium`}
                />
              </label>
              <button className={knopfZweitKlasse}>{d.importKnopf}</button>
            </form>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className={karteKlasse}>
              <h2 className="text-xl font-semibold">{d.protokollTitel}</h2>
              <p className="mb-4 mt-1 text-stift">{d.protokollText}</p>
              <Link href="/einstellungen/protokoll" className={knopfZweitKlasse}>
                {d.protokollLink}
              </Link>
            </section>
            <section className={karteKlasse}>
              <h2 className="text-xl font-semibold">{d.loeschfristTitel}</h2>
              <p className="mb-4 mt-1 text-stift">{d.loeschfristText.replace("{monate}", String(einstellungen.loeschfristMonate))}</p>
              <Link href="/einstellungen/warteliste" className={knopfZweitKlasse}>
                {d.loeschfristLink}
              </Link>
            </section>
          </div>

          <section className={karteKlasse}>
            <h2 className="text-xl font-semibold">{d.auskunftTitel}</h2>
            <p className="mt-1 max-w-2xl text-stift">{d.auskunftText}</p>
          </section>

          {ich.rolle === "inhaber" && (
            <section className="rounded-xl border border-warnrot/30 bg-papier p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-warnrot">{d.loeschenTitel}</h2>
              <p className="mb-4 mt-1 max-w-2xl text-stift">{d.loeschenText}</p>
              <form action={restaurantLoeschen} className="flex flex-wrap items-end gap-3">
                <label className="block min-w-0 flex-1 font-medium">
                  {d.loeschenName}
                  <input name="name" required autoComplete="off" placeholder={ich.restaurantName} className={feldKlasse} />
                </label>
                <button className="inline-flex items-center justify-center rounded-lg border border-warnrot/50 px-5 py-3 font-semibold text-warnrot hover:bg-warnrot-hell">
                  {d.loeschenKnopf}
                </button>
              </form>
            </section>
          )}
        </div>
      </Seite>
    </>
  );
}
