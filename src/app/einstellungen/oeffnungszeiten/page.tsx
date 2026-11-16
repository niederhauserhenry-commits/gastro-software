import { feldKlasse } from "@/app/bausteine";
import { oeffnungszeitenSpeichern } from "@/app/einstellungen/aktionen";
import { EinrichtungsRahmen, SpeicherKnopf } from "@/app/einstellungen/rahmen";
import { ladeOeffnungszeiten } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function Oeffnungszeiten({ searchParams }: PageProps<"/einstellungen/oeffnungszeiten">) {
  const t = texte();
  const ich = await leitungErforderlich();
  const zeiten = await ladeOeffnungszeiten(ich.restaurantId);

  return (
    <EinrichtungsRahmen ich={ich} schritt="oeffnungszeiten" parameter={await searchParams}>
      <p className="mb-6 max-w-2xl text-stift">{t.oeffnungszeiten.hinweis}</p>

      <form action={oeffnungszeitenSpeichern}>
        <div className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
          {t.wochentage.map((tagName, index) => {
            const tag = index + 1;
            const heute = zeiten.filter((z) => z.wochentag === tag);
            return (
              <div
                key={tag}
                role="group"
                aria-labelledby={`tag-${tag}`}
                className="grid gap-x-8 gap-y-3 px-4 py-4 sm:px-5 lg:grid-cols-[8rem_1fr_1fr] lg:items-end"
              >
                <p id={`tag-${tag}`} className="text-lg font-semibold lg:pb-3">
                  {tagName}
                </p>
                {[1, 2].map((slot) => {
                  const zeit = heute[slot - 1];
                  const titel = slot === 1 ? t.oeffnungszeiten.zeit1 : t.oeffnungszeiten.zeit2;
                  return (
                    <div key={slot} className="grid grid-cols-2 gap-3">
                      <label className="min-w-0 text-sm text-stift">
                        <span className="sr-only">{titel}: </span>
                        {t.oeffnungszeiten.von}
                        <input type="time" name={`von_${tag}_${slot}`} defaultValue={zeit?.von ?? ""} className={`${feldKlasse} ziffern`} />
                      </label>
                      <label className="min-w-0 text-sm text-stift">
                        <span className="sr-only">{titel}: </span>
                        {t.oeffnungszeiten.bis}
                        <input type="time" name={`bis_${tag}_${slot}`} defaultValue={zeit?.bis ?? ""} className={`${feldKlasse} ziffern`} />
                      </label>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <SpeicherKnopf ich={ich} />
      </form>
    </EinrichtungsRahmen>
  );
}
