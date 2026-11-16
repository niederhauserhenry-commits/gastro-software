import { Auswahl, feldKlasse } from "@/app/bausteine";
import { wartelisteSpeichern } from "@/app/einstellungen/aktionen";
import { EinrichtungsRahmen, SpeicherKnopf } from "@/app/einstellungen/rahmen";
import { ladeEinstellungen } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function Warteliste({ searchParams }: PageProps<"/einstellungen/warteliste">) {
  const t = texte();
  const ich = await leitungErforderlich();
  const einstellungen = await ladeEinstellungen(ich.restaurantId);

  return (
    <EinrichtungsRahmen ich={ich} schritt="warteliste" parameter={await searchParams}>
      <form action={wartelisteSpeichern}>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-xl font-semibold">{t.warteliste.titel}</legend>
          <Auswahl name="wartelisteModus" wert="manuell" gewaehlt={einstellungen.wartelisteModus === "manuell"} titel={t.warteliste.manuell} text={t.warteliste.manuellText} />
          <Auswahl name="wartelisteModus" wert="automatisch" gewaehlt={einstellungen.wartelisteModus === "automatisch"} titel={t.warteliste.automatisch} text={t.warteliste.automatischText} />
        </fieldset>

        <label className="mt-6 block max-w-xs font-medium">
          {t.warteliste.frist}
          <span className="flex items-center gap-3">
            <input type="number" name="wartelisteFristMinuten" min={5} max={120} required inputMode="numeric" defaultValue={einstellungen.wartelisteFristMinuten} className={`${feldKlasse} ziffern`} />
            <span className="mt-1.5 font-normal text-stift">{t.allgemein.minuten}</span>
          </span>
        </label>
        <p className="mt-1.5 text-sm text-stift">{t.warteliste.fristHinweis}</p>

        <h2 className="mb-3 mt-10 text-xl font-semibold">{t.warteliste.loeschTitel}</h2>
        <label className="block max-w-xs font-medium">
          {t.warteliste.loeschfrist}
          <span className="flex items-center gap-3">
            <input type="number" name="loeschfristMonate" min={1} max={120} required inputMode="numeric" defaultValue={einstellungen.loeschfristMonate} className={`${feldKlasse} ziffern`} />
            <span className="mt-1.5 font-normal text-stift">{t.warteliste.monate}</span>
          </span>
        </label>
        <p className="mt-1.5 text-sm text-stift">{t.warteliste.loeschHinweis}</p>

        <SpeicherKnopf ich={ich} text={ich.einrichtungAbgeschlossen ? undefined : t.warteliste.abschliessen} />
      </form>
    </EinrichtungsRahmen>
  );
}
