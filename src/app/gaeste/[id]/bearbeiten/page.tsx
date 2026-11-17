import { notFound, redirect } from "next/navigation";
import { Kopfleiste, Meldung, Seite, Zurueck, knopfLoeschKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { gastLoeschen } from "@/app/gaeste/aktionen";
import { GastFormular } from "@/app/gaeste/formular";
import { istUuid, ladeGast } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function GastBearbeiten({ params, searchParams }: PageProps<"/gaeste/[id]/bearbeiten">) {
  const t = texte();
  const g = t.gaeste;
  const { id } = await params;
  if (!istUuid(id)) notFound();
  const ich = await aktuelleMitgliedschaft();
  if (!ich.darfReservieren) redirect(`/gaeste/${id}`);
  const gast = await ladeGast(id);
  if (!gast) notFound();
  const fehler = fehlerText((await searchParams).fehler);

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href={`/gaeste/${gast.id}`}>{gast.name}</Zurueck>
        <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{g.bearbeiten}</h1>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <div className="rounded-xl border border-linie bg-papier p-5 sm:p-6">
          <GastFormular gast={gast} abbrechenZiel={`/gaeste/${gast.id}`} />
        </div>

        {istLeitung(ich.rolle) && (
          <section className="mt-10 rounded-xl border border-warnrot/30 bg-papier p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-warnrot">{g.loeschenTitel}</h2>
            <p className="mb-4 mt-1 max-w-2xl text-stift">{g.loeschenText}</p>
            <form action={gastLoeschen} className="space-y-4">
              <input type="hidden" name="id" value={gast.id} />
              <label className="flex items-start gap-3">
                <input type="checkbox" name="bestaetigt" required className="mt-1 h-5 w-5 accent-warnrot" />
                <span>{g.loeschenBestaetigen}</span>
              </label>
              <button className={`${knopfLoeschKlasse} border border-warnrot/40 px-4 py-2.5 no-underline`}>{g.loeschen}</button>
            </form>
          </section>
        )}
      </Seite>
    </>
  );
}
