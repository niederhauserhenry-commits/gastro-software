import Link from "next/link";
import { abmelden } from "@/app/aktionen";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

// Startseite: höchstens fünf große Kacheln.
// "ziel" fehlt, solange das Modul noch nicht gebaut ist.
const kachelListe = [
  { schluessel: "reservierungen", symbol: "📅", modul: "reservierungen", ziel: null },
  { schluessel: "gaeste", symbol: "👤", modul: "gaeste", ziel: null },
  { schluessel: "warteliste", symbol: "⏳", modul: "warteliste", ziel: null },
  { schluessel: "feedback", symbol: "💬", modul: "feedback", ziel: null },
  { schluessel: "team", symbol: "👥", modul: null, ziel: "/team" },
] as const;

export default async function Startseite() {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  // Nur gebuchte Module erscheinen. Das Team gehört immer dazu.
  const sichtbar = kachelListe.filter((k) => k.modul === null || ich.module.includes(k.modul));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-green-900">{ich.restaurantName}</p>
          <h1 className="text-3xl font-bold">
            {t.startseite.begruessung}, {ich.anzeigename}
          </h1>
          <p className="mt-1 text-stone-600">
            {t.startseite.deineRolle}: {t.rollen[ich.rolle]}
          </p>
        </div>
        <form action={abmelden}>
          <button className="rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium hover:bg-stone-100">
            {t.allgemein.abmelden}
          </button>
        </form>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sichtbar.map((kachel) => {
          const text = t.kacheln[kachel.schluessel];
          const inhalt = (
            <>
              <span className="text-4xl" aria-hidden="true">
                {kachel.symbol}
              </span>
              <span className="flex-1">
                <span className="block text-xl font-semibold">{text.titel}</span>
                <span className="block text-stone-600">{text.text}</span>
              </span>
              {!kachel.ziel && (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                  {t.startseite.baldVerfuegbar}
                </span>
              )}
            </>
          );
          const klasse =
            "flex min-h-28 items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
          return (
            <li key={kachel.schluessel}>
              {kachel.ziel ? (
                <Link href={kachel.ziel} className={`${klasse} hover:border-green-800`}>
                  {inhalt}
                </Link>
              ) : (
                <div className={klasse}>{inhalt}</div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
