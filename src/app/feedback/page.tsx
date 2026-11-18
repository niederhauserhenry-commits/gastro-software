import { connection } from "next/server";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { feedbackSenden } from "@/app/feedback/aktionen";
import { ArtMarke, StatusMarke } from "@/app/feedback/marken";
import { ladeEinstellungen, ladeFeedback } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function FeedbackSeite({ searchParams }: PageProps<"/feedback">) {
  const t = texte();
  const f = t.feedback;
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  await connection();
  const [eintraege, einstellungen] = await Promise.all([ladeFeedback(ich.restaurantId), ladeEinstellungen(ich.restaurantId)]);
  const datum = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: einstellungen.zeitzone });
  const fehler = fehlerText(parameter.fehler);
  const leitung = istLeitung(ich.rolle);

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/">{t.allgemein.zurueck}</Zurueck>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{f.titel}</h1>
        <p className="mb-6 mt-2 max-w-2xl text-stift">{f.hinweis}</p>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "1" && <Meldung art="ok">{f.gesendet}</Meldung>}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <form action={feedbackSenden} className={`${karteKlasse} space-y-5`}>
            <fieldset>
              <legend className="mb-2 font-semibold">{f.artTitel}</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["wunsch", "problem", "lob"] as const).map((art) => (
                  <label
                    key={art}
                    className="flex cursor-pointer flex-col rounded-lg border border-linie bg-papier px-3 py-2.5 has-[:checked]:border-tafel has-[:checked]:bg-tafel-hell has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-senf"
                  >
                    <input type="radio" name="art" value={art} defaultChecked={art === "wunsch"} className="sr-only" />
                    <span className="font-semibold">{f.art[art]}</span>
                    <span className="text-sm leading-snug text-stift">{f.artText[art]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block font-semibold">
              {f.text}
              <textarea name="text" required minLength={3} maxLength={2000} rows={6} className={`${feldKlasse} font-normal`} />
              <span className="mt-1 block text-sm font-normal text-stift">{f.textHinweis}</span>
            </label>
            <button className={`${knopfKlasse} w-full`}>{f.senden}</button>
          </form>

          <section>
            <h2 className="mb-3 text-xl font-semibold">{leitung ? f.listeLeitung : f.listeEigen}</h2>
            {eintraege.length === 0 ? (
              <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-10 text-center text-stift">{f.leer}</p>
            ) : (
              <ul className="space-y-3">
                {eintraege.map((e) => (
                  <li key={e.id} className="rounded-xl border border-linie bg-papier p-4 sm:p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <ArtMarke art={e.art} />
                      <span className="text-stift">
                        {datum.format(new Date(e.erstelltAm))}, {e.wer}
                      </span>
                      <span className="ml-auto">
                        <StatusMarke status={e.status} />
                      </span>
                    </div>
                    <p className="whitespace-pre-line">{e.text}</p>
                    {e.antwort && (
                      <div className="mt-3 rounded-lg border-l-4 border-tafel bg-tafel-hell px-4 py-3">
                        <p className="text-sm font-semibold text-tafel-tief">{f.antwort}</p>
                        <p className="whitespace-pre-line">{e.antwort}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Seite>
    </>
  );
}
