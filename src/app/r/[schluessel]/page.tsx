import Link from "next/link";
import { absagenPerLink } from "@/app/r/[schluessel]/aktionen";
import { knopfKlasse, knopfZweitKlasse } from "@/app/klassen";
import { datumLang } from "@/lib/daten";
import { datenbank } from "@/lib/supabase/server";
import { vorschauAktiv } from "@/lib/vorschau";
import { texte } from "@/texte";

type Reservierung = {
  restaurant: string;
  gast_name: string;
  datum: string;
  uhrzeit: string;
  personen: number;
  status: string;
  abgesagt_vom_gast: boolean;
  absagbar: boolean;
};

async function lade(schluessel: string): Promise<Reservierung | null> {
  if (!/^[0-9a-f]{12}$/.test(schluessel)) return null;
  if (vorschauAktiv()) {
    return { restaurant: "Gasthaus Zur Linde", gast_name: "Frau Lüders", datum: "2026-11-21", uhrzeit: "19:00", personen: 2, status: "bestaetigt", abgesagt_vom_gast: false, absagbar: true };
  }
  const db = await datenbank();
  const { data } = await db.rpc("reservierung_per_link", { p_schluessel: schluessel });
  return (data as Reservierung[] | null)?.[0] ?? null;
}

// Öffentliche Seite für Gäste: Reservierung ansehen und selbst absagen.
export default async function AbsageSeite({ params, searchParams }: PageProps<"/r/[schluessel]">) {
  const t = texte().absage;
  const { schluessel } = await params;
  const bestaetigen = (await searchParams).absagen === "1";
  const r = await lade(schluessel);

  return (
    <main className="flex flex-1 flex-col">
      <div className="bg-tafel px-6 py-8 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-white/80">{t.titel}</p>
          <p className="text-3xl font-bold tracking-tight">{r?.restaurant ?? ""}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-6 py-8">
        {!r ? (
          <p className="text-lg">{t.unbekannt}</p>
        ) : (
          <>
            <p className="text-lg text-stift">{r.gast_name}</p>
            <p className={`ziffern mt-1 text-3xl font-bold leading-tight ${r.status === "storniert" ? "text-stift line-through" : ""}`}>
              {datumLang(r.datum)}
              <span className="block">
                {r.uhrzeit} {t.uhr}
              </span>
            </p>
            <p className="ziffern mt-1 text-lg">
              {t.fuer} {r.personen} {r.personen === 1 ? t.person : t.personen}
            </p>

            <div className="mt-8">
              {r.status === "storniert" ? (
                <p role="status" className="rounded-xl bg-tafel-hell px-5 py-4 text-lg text-tafel-tief">
                  {r.abgesagt_vom_gast ? t.abgesagt : t.storniert}
                </p>
              ) : !r.absagbar ? (
                <p className="rounded-xl bg-kreide px-5 py-4 text-lg">{t.nichtMehr}</p>
              ) : bestaetigen ? (
                <form action={absagenPerLink} className="space-y-3">
                  <input type="hidden" name="schluessel" value={schluessel} />
                  <p className="text-lg">{t.sicher}</p>
                  <button className={`${knopfKlasse} w-full bg-warnrot px-6 py-3.5 text-lg hover:bg-warnrot/90`}>{t.jaAbsagen}</button>
                  <Link href={`/r/${schluessel}`} className={`${knopfZweitKlasse} w-full px-6 py-3.5 text-lg`}>
                    {t.behalten}
                  </Link>
                </form>
              ) : (
                <Link href={`/r/${schluessel}?absagen=1`} className={`${knopfZweitKlasse} w-full px-6 py-3.5 text-lg`}>
                  {t.nichtKommen}
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
