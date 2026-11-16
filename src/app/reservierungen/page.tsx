import Link from "next/link";
import { connection } from "next/server";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, knopfKlasse, knopfLoeschKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { statusSetzen } from "@/app/reservierungen/aktionen";
import { Tischplan } from "@/app/reservierungen/tischplan";
import { jetztImRestaurant } from "@/app/tagesleiste";
import {
  datumGueltig, datumImRestaurant, datumPlus, istAktiv, ladeEinstellungen, ladeOeffnungszeiten,
  ladeReservierungen, ladeTische, wochentagVon, type Reservierung, type ReservierungStatus,
} from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

const statusFarbe: Record<ReservierungStatus, string> = {
  bestaetigt: "bg-tafel-hell text-tafel-tief",
  angekommen: "bg-senf text-tinte",
  abgeschlossen: "bg-kreide text-stift",
  storniert: "bg-warnrot-hell text-warnrot",
  nicht_erschienen: "bg-warnrot-hell text-warnrot",
};

export default async function Reservierungen({ searchParams }: PageProps<"/reservierungen">) {
  const t = texte();
  const r = t.reservierungen;
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  await connection();

  const einstellungen = await ladeEinstellungen(ich.restaurantId);
  const heute = datumImRestaurant(einstellungen.zeitzone);
  const datum = datumGueltig(parameter.datum) ? parameter.datum : heute;
  const [reservierungen, tische, zeiten] = await Promise.all([
    ladeReservierungen(ich.restaurantId, datum),
    ladeTische(ich.restaurantId),
    ladeOeffnungszeiten(ich.restaurantId),
  ]);

  const aktive = reservierungen.filter(istAktiv);
  const gaeste = aktive.reduce((summe, x) => summe + x.personen, 0);
  const datumText = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${datum}T12:00:00Z`),
  );
  const mitTischen = einstellungen.vergabeModus === "tische";
  const fehler = fehlerText(parameter.fehler);

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/">{t.allgemein.zurueck}</Zurueck>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-stift">{r.titel}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{datumText}</h1>
            <p className="ziffern mt-1 text-lg text-stift">
              {aktive.length} {r.summeReservierungen}, {gaeste} {r.summeGaeste}
            </p>
          </div>
          {ich.darfReservieren && (
            <Link href={`/reservierungen/neu?datum=${datum}`} className={`${knopfKlasse} px-6 py-3.5 text-lg`}>
              {r.neu}
            </Link>
          )}
        </div>

        <nav className="mb-6 mt-5 flex flex-wrap items-end gap-2" aria-label={r.datumWaehlen}>
          <Link href={`/reservierungen?datum=${datumPlus(datum, -1)}`} className={`${knopfZweitKlasse} px-4 py-2.5`}>
            {r.vortag}
          </Link>
          <Link href="/reservierungen" className={`${knopfZweitKlasse} px-4 py-2.5 ${datum === heute ? "border-tafel bg-tafel-hell" : ""}`}>
            {r.heute}
          </Link>
          <Link href={`/reservierungen?datum=${datumPlus(datum, 1)}`} className={`${knopfZweitKlasse} px-4 py-2.5`}>
            {r.folgetag}
          </Link>
          <form className="ml-auto flex items-end gap-2">
            <label className="text-sm text-stift">
              {r.datumWaehlen}
              <input type="date" name="datum" defaultValue={datum} required className={`${feldKlasse} ziffern mt-0.5 py-2`} />
            </label>
            <button className={`${knopfZweitKlasse} px-4 py-2.5`}>{r.anzeigen}</button>
          </form>
        </nav>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "neu" && <Meldung art="ok">{r.gespeichert}</Meldung>}
        {parameter.ok === "1" && <Meldung art="ok">{r.geaendert}</Meldung>}
        {!ich.darfReservieren && <p className="mb-5 text-stift">{r.nurLesen}</p>}

        {/* Am Handy steht die Liste zuerst, am PC der Tischplan. */}
        <div className="flex flex-col">
        {mitTischen && tische.length > 0 && (
          <section className="order-2 mt-8 sm:order-1 sm:mb-8 sm:mt-0">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">{r.tischplan}</h2>
              <p className="text-sm text-stift">{r.tischplanHinweis}</p>
            </div>
            <Tischplan
              tische={tische}
              reservierungen={reservierungen}
              zeiten={zeiten}
              wochentag={wochentagVon(datum)}
              jetztMinuten={datum === heute ? jetztImRestaurant(einstellungen.zeitzone).minuten : null}
            />
          </section>
        )}

          <section className="order-1 sm:order-2">
        <h2 className="mb-2 text-xl font-semibold">{r.liste}</h2>
        {reservierungen.length === 0 ? (
          <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-10 text-center text-stift">{r.keine}</p>
        ) : (
          <ul className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
            {reservierungen.map((x) => (
              <Zeile key={x.id} x={x} datum={datum} darfAendern={ich.darfReservieren} mitTischen={mitTischen} />
            ))}
          </ul>
        )}
          </section>
        </div>
      </Seite>
    </>
  );
}

function Zeile({ x, datum, darfAendern, mitTischen }: { x: Reservierung; datum: string; darfAendern: boolean; mitTischen: boolean }) {
  const r = texte().reservierungen;
  const vorbei = !istAktiv(x);
  const knopf = (status: string, text: string, klasse: string) => (
    <form action={statusSetzen}>
      <input type="hidden" name="id" value={x.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="datum" value={datum} />
      <button className={klasse}>{text}</button>
    </form>
  );

  return (
    <li className={`grid gap-x-5 gap-y-2 px-4 py-4 sm:grid-cols-[5.5rem_1fr_auto] sm:px-5 ${vorbei ? "bg-kreide/60" : ""}`}>
      <p className={`ziffern text-2xl font-bold leading-tight ${vorbei ? "text-stift" : ""}`}>
        {x.von}
        <span className="block text-sm font-normal text-stift">bis {x.bis}</span>
      </p>

      <div className="min-w-0">
        <p className={`text-xl font-semibold ${x.status === "storniert" || x.status === "nicht_erschienen" ? "text-stift line-through" : ""}`}>
          {x.gastName}
        </p>
        <p className="ziffern text-stift">
          {x.personen} {r.personen}
          {mitTischen && `, ${x.tischName ?? r.ohneTisch}`}
          {x.telefon && (
            <>
              , <span className="whitespace-nowrap">{x.telefon}</span>
            </>
          )}
          {x.quelle !== "personal" && `, ${r.quelle[x.quelle]}`}
        </p>
        {(x.anlass || x.notiz) && (
          <p className="mt-1">
            {x.anlass && <span className="mr-2 rounded-md bg-senf-hell px-2 py-0.5 font-medium text-senf-tief">{x.anlass}</span>}
            {x.notiz}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className={`rounded-md px-2.5 py-1 text-sm font-semibold ${statusFarbe[x.status]}`}>{r.status[x.status]}</span>
        {darfAendern && x.status === "bestaetigt" && (
          <>
            {knopf("angekommen", r.angekommen, `${knopfKlasse} px-4 py-2`)}
            {knopf("storniert", r.stornieren, knopfLoeschKlasse)}
            {knopf("nicht_erschienen", r.nichtErschienen, knopfLoeschKlasse)}
          </>
        )}
        {darfAendern && x.status === "angekommen" &&
          knopf("abgeschlossen", mitTischen ? r.tischFrei : r.plaetzeFrei, `${knopfZweitKlasse} px-4 py-2`)}
      </div>
    </li>
  );
}
