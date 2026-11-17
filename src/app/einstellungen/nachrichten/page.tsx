import { Auswahl, Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse } from "@/app/bausteine";
import { nachrichtenSpeichern } from "@/app/einstellungen/aktionen";
import { VorlagenFeld } from "@/app/einstellungen/nachrichten/vorlage";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ladeEinstellungen, ladeNachrichten, type NachrichtStatus } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

const stundenAuswahl = [2, 3, 6, 12, 24, 48];

const statusFarbe: Record<NachrichtStatus, string> = {
  wartet: "bg-tafel-hell text-tafel-tief",
  gesendet: "bg-tafel text-white",
  testmodus: "bg-senf-hell text-senf-tief",
  abgebrochen: "bg-kreide text-stift",
  fehler: "bg-warnrot-hell text-warnrot",
};

export default async function Nachrichten({ searchParams }: PageProps<"/einstellungen/nachrichten">) {
  const t = texte();
  const n = t.nachrichten;
  const ich = await leitungErforderlich();
  const parameter = await searchParams;
  const [einstellungen, protokoll] = await Promise.all([
    ladeEinstellungen(ich.restaurantId),
    ladeNachrichten(ich.restaurantId),
  ]);
  const fehler = fehlerText(parameter.fehler);
  const zeit = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: einstellungen.zeitzone,
  });
  const stunden = stundenAuswahl.includes(einstellungen.erinnerungStunden)
    ? stundenAuswahl
    : [...stundenAuswahl, einstellungen.erinnerungStunden].sort((a, b) => a - b);

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen">{t.einstellungen.zurueck}</Zurueck>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.einstellungen.bereiche.nachrichten.titel}</h1>
        <p className="mb-6 mt-2 max-w-2xl text-stift">{n.hinweis}</p>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "1" && <Meldung art="ok">{t.allgemein.gespeichert}</Meldung>}

        <form action={nachrichtenSpeichern} className="space-y-8">
          <fieldset className="space-y-3">
            <legend className="mb-3 text-xl font-semibold">{n.modusTitel}</legend>
            <Auswahl name="nachrichtenModus" wert="test" gewaehlt={einstellungen.nachrichtenModus === "test"} titel={n.test} text={n.testText} />
            <Auswahl name="nachrichtenModus" wert="aus" gewaehlt={einstellungen.nachrichtenModus === "aus"} titel={n.aus} text={n.ausText} />
            <p className="text-sm text-stift">{n.echtHinweis}</p>
          </fieldset>

          <label className="block max-w-xs font-medium">
            {n.erinnerung}
            <select name="erinnerungStunden" defaultValue={einstellungen.erinnerungStunden} className={`${feldKlasse} ziffern`}>
              {stunden.map((h) => (
                <option key={h} value={h}>
                  {h} {n.stundenVorher}
                </option>
              ))}
            </select>
          </label>

          <section className={`${karteKlasse} space-y-6`}>
            <div>
              <h2 className="text-xl font-semibold">{n.vorlagen}</h2>
              <p className="mt-1 text-stift">
                {n.vorlagenHinweis} <span className="ziffern font-medium text-tinte">{n.platzhalter}</span>
              </p>
            </div>
            <VorlagenFeld name="vorlageBestaetigung" titel={n.bestaetigung} startwert={einstellungen.vorlageBestaetigung} restaurant={ich.restaurantName} />
            <VorlagenFeld name="vorlageErinnerung" titel={n.erinnerungText} startwert={einstellungen.vorlageErinnerung} restaurant={ich.restaurantName} />
          </section>

          <button className={`${knopfKlasse} px-6 py-3.5 text-lg`}>{t.allgemein.speichern}</button>
        </form>

        <section className="mt-12">
          <h2 className="mb-2 text-xl font-semibold">{n.protokoll}</h2>
          {protokoll.length === 0 ? (
            <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-8 text-center text-stift">{n.protokollLeer}</p>
          ) : (
            <ul className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
              {protokoll.map((x) => (
                <li key={x.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">
                      {n.art[x.art]} {n.an} {x.gastName}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${statusFarbe[x.status]}`}>{n.status[x.status]}</span>
                    <span className="ziffern text-sm text-stift">
                      {x.an}, {zeit.format(new Date(x.sendenAb))} {t.startseite.uhr}
                    </span>
                  </div>
                  <p className={`mt-1.5 max-w-3xl ${x.status === "abgebrochen" ? "text-stift line-through" : ""}`}>{x.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Seite>
    </>
  );
}
