import { texte } from "@/texte";

// Startseite: höchstens fünf große Kacheln.
// "aktiv: false" heißt: Das Modul ist noch nicht gebaut.
const kachelListe = [
  { schluessel: "reservierungen", symbol: "📅", aktiv: false },
  { schluessel: "gaeste", symbol: "👤", aktiv: false },
  { schluessel: "warteliste", symbol: "⏳", aktiv: false },
  { schluessel: "feedback", symbol: "💬", aktiv: false },
  { schluessel: "einstellungen", symbol: "⚙️", aktiv: false },
] as const;

export default function Startseite() {
  const t = texte();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8">
        <p className="text-sm font-medium text-green-900">{t.appName}</p>
        <h1 className="text-3xl font-bold">{t.startseite.begruessung}</h1>
        <p className="mt-2 text-stone-600">{t.startseite.hinweis}</p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {kachelListe.map((kachel) => {
          const text = t.kacheln[kachel.schluessel];
          return (
            <li
              key={kachel.schluessel}
              className="flex min-h-28 items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
            >
              <span className="text-4xl" aria-hidden="true">
                {kachel.symbol}
              </span>
              <span className="flex-1">
                <span className="block text-xl font-semibold">{text.titel}</span>
                <span className="block text-stone-600">{text.text}</span>
              </span>
              {!kachel.aktiv && (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                  {t.startseite.baldVerfuegbar}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
