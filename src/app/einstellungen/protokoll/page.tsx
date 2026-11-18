import Link from "next/link";
import { Kopfleiste, Seite, Zurueck } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ladeEinstellungen, ladeProtokoll } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { texte } from "@/texte";

// Statuswerte aus der Datenbank in normale Wörter übersetzen.
function lesbar(text: string) {
  return text
    .replaceAll(" -> ", " → ")
    .replaceAll("bestaetigt", "bestätigt")
    .replaceAll("nicht_erschienen", "nicht erschienen")
    .replaceAll("eingecheckt", "da");
}

export default async function Protokoll() {
  const t = texte();
  const p = t.protokoll;
  const ich = await leitungErforderlich();
  const [eintraege, einstellungen] = await Promise.all([ladeProtokoll(ich.restaurantId), ladeEinstellungen(ich.restaurantId)]);
  const zeit = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: einstellungen.zeitzone,
  });
  const aktionText = (a: string) => (p.aktion as Record<string, string>)[a] ?? a;
  const istGast = (a: string) => a === "gast_angelegt" || a === "gast_geaendert" || a === "auskunft";

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen/daten">{t.einstellungen.bereiche.daten.titel}</Zurueck>
        <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{p.titel}</h1>
        {eintraege.length === 0 ? (
          <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-10 text-center text-stift">{p.leer}</p>
        ) : (
          <ol className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
            {eintraege.map((e) => (
              <li key={e.id} className="grid gap-x-5 px-5 py-3 sm:grid-cols-[10rem_1fr]">
                <p className="ziffern text-sm text-stift">
                  {zeit.format(new Date(e.zeit))}
                  <span className="block font-medium text-tinte">{e.wer}</span>
                </p>
                <p>
                  <span className="font-semibold">{aktionText(e.aktion)}</span>
                  {e.details && <span className="ziffern text-stift">: {lesbar(e.details)}</span>}
                  {e.objektId && istGast(e.aktion) && (
                    <Link href={`/gaeste/${e.objektId}`} className="ml-2 text-sm font-medium text-tafel underline underline-offset-4">
                      {p.zurKarte}
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Seite>
    </>
  );
}
