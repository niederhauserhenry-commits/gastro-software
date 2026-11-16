import { anmelden, registrieren } from "@/app/aktionen";
import { Meldung, feldKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { fehlerText } from "@/lib/fehler";
import { texte } from "@/texte";

export default async function Anmelden({ searchParams }: PageProps<"/anmelden">) {
  const t = texte();
  const parameter = await searchParams;
  const fehler = fehlerText(parameter.fehler);

  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      <div className="bg-tafel px-6 py-10 text-white lg:flex lg:w-5/12 lg:flex-col lg:justify-end lg:px-12 lg:py-16">
        <p className="text-4xl font-bold tracking-tight sm:text-5xl">{t.appName}</p>
        <p className="mt-3 max-w-sm text-lg text-white/80">{t.beschreibung}</p>
      </div>

      <div className="flex flex-1 items-start justify-center px-6 py-10 lg:items-center">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">{t.anmelden.titel}</h1>

          {fehler && <Meldung art="fehler">{fehler}</Meldung>}
          {parameter.hinweis === "bestaetigen" && <Meldung art="ok">{t.anmelden.bestaetigen}</Meldung>}

          <form className="space-y-4">
            <label className="block font-medium">
              {t.anmelden.email}
              <input name="email" type="email" required autoComplete="email" className={feldKlasse} />
            </label>
            <label className="block font-medium">
              {t.anmelden.passwort}
              <input name="passwort" type="password" required minLength={8} autoComplete="current-password" className={feldKlasse} />
              <span className="mt-1.5 block text-sm font-normal text-stift">{t.anmelden.passwortHinweis}</span>
            </label>
            <div className="flex flex-col gap-3 pt-2">
              <button formAction={anmelden} className={knopfKlasse}>
                {t.anmelden.anmelden}
              </button>
              <button formAction={registrieren} className={knopfZweitKlasse}>
                {t.anmelden.registrieren}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
