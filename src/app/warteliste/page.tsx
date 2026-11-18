import Link from "next/link";
import { connection } from "next/server";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { wartelisteAnbieten, wartelisteEintragen, wartelisteEntfernen, wartelisteHinzufuegen } from "@/app/warteliste/aktionen";
import {
  datumGueltig, datumImRestaurant, datumPlus, ladeEinstellungen, ladeOeffnungszeiten, ladeWarteliste, oeffnungsSlots,
  type WartelisteEintrag, type WartelisteStatus,
} from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { texte } from "@/texte";

const statusFarbe: Record<WartelisteStatus, string> = {
  wartet: "bg-tafel-hell text-tafel-tief",
  angeboten: "bg-senf text-tinte",
  gebucht: "bg-tafel text-white",
  abgelehnt: "bg-kreide text-stift",
  abgelaufen: "bg-kreide text-stift",
  entfernt: "bg-kreide text-stift",
};

const meldungen = { hinzugefuegt: "hinzugefuegt", angeboten: "angeboten", eingetragen: "eingetragen", entfernt: "entfernt", nichts: "nichtsAnzubieten" } as const;

export default async function Warteliste({ searchParams }: PageProps<"/warteliste">) {
  const t = texte();
  const w = t.wartelisteSeite;
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  await connection();

  const einstellungen = await ladeEinstellungen(ich.restaurantId);
  const heute = datumImRestaurant(einstellungen.zeitzone);
  const datum = datumGueltig(parameter.datum) ? parameter.datum : heute;
  const [eintraege, zeiten] = await Promise.all([ladeWarteliste(ich.restaurantId, datum), ladeOeffnungszeiten(ich.restaurantId)]);
  const slots = oeffnungsSlots(zeiten, datum);
  const vorbelegung = (feld: string) => (typeof parameter[feld] === "string" ? (parameter[feld] as string).slice(0, 80) : "");
  const vonVor = slots.includes(vorbelegung("von")) ? vorbelegung("von") : slots.includes("18:00") ? "18:00" : slots[0];
  const bisVor = slots[Math.min(slots.indexOf(vonVor) + 8, slots.length - 1)];
  const datumText = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${datum}T12:00:00Z`),
  );
  const fehler = fehlerText(parameter.fehler);
  const ok = typeof parameter.ok === "string" && parameter.ok in meldungen ? w[meldungen[parameter.ok as keyof typeof meldungen]] : null;
  const wartend = eintraege.filter((e) => e.status === "wartet" || e.status === "angeboten").length;

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/">{t.allgemein.zurueck}</Zurueck>
        <p className="text-stift">{w.titel}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{datumText}</h1>

        <nav className="mb-5 mt-4 flex flex-wrap gap-2" aria-label={t.reservierungen.datumWaehlen}>
          <Link href={`/warteliste?datum=${datumPlus(datum, -1)}`} className={`${knopfZweitKlasse} px-4 py-2.5`}>
            {t.reservierungen.vortag}
          </Link>
          <Link href="/warteliste" className={`${knopfZweitKlasse} px-4 py-2.5 ${datum === heute ? "border-tafel bg-tafel-hell" : ""}`}>
            {t.reservierungen.heute}
          </Link>
          <Link href={`/warteliste?datum=${datumPlus(datum, 1)}`} className={`${knopfZweitKlasse} px-4 py-2.5`}>
            {t.reservierungen.folgetag}
          </Link>
        </nav>

        <p className="mb-6 flex flex-wrap items-baseline gap-x-2 rounded-lg bg-papier px-4 py-3 text-stift">
          <span>{einstellungen.wartelisteModus === "automatisch" ? w.modusAutomatisch : w.modusManuell}</span>
          {istLeitung(ich.rolle) && (
            <Link href="/einstellungen/warteliste" className="font-medium text-tafel underline underline-offset-4">
              {w.modusAendern}
            </Link>
          )}
        </p>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {ok && <Meldung art="ok">{ok}</Meldung>}

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <section>
            {eintraege.length === 0 ? (
              <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-10 text-center text-stift">{w.leer}</p>
            ) : (
              <ol className="space-y-3">
                {eintraege.map((e) => (
                  <Eintrag key={e.id} e={e} datum={datum} darfAendern={ich.darfReservieren} position={wartend > 1 ? eintraege.filter((x) => x.status === "wartet" || x.status === "angeboten").indexOf(e) + 1 : 0} />
                ))}
              </ol>
            )}
          </section>

          {ich.darfReservieren && (
            <section className={`${karteKlasse} h-fit`}>
              <h2 className="mb-4 text-xl font-semibold">{w.neu}</h2>
              <form action={wartelisteHinzufuegen} className="space-y-4">
                <input type="hidden" name="datum" value={datum} />
                <label className="block font-medium">
                  {w.name}
                  <input name="name" required maxLength={80} defaultValue={vorbelegung("name")} autoComplete="off" className={feldKlasse} />
                </label>
                <label className="block font-medium">
                  {w.telefon}
                  <input name="telefon" type="tel" maxLength={40} defaultValue={vorbelegung("telefon")} autoComplete="off" className={`${feldKlasse} ziffern`} />
                  <span className="mt-1 block text-sm font-normal text-stift">{w.telefonHinweis}</span>
                </label>
                <label className="block font-medium">
                  {w.personen}
                  <input name="personen" type="number" required min={1} max={500} defaultValue={vorbelegung("personen") || 2} inputMode="numeric" className={`${feldKlasse} ziffern`} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block font-medium">
                    {w.von}
                    <select name="von" defaultValue={vonVor} className={`${feldKlasse} ziffern`}>
                      {slots.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block font-medium">
                    {w.bis}
                    <select name="bis" defaultValue={bisVor} className={`${feldKlasse} ziffern`}>
                      {slots.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block font-medium">
                  {w.notiz} <span className="font-normal text-stift">({t.reservierungen.formular.optional})</span>
                  <input name="notiz" maxLength={300} className={feldKlasse} />
                </label>
                <button className={`${knopfKlasse} w-full`}>{w.hinzufuegen}</button>
              </form>
            </section>
          )}
        </div>
      </Seite>
    </>
  );
}

function Eintrag({ e, datum, darfAendern, position }: { e: WartelisteEintrag; datum: string; darfAendern: boolean; position: number }) {
  const w = texte().wartelisteSeite;
  const aktiv = e.status === "wartet" || e.status === "angeboten";
  const versteckt = (name: string, wert: string | null) => <input type="hidden" name={name} value={wert ?? ""} />;

  return (
    <li className={`rounded-xl border bg-papier p-4 sm:p-5 ${e.status === "angeboten" ? "border-senf" : "border-linie"} ${aktiv ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            {position > 0 && aktiv && (
              <span className="ziffern flex h-7 w-7 items-center justify-center rounded-full bg-kreide text-sm font-bold" aria-hidden="true">
                {position}
              </span>
            )}
            {e.gastId ? (
              <Link href={`/gaeste/${e.gastId}`} className="text-xl font-semibold underline decoration-linie decoration-2 underline-offset-4 hover:decoration-tafel">
                {e.gastName}
              </Link>
            ) : (
              <span className="text-xl font-semibold">{e.gastName}</span>
            )}
          </p>
          <p className="ziffern mt-0.5 text-stift">
            {e.personen} {w.pers}, {w.zeitfenster} {e.von} {w.und} {e.bis} {w.uhr}
            {e.telefon && (
              <>
                , <span className="whitespace-nowrap">{e.telefon}</span>
              </>
            )}
          </p>
          {e.notiz && <p className="mt-1">{e.notiz}</p>}
        </div>
        <span className={`rounded-md px-2.5 py-1 text-sm font-semibold ${statusFarbe[e.status]}`}>{w.status[e.status]}</span>
      </div>

      {e.status === "wartet" && (
        <div className="mt-4 border-t border-linie pt-4">
          {e.freieZeit ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="ziffern mr-2 text-lg">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-senf" aria-hidden="true" />
                {w.freiUm} <span className="font-bold">{e.freieZeit}</span> {w.uhr}
              </p>
              {darfAendern && (
                <>
                  <form action={wartelisteEintragen}>
                    {versteckt("id", e.id)}
                    {versteckt("datum", datum)}
                    {versteckt("uhrzeit", e.freieZeit)}
                    {versteckt("durchgang", e.freierDurchgang)}
                    <button className={`${knopfKlasse} px-4 py-2.5`}>{w.eintragenUm.replace("{zeit}", e.freieZeit)}</button>
                  </form>
                  {e.telefon && (
                    <form action={wartelisteAnbieten}>
                      {versteckt("id", e.id)}
                      {versteckt("datum", datum)}
                      <button className={`${knopfZweitKlasse} px-4 py-2.5`}>{w.anbieten}</button>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="text-stift">{w.nichtsFrei}</p>
          )}
        </div>
      )}

      {e.status === "angeboten" && e.angebotUhrzeit && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-linie pt-4">
          <p className="ziffern mr-2">{w.angebotLaeuft.replace("{zeit}", e.angebotUhrzeit).replace("{bis}", e.angebotBis ?? "")}</p>
          {darfAendern && (
            <form action={wartelisteEintragen}>
              {versteckt("id", e.id)}
              {versteckt("datum", datum)}
              {versteckt("uhrzeit", e.angebotUhrzeit)}
              <button className={`${knopfZweitKlasse} px-4 py-2`}>{w.trotzdemEintragen}</button>
            </form>
          )}
        </div>
      )}

      {e.status === "gebucht" && (
        <p className="mt-3">
          <Link href={`/reservierungen?datum=${datum}`} className="font-medium text-tafel underline underline-offset-4">
            {w.zurReservierung}
          </Link>
        </p>
      )}

      {aktiv && darfAendern && (
        <form action={wartelisteEntfernen} className="mt-3">
          {versteckt("id", e.id)}
          {versteckt("datum", datum)}
          <button className="rounded font-medium text-warnrot underline underline-offset-2 hover:text-warnrot/80">{w.entfernen}</button>
        </form>
      )}
    </li>
  );
}
