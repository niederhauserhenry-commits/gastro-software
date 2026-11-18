import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, knopfKlasse, knopfLoeschKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { aufenthaltAnlegen, aufenthaltEntfernen } from "@/app/gaeste/aktionen";
import { GastMarken } from "@/app/gaeste/marken";
import {
  datumImRestaurant, datumLang, istUuid, ladeAufenthalte, ladeBesuche, ladeEinstellungen, ladeGast,
  type ReservierungStatus,
} from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { texte } from "@/texte";

const warDa: ReservierungStatus[] = ["angekommen", "abgeschlossen"];

export default async function Karteikarte({ params, searchParams }: PageProps<"/gaeste/[id]">) {
  const t = texte();
  const g = t.gaeste;
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  await connection();

  const [gast, besuche, aufenthalte, einstellungen] = await Promise.all([
    ladeGast(id),
    ladeBesuche(id),
    ladeAufenthalte(id),
    ladeEinstellungen(ich.restaurantId),
  ]);
  if (!gast) notFound();

  const heute = datumImRestaurant(einstellungen.zeitzone);
  const echteBesuche = besuche.filter((b) => warDa.includes(b.status));
  const letzter = echteBesuche[0]?.datum ?? null;
  const imHaus = aufenthalte.find((a) => a.anreise <= heute && heute <= a.abreise);
  const fehler = fehlerText(parameter.fehler);

  const fakt = (titel: string, wert: React.ReactNode) => (
    <div className="py-2.5">
      <dt className="text-sm text-stift">{titel}</dt>
      <dd className="ziffern text-lg">{wert}</dd>
    </div>
  );

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/gaeste">{g.zurueck}</Zurueck>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "1" && <Meldung art="ok">{g.gespeichert}</Meldung>}

        <header className="mb-6">
          <p className="text-stift">{g.karteikarte}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{gast.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <GastMarken besuche={echteBesuche.length} zimmer={imHaus?.zimmer ?? ""} allergien="" />
          </div>
          {ich.darfReservieren && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/reservierungen/neu?gast=${gast.id}`} className={`${knopfKlasse} px-5`}>
                {g.reservieren}
              </Link>
              <Link href={`/gaeste/${gast.id}/bearbeiten`} className={`${knopfZweitKlasse} px-5`}>
                {g.bearbeiten}
              </Link>
              {istLeitung(ich.rolle) && (
                <a href={`/gaeste/${gast.id}/auskunft`} download className={`${knopfZweitKlasse} px-5`}>
                  {g.auskunft}
                </a>
              )}
            </div>
          )}
        </header>

        {gast.allergien && (
          <section className="mb-6 flex gap-4 rounded-xl border-2 border-warnrot/50 bg-warnrot-hell p-5 text-warnrot">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-7 w-7 shrink-0" fill="currentColor">
              <path d="M10 2.5 1.8 17h16.4L10 2.5Zm0 4.3 1 .1-.3 5.6H9.3L9 6.9l1-.1Zm0 7.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            <div>
              <h2 className="font-semibold">{g.allergienTitel}</h2>
              <p className="text-2xl font-bold">{gast.allergien}</p>
              {gast.einwilligungAm && (
                <p className="mt-1 text-sm text-warnrot/80">
                  {g.formular.einwilligungVom} {datumLang(gast.einwilligungAm)}
                </p>
              )}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            <section className="rounded-xl border border-linie bg-papier p-5 sm:p-6">
              <h2 className="text-xl font-semibold">{g.vorlieben}</h2>
              <p className={`mt-1 whitespace-pre-line text-lg ${gast.vorlieben ? "" : "text-stift"}`}>
                {gast.vorlieben || g.vorliebenLeer}
              </p>
              {gast.notizen && (
                <>
                  <h2 className="mt-5 text-xl font-semibold">{g.notizen}</h2>
                  <p className="mt-1 whitespace-pre-line">{gast.notizen}</p>
                </>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xl font-semibold">{g.verlauf}</h2>
              {besuche.length === 0 ? (
                <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-8 text-center text-stift">{g.verlaufLeer}</p>
              ) : (
                <ol className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
                  {besuche.map((b) => {
                    const ausgefallen = b.status === "storniert" || b.status === "nicht_erschienen";
                    return (
                      <li key={b.id} className={`grid gap-x-4 px-5 py-3.5 sm:grid-cols-[11rem_1fr] ${ausgefallen ? "bg-kreide/60 text-stift" : ""}`}>
                        <p className="ziffern font-semibold">
                          {datumLang(b.datum)}
                          <span className="block text-sm font-normal text-stift">
                            {b.von}, {b.personen} {g.personen}
                            {b.tischName ? `, ${b.tischName}` : ""}
                          </span>
                        </p>
                        <div>
                          {b.status !== "abgeschlossen" && (
                            <p className="text-sm font-semibold">{t.reservierungen.status[b.status]}</p>
                          )}
                          {b.anlass && <p className="font-medium">{b.anlass}</p>}
                          {b.notiz && <p>{b.notiz}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-linie bg-papier px-5 py-3">
              <dl className="divide-y divide-linie">
                {gast.telefon && fakt(g.telefon, <a href={`tel:${gast.telefon.replace(/[^0-9+]/g, "")}`} className="underline underline-offset-4">{gast.telefon}</a>)}
                {gast.email && fakt(g.email, <a href={`mailto:${gast.email}`} className="break-all underline underline-offset-4">{gast.email}</a>)}
                {gast.geburtstag && fakt(g.geburtstag, datumLang(gast.geburtstag, false))}
                {fakt(g.besuche, echteBesuche.length)}
                {letzter && fakt(g.letzterBesuch, datumLang(letzter))}
                {fakt(g.kundeSeit, datumLang(gast.erstelltAm))}
              </dl>
            </section>

            <section id="aufenthalte" className="scroll-mt-6 rounded-xl border border-linie bg-papier p-5">
              <h2 className="text-lg font-semibold">{g.aufenthalte}</h2>
              {aufenthalte.length === 0 ? (
                <p className="mt-1 text-stift">{g.aufenthalteLeer}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {aufenthalte.map((a) => (
                    <li key={a.id} className={`flex items-start justify-between gap-2 rounded-lg px-3 py-2 ${a === imHaus ? "bg-tafel-hell" : "bg-kreide"}`}>
                      <span className="ziffern">
                        <span className="block font-semibold">
                          {g.zimmer} {a.zimmer || "–"}
                        </span>
                        <span className="block text-sm">
                          {datumLang(a.anreise, false)} bis {datumLang(a.abreise)}
                        </span>
                        {a === imHaus && <span className="block text-sm font-semibold text-tafel-tief">{g.jetztImHaus}</span>}
                      </span>
                      {ich.darfReservieren && (
                        <form action={aufenthaltEntfernen}>
                          <input type="hidden" name="gastId" value={gast.id} />
                          <input type="hidden" name="id" value={a.id} />
                          <button className={`${knopfLoeschKlasse} px-2 py-1 text-sm`} aria-label={`${g.zimmer} ${a.zimmer} ${t.allgemein.entfernen}`}>
                            {t.allgemein.entfernen}
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {ich.darfReservieren && (
                <details className="mt-4">
                  <summary className="cursor-pointer font-medium text-tafel underline underline-offset-4">{g.aufenthaltNeu}</summary>
                  <form action={aufenthaltAnlegen} className="mt-3 space-y-3">
                    <input type="hidden" name="gastId" value={gast.id} />
                    <label className="block text-sm font-medium">
                      {g.zimmer}
                      <input name="zimmer" maxLength={20} className={`${feldKlasse} ziffern`} />
                    </label>
                    <label className="block text-sm font-medium">
                      {g.anreise}
                      <input type="date" name="anreise" required defaultValue={heute} className={`${feldKlasse} ziffern`} />
                    </label>
                    <label className="block text-sm font-medium">
                      {g.abreise}
                      <input type="date" name="abreise" required className={`${feldKlasse} ziffern`} />
                    </label>
                    <button className={`${knopfZweitKlasse} w-full`}>{t.allgemein.speichern}</button>
                  </form>
                </details>
              )}
            </section>
          </aside>
        </div>
      </Seite>
    </>
  );
}
