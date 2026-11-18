import { headers } from "next/headers";
import { Auswahl, Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { telefonSchluesselErneuern, telefonSpeichern } from "@/app/einstellungen/telefon/aktionen";
import { KopierKasten } from "@/app/einstellungen/telefon/kopieren";
import { agentAnweisung, funktionen } from "@/app/einstellungen/telefon/vorlagen";
import { ladeTelefon } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function Telefon({ searchParams }: PageProps<"/einstellungen/telefon">) {
  const t = texte();
  const f = t.telefon;
  const ich = await leitungErforderlich();
  const parameter = await searchParams;
  const telefon = await ladeTelefon(ich.restaurantId);
  const host = (await headers()).get("host") ?? "gastro-software.vercel.app";
  const basis = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const adresse = telefon.schluessel ? `${basis}/api/telefon?k=${telefon.schluessel}` : null;
  const verbunden = Boolean(process.env.RETELL_API_KEY);
  const fehler = fehlerText(parameter.fehler);
  const ok = parameter.ok === "gespeichert" ? f.gespeichert : parameter.ok === "schluessel" ? f.schluesselNeu : null;
  const kopie = { knopf: f.kopieren, kopiert: f.kopiert };

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen">{t.einstellungen.zurueck}</Zurueck>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.einstellungen.bereiche.telefon.titel}</h1>
        <p className="mb-6 mt-2 max-w-2xl text-stift">{f.hinweis}</p>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {ok && <Meldung art="ok">{ok}</Meldung>}

        <div className="mb-6 flex flex-wrap gap-2 text-sm font-semibold">
          <span className={`rounded-full px-3 py-1 ${telefon.aktiv ? "bg-tafel text-white" : "bg-kreide text-stift"}`}>
            {telefon.aktiv ? f.statusAn : f.statusAus}
          </span>
          <span className={`rounded-full px-3 py-1 ${verbunden ? "bg-tafel-hell text-tafel-tief" : "bg-senf/25 text-tinte"}`}>
            {verbunden ? f.retellDa : f.retellFehlt}
          </span>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <form action={telefonSpeichern} className={`${karteKlasse} space-y-5`}>
            <h2 className="text-xl font-semibold">{f.einstellungenTitel}</h2>
            <fieldset className="grid gap-3">
              <Auswahl name="aktiv" wert="an" gewaehlt={telefon.aktiv} titel={f.an} text={f.anText} />
              <Auswahl name="aktiv" wert="aus" gewaehlt={!telefon.aktiv} titel={f.aus} text={f.ausText} />
            </fieldset>
            <label className="block font-semibold">
              {f.maxPersonen}
              <input type="number" name="max_personen" min={1} max={50} required defaultValue={telefon.maxPersonen} className={`${feldKlasse} max-w-32 font-normal`} />
              <span className="mt-1 block text-sm font-normal text-stift">{f.maxPersonenHinweis}</span>
            </label>
            <label className="block font-semibold">
              {f.hinweise}
              <textarea name="hinweise" rows={5} maxLength={1500} defaultValue={telefon.hinweise} className={`${feldKlasse} font-normal`} />
              <span className="mt-1 block text-sm font-normal text-stift">{f.hinweiseHinweis}</span>
            </label>
            <button className={knopfKlasse}>{t.allgemein.speichern}</button>
          </form>

          <section className={karteKlasse}>
            <h2 className="text-xl font-semibold">{f.anleitungTitel}</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              {f.schritte.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-stift">{f.kosten}</p>
          </section>
        </div>

        {!adresse && <p className="mt-6 text-stift">{f.ersteSpeicherung}</p>}
        {adresse && (
          <section className={`${karteKlasse} mt-6`}>
            <h2 className="text-xl font-semibold">{f.retellTitel}</h2>
            <p className="mt-1 max-w-3xl text-stift">{f.retellText}</p>
            <KopierKasten titel={f.adresse} inhalt={adresse} {...kopie} />
            <KopierKasten titel={f.anweisung} inhalt={agentAnweisung(ich.restaurantName)} {...kopie} />
            {Object.entries(funktionen).map(([name, fn]) => (
              <details key={name} className="mt-4 rounded-lg border border-linie px-4 py-3">
                <summary className="cursor-pointer font-semibold">
                  {f.funktion} {name}
                </summary>
                <KopierKasten titel={f.funktionName} inhalt={name} {...kopie} />
                <KopierKasten titel={f.funktionBeschreibung} inhalt={fn.beschreibung} {...kopie} />
                <KopierKasten titel={f.funktionParameter} inhalt={JSON.stringify(fn.parameter, null, 2)} {...kopie} />
              </details>
            ))}
            <form action={telefonSchluesselErneuern} className="mt-6 border-t border-linie pt-5">
              <p className="mb-3 max-w-3xl text-sm text-stift">{f.schluesselText}</p>
              <button className={knopfZweitKlasse}>{f.schluesselKnopf}</button>
            </form>
          </section>
        )}
      </Seite>
    </>
  );
}
