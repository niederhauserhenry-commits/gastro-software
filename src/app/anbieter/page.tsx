import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, karteKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { berichtErstellen, feedbackBeantworten } from "@/app/anbieter/aktionen";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ArtMarke, StatusMarke } from "@/app/feedback/marken";
import { istPlattformAdmin, kiBereit, ladeFeedbackUebersicht, ladeWochenberichte, type Wochenbericht } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

const zeit = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const tag = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "Europe/Berlin" });

function Bericht({ b }: { b: Wochenbericht }) {
  const a = texte().anbieter;
  const s = b.statistik;
  return (
    <div>
      <p className="text-sm text-stift">
        {a.zeitraum}: {tag.format(new Date(b.von))} bis {tag.format(new Date(b.bis))}
      </p>
      <p className="mt-1 font-semibold">
        {a.zahlen
          .replace("{anzahl}", String(b.anzahl))
          .replace("{betriebe}", String(s.betriebe ?? 0))
          .replace("{wunsch}", String(s.wunsch ?? 0))
          .replace("{problem}", String(s.problem ?? 0))
          .replace("{lob}", String(s.lob ?? 0))}
      </p>
      {a.berichtStatus[b.status] && (
        <p className={`mt-2 text-sm font-medium ${b.status === "fehler" ? "text-warnrot" : "text-stift"}`}>{a.berichtStatus[b.status]}</p>
      )}
      {b.text && <div className="mt-3 max-w-3xl whitespace-pre-line leading-relaxed">{b.text}</div>}
    </div>
  );
}

export default async function Anbieter({ searchParams }: PageProps<"/anbieter">) {
  const t = texte();
  const a = t.anbieter;
  const ich = await aktuelleMitgliedschaft();
  if (!(await istPlattformAdmin())) redirect("/");
  const parameter = await searchParams;
  await connection();
  const alle = parameter.alle === "1";
  const [eintraege, berichte, ki] = await Promise.all([ladeFeedbackUebersicht(90), ladeWochenberichte(), kiBereit()]);
  const sichtbar = alle ? eintraege : eintraege.filter((e) => e.status === "neu" || e.status === "gelesen");
  const offen = eintraege.filter((e) => e.status === "neu" || e.status === "gelesen").length;
  const fehler = fehlerText(parameter.fehler);
  const [neuester, ...aeltere] = berichte;

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen">{t.einstellungen.zurueck}</Zurueck>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{a.titel}</h1>
        <p className="mb-6 mt-2 max-w-2xl text-stift">{a.hinweis}</p>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "gespeichert" && <Meldung art="ok">{a.gespeichert}</Meldung>}
        {parameter.ok === "bericht" && <Meldung art="ok">{a.berichtErstellt}</Meldung>}

        <section id="berichte" className={`${karteKlasse} mb-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-xl font-semibold">{a.berichteTitel}</h2>
              <p className="mt-1 text-stift">{a.berichteText}</p>
            </div>
            <form action={berichtErstellen}>
              <button className={knopfZweitKlasse}>{a.jetzt}</button>
            </form>
          </div>
          <p className={`mt-4 rounded-lg px-4 py-3 text-sm ${ki ? "bg-tafel-hell text-tafel-tief" : "bg-senf/20 text-tinte"}`}>{ki ? a.kiBereit : a.kiFehlt}</p>
          <div className="mt-5 border-t border-linie pt-5">{neuester ? <Bericht b={neuester} /> : <p className="text-stift">{a.keineBerichte}</p>}</div>
          {aeltere.length > 0 && (
            <details className="mt-5 border-t border-linie pt-4">
              <summary className="cursor-pointer font-semibold">{a.aeltere}</summary>
              <div className="mt-4 space-y-6">
                {aeltere.map((b) => (
                  <Bericht key={b.id} b={b} />
                ))}
              </div>
            </details>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-xl font-semibold">{a.feedbackTitel}</h2>
            <nav className="flex gap-2">
              <Link href="/anbieter" className={`${knopfZweitKlasse} px-4 py-2 ${!alle ? "border-tafel bg-tafel-hell" : ""}`}>
                {a.offen} ({offen})
              </Link>
              <Link href="/anbieter?alle=1" className={`${knopfZweitKlasse} px-4 py-2 ${alle ? "border-tafel bg-tafel-hell" : ""}`}>
                {a.alle}
              </Link>
            </nav>
          </div>
          {sichtbar.length === 0 ? (
            <p className="rounded-xl border border-dashed border-linie bg-papier px-5 py-10 text-center text-stift">{a.keineOffen}</p>
          ) : (
            <ul className="space-y-4">
              {sichtbar.map((e) => (
                <li key={e.id} id={`f-${e.id}`} className="scroll-mt-6 rounded-xl border border-linie bg-papier p-4 sm:p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <ArtMarke art={e.art} />
                    <span className="font-semibold">{e.restaurant}</span>
                    <span className="text-stift">
                      {e.wer}, {zeit.format(new Date(e.erstelltAm))}
                    </span>
                    <span className="ml-auto">
                      <StatusMarke status={e.status} />
                    </span>
                  </div>
                  <p className="mb-4 max-w-3xl whitespace-pre-line">{e.text}</p>
                  <form action={feedbackBeantworten} className="grid gap-3 border-t border-linie pt-4 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
                    <input type="hidden" name="id" value={e.id} />
                    <label className="block text-sm font-medium">
                      {a.statusFeld}
                      <select name="status" defaultValue={e.status === "neu" ? "gelesen" : e.status} className={feldKlasse}>
                        {(["neu", "gelesen", "geplant", "erledigt", "abgelehnt"] as const).map((s) => (
                          <option key={s} value={s}>
                            {t.feedback.status[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {a.antwortFeld}
                      <textarea name="antwort" rows={1} maxLength={2000} defaultValue={e.antwort} className={`${feldKlasse} field-sizing-content min-h-12`} />
                    </label>
                    <button className={knopfKlasse}>{a.speichern}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Seite>
    </>
  );
}
