import { Auswahl, feldKlasse, karteKlasse, knopfLoeschKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { dauerSpeichern, durchgangAnlegen, durchgangEntfernen } from "@/app/einstellungen/aktionen";
import { EinrichtungsRahmen, SpeicherKnopf } from "@/app/einstellungen/rahmen";
import { ladeDurchgaenge, ladeEinstellungen } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

// 1:00 bis 4:00 Stunden in Viertelstunden.
const dauerAuswahl = Array.from({ length: 13 }, (_, i) => 60 + i * 15);

function dauerText(minuten: number, stunden: string) {
  const h = Math.floor(minuten / 60);
  const m = String(minuten % 60).padStart(2, "0");
  return `${h}:${m} ${stunden}`;
}

export default async function Tischdauer({ searchParams }: PageProps<"/einstellungen/tischdauer">) {
  const t = texte();
  const ich = await leitungErforderlich();
  const [einstellungen, durchgaenge] = await Promise.all([
    ladeEinstellungen(ich.restaurantId),
    ladeDurchgaenge(ich.restaurantId),
  ]);
  const auswahl = dauerAuswahl.includes(einstellungen.standardDauerMinuten)
    ? dauerAuswahl
    : [...dauerAuswahl, einstellungen.standardDauerMinuten].sort((a, b) => a - b);

  return (
    <EinrichtungsRahmen ich={ich} schritt="tischdauer" parameter={await searchParams}>
      <form action={dauerSpeichern}>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-xl font-semibold">{t.tischdauer.titel}</legend>
          <Auswahl name="dauerModus" wert="fest" gewaehlt={einstellungen.dauerModus === "fest"} titel={t.tischdauer.fest} text={t.tischdauer.festText} />
          <Auswahl name="dauerModus" wert="offen" gewaehlt={einstellungen.dauerModus === "offen"} titel={t.tischdauer.offen} text={t.tischdauer.offenText} />
          <Auswahl name="dauerModus" wert="durchgaenge" gewaehlt={einstellungen.dauerModus === "durchgaenge"} titel={t.tischdauer.durchgaenge} text={t.tischdauer.durchgaengeText} />
        </fieldset>

        <label className="mt-6 block max-w-xs font-medium">
          {t.tischdauer.dauer}
          <select name="standardDauerMinuten" defaultValue={einstellungen.standardDauerMinuten} className={`${feldKlasse} ziffern`}>
            {auswahl.map((minuten) => (
              <option key={minuten} value={minuten}>
                {dauerText(minuten, t.tischdauer.stunden)}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1.5 max-w-xl text-sm text-stift">{t.tischdauer.dauerHinweis}</p>

        <SpeicherKnopf ich={ich} />
      </form>

      {einstellungen.dauerModus === "durchgaenge" && (
        <section className={`${karteKlasse} mt-10`}>
          <h2 className="mb-3 text-xl font-semibold">{t.tischdauer.durchgaengeTitel}</h2>
          {durchgaenge.length === 0 ? (
            <p className="mb-5 text-stift">{t.tischdauer.keineDurchgaenge}</p>
          ) : (
            <ul className="mb-6 divide-y divide-linie border-y border-linie">
              {durchgaenge.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="ziffern text-lg font-semibold">
                      {d.von} – {d.bis}
                    </span>
                    <span className="ml-3 text-stift">
                      {[d.name, d.wochentag ? t.wochentage[d.wochentag - 1] : t.tischdauer.jedenTag].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <form action={durchgangEntfernen}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className={knopfLoeschKlasse}>{t.allgemein.entfernen}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={durchgangAnlegen} className="grid gap-4 sm:grid-cols-4">
            <label className="block font-medium">
              {t.oeffnungszeiten.von}
              <input type="time" name="von" required className={`${feldKlasse} ziffern`} />
            </label>
            <label className="block font-medium">
              {t.oeffnungszeiten.bis}
              <input type="time" name="bis" required className={`${feldKlasse} ziffern`} />
            </label>
            <label className="block font-medium">
              {t.tischdauer.tag}
              <select name="wochentag" defaultValue="" className={feldKlasse}>
                <option value="">{t.tischdauer.jedenTag}</option>
                {t.wochentage.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-medium">
              {t.tischdauer.bezeichnung}
              <input name="name" maxLength={40} className={feldKlasse} />
            </label>
            <div className="sm:col-span-4">
              <button className={knopfZweitKlasse}>{t.tischdauer.neuerDurchgang}</button>
            </div>
          </form>
        </section>
      )}
    </EinrichtungsRahmen>
  );
}
