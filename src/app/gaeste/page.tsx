import Link from "next/link";
import { Kopfleiste, Meldung, Seite, Zurueck, feldKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { GastMarken } from "@/app/gaeste/marken";
import { datumLang, ladeGaesteListe, type GastFilter } from "@/lib/daten";
import { fehlerText } from "@/lib/fehler";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

const filterListe: GastFilter[] = ["alle", "stammgaeste", "hausgaeste"];

export default async function Gaeste({ searchParams }: PageProps<"/gaeste">) {
  const t = texte();
  const g = t.gaeste;
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  const suche = typeof parameter.suche === "string" ? parameter.suche.slice(0, 80) : "";
  const filter = filterListe.includes(parameter.filter as GastFilter) ? (parameter.filter as GastFilter) : "alle";
  const gaeste = await ladeGaesteListe(ich.restaurantId, suche, filter);
  const fehler = fehlerText(parameter.fehler);

  const ziel = (f: GastFilter) => {
    const p = new URLSearchParams();
    if (f !== "alle") p.set("filter", f);
    if (suche) p.set("suche", suche);
    const q = p.toString();
    return q ? `/gaeste?${q}` : "/gaeste";
  };

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/">{t.allgemein.zurueck}</Zurueck>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{g.titel}</h1>
          {ich.darfReservieren && (
            <Link href="/gaeste/neu" className={`${knopfKlasse} px-6 py-3`}>
              {g.neu}
            </Link>
          )}
        </div>

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "geloescht" && <Meldung art="ok">{g.geloescht}</Meldung>}

        <form className="mb-4 flex gap-2" role="search">
          {filter !== "alle" && <input type="hidden" name="filter" value={filter} />}
          <label className="flex-1">
            <span className="sr-only">{g.suche}</span>
            <input type="search" name="suche" defaultValue={suche} placeholder={g.suche} className={`${feldKlasse} mt-0`} />
          </label>
          <button className={`${knopfZweitKlasse} px-5`}>{g.suchen}</button>
        </form>

        <nav aria-label={g.titel} className="mb-4 flex gap-1 border-b border-linie">
          {filterListe.map((f) => (
            <Link
              key={f}
              href={ziel(f)}
              aria-current={f === filter ? "page" : undefined}
              className={`-mb-px border-b-4 px-4 py-2.5 text-lg font-semibold ${
                f === filter ? "border-senf text-tinte" : "border-transparent text-stift hover:text-tinte"
              }`}
            >
              {g.reiter[f]}
            </Link>
          ))}
        </nav>

        {gaeste.length === 0 ? (
          <div className="rounded-xl border border-dashed border-linie bg-papier px-5 py-10 text-center text-stift">
            <p>{suche ? g.leer.suche : g.leer[filter]}</p>
            {suche && (
              <Link href={ziel(filter).replace(/[?&]suche=[^&]*/, "")} className="mt-2 inline-block font-medium text-tafel underline underline-offset-4">
                {g.sucheZuruecksetzen}
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
            {gaeste.map((gast) => (
              <li key={gast.id}>
                <Link href={`/gaeste/${gast.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-kreide">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xl font-semibold">{gast.name}</span>
                      <GastMarken besuche={gast.besuche} zimmer={gast.zimmer} allergien={gast.allergien} />
                    </span>
                    <span className="ziffern mt-0.5 block text-stift">
                      {[
                        gast.telefon,
                        gast.besuche === 0 ? g.keinBesuch : `${gast.besuche} ${gast.besuche === 1 ? g.besuch : g.besuche}`,
                        gast.letzterBesuch ? `${g.zuletzt} ${datumLang(gast.letzterBesuch)}` : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-stift" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seite>
    </>
  );
}
