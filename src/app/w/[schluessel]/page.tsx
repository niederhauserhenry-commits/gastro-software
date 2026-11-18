import { angebotBeantworten } from "@/app/w/[schluessel]/aktionen";
import { knopfKlasse, knopfZweitKlasse } from "@/app/klassen";
import { datumLang } from "@/lib/daten";
import { datenbank } from "@/lib/supabase/server";
import { vorschauAktiv } from "@/lib/vorschau";
import { texte } from "@/texte";

type Angebot = {
  restaurant: string;
  gast_name: string;
  datum: string;
  uhrzeit: string | null;
  personen: number;
  status: string;
  gueltig_bis: string | null;
  offen: boolean;
};

async function lade(schluessel: string): Promise<Angebot | null> {
  if (!/^[0-9a-f]{12}$/.test(schluessel)) return null;
  if (vorschauAktiv()) {
    return { restaurant: "Gasthaus Zur Linde", gast_name: "Familie Krüger", datum: "2026-11-21", uhrzeit: "19:30", personen: 4, status: "angeboten", gueltig_bis: "18:47", offen: true };
  }
  const db = await datenbank();
  const { data } = await db.rpc("warteliste_per_link", { p_schluessel: schluessel });
  return (data as Angebot[] | null)?.[0] ?? null;
}

const ergebnisse = { GEBUCHT: "gebucht", ABGELEHNT: "abgelehnt", ABGELAUFEN: "abgelaufen", NICHT_MEHR_FREI: "nichtMehrFrei", UNBEKANNT: "unbekannt" } as const;

// Öffentliche Seite: Der Gast sagt zu einem frei gewordenen Tisch zu oder ab.
export default async function AngebotSeite({ params, searchParams }: PageProps<"/w/[schluessel]">) {
  const t = texte().angebot;
  const { schluessel } = await params;
  const ergebnisParam = (await searchParams).ergebnis;
  const a = await lade(schluessel);
  const ergebnis =
    typeof ergebnisParam === "string" && ergebnisParam in ergebnisse
      ? t[ergebnisse[ergebnisParam as keyof typeof ergebnisse]]
      : a?.status === "gebucht"
        ? t.gebucht
        : a && !a.offen
          ? t.abgelaufen
          : null;

  return (
    <main className="flex flex-1 flex-col">
      <div className="bg-tafel px-6 py-8 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-white/80">{a?.restaurant}</p>
          <p className="text-3xl font-bold tracking-tight">{t.titel}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-6 py-8">
        {!a ? (
          <p className="text-lg">{t.unbekannt}</p>
        ) : (
          <>
            <p className="text-lg text-stift">{a.gast_name}</p>
            {a.uhrzeit && (
              <p className="ziffern mt-1 text-3xl font-bold leading-tight">
                {datumLang(a.datum)}
                <span className="block">
                  {a.uhrzeit} {t.uhr}
                </span>
              </p>
            )}
            <p className="ziffern mt-1 text-lg">
              {t.fuer} {a.personen} {a.personen === 1 ? t.person : t.personen}
            </p>

            <div className="mt-8">
              {ergebnis ? (
                <p role="status" className="rounded-xl bg-tafel-hell px-5 py-4 text-lg text-tafel-tief">
                  {ergebnis}
                </p>
              ) : (
                <form action={angebotBeantworten} className="space-y-3">
                  <input type="hidden" name="schluessel" value={schluessel} />
                  {a.gueltig_bis && <p className="ziffern text-lg font-semibold">{t.gueltig.replace("{zeit}", a.gueltig_bis)}</p>}
                  <button name="antwort" value="ja" className={`${knopfKlasse} w-full px-6 py-4 text-xl`}>
                    {t.zusagen}
                  </button>
                  <button name="antwort" value="nein" className={`${knopfZweitKlasse} w-full px-6 py-3.5 text-lg`}>
                    {t.ablehnen}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
