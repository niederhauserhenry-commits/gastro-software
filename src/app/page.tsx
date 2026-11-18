import Link from "next/link";
import { connection } from "next/server";
import { Kopfleiste, Seite } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { OfflineHinweis } from "@/app/offline";
import { Tagesleiste, jetztImRestaurant } from "@/app/tagesleiste";
import { datumImRestaurant, istAktiv, ladeEinstellungen, ladeOeffnungszeiten, ladeReservierungen } from "@/lib/daten";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { texte } from "@/texte";

// Startseite: höchstens fünf große Kacheln.
// "ziel" fehlt, solange das Modul noch nicht gebaut ist.
const kachelListe = [
  { schluessel: "reservierungen", modul: "reservierungen", ziel: "/reservierungen" },
  { schluessel: "gaeste", modul: "gaeste", ziel: "/gaeste" },
  { schluessel: "warteliste", modul: "warteliste", ziel: "/warteliste" },
  { schluessel: "feedback", modul: "feedback", ziel: "/feedback" },
  { schluessel: "einstellungen", modul: null, ziel: "/einstellungen" },
] as const;

export default async function Startseite() {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  const [einstellungen, zeiten] = await Promise.all([
    ladeEinstellungen(ich.restaurantId),
    ladeOeffnungszeiten(ich.restaurantId),
  ]);
  // Die Uhrzeit gilt für genau diesen Aufruf, die Seite wird nie vorab erzeugt.
  await connection();
  const jetzt = new Date();
  const heute = await ladeReservierungen(ich.restaurantId, datumImRestaurant(einstellungen.zeitzone, jetzt));
  const aktive = heute.filter(istAktiv);
  const gaeste = aktive.reduce((summe, x) => summe + x.personen, 0);
  const naechste = aktive.filter((x) => x.status === "bestaetigt").slice(0, 3);
  const ort = jetztImRestaurant(einstellungen.zeitzone, jetzt);
  const datum = new Intl.DateTimeFormat("de-DE", {
    timeZone: einstellungen.zeitzone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(jetzt);

  // Nur gebuchte Module erscheinen. Die Einstellungen gehören immer dazu.
  const sichtbar = kachelListe.filter((k) => k.modul === null || ich.module.includes(k.modul));

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <p className="text-stift">
          {t.startseite.begruessung}, {ich.anzeigename} ({t.rollen[ich.rolle]})
        </p>
        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl">{datum}</h1>

        <section className="mb-6 rounded-xl border border-linie bg-papier p-5 sm:p-6">
          <Tagesleiste zeiten={zeiten} wochentag={ort.wochentag} jetztMinuten={ort.minuten} hatZeiten={zeiten.length > 0} />

          <div className="mt-5 border-t border-linie pt-4">
            <p className="ziffern text-lg">
              <span className="font-semibold">{t.startseite.heuteReservierungen}:</span> {aktive.length}{" "}
              {t.reservierungen.summeReservierungen}, {gaeste} {t.reservierungen.summeGaeste}
            </p>
            {naechste.length > 0 && (
              <ul className="mt-2 space-y-1">
                {naechste.map((x) => (
                  <li key={x.id} className="flex gap-3">
                    <span className="ziffern w-12 shrink-0 font-semibold">{x.von}</span>
                    <span className="min-w-0 truncate">
                      {x.gastName}
                      <span className="ziffern text-stift">
                        , {x.personen} {t.reservierungen.personen}
                        {x.tischName ? `, ${x.tischName}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {istLeitung(ich.rolle) && !ich.einrichtungAbgeschlossen && (
          <Link
            href="/einstellungen/oeffnungszeiten"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-senf bg-senf-hell p-5 text-senf-tief hover:bg-senf/30"
          >
            <span className="text-lg">{t.startseite.einrichtungOffen}</span>
            <span className="rounded-lg bg-senf px-4 py-2 font-semibold text-tinte">{t.startseite.einrichtungFortsetzen}</span>
          </Link>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sichtbar.map((kachel) => {
            const text = t.kacheln[kachel.schluessel];
            const inhalt = (
              <>
                <span className="flex-1">
                  <span className="block text-2xl font-bold tracking-tight">{text.titel}</span>
                  <span className="block text-stift">{text.text}</span>
                </span>
                {kachel.ziel ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-6 w-6 shrink-0 text-tafel" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="shrink-0 rounded-md bg-kreide px-2.5 py-1 text-sm font-medium text-stift">
                    {t.startseite.baldVerfuegbar}
                  </span>
                )}
              </>
            );
            const klasse = "flex min-h-24 items-center gap-4 rounded-xl border border-linie bg-papier px-5 py-4";
            return (
              <li key={kachel.schluessel} className={kachel.schluessel === "einstellungen" ? "sm:col-span-2" : ""}>
                {kachel.ziel ? (
                  <Link href={kachel.ziel} className={`${klasse} hover:border-tafel`}>
                    {inhalt}
                  </Link>
                ) : (
                  <div className={`${klasse} opacity-75`}>{inhalt}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Seite>
      <OfflineHinweis stand={new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: einstellungen.zeitzone }).format(new Date())} />
    </>
  );
}
