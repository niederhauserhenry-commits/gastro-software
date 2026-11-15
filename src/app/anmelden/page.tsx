import { anmelden, registrieren } from "@/app/aktionen";
import { Meldung, feldKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/bausteine";
import { fehlerText } from "@/lib/fehler";
import { texte } from "@/texte";

export default async function Anmelden({ searchParams }: PageProps<"/anmelden">) {
  const t = texte();
  const parameter = await searchParams;
  const fehler = fehlerText(parameter.fehler);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <p className="text-sm font-medium text-green-900">{t.appName}</p>
      <h1 className="mb-6 text-3xl font-bold">{t.anmelden.titel}</h1>

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
          <span className="mt-1 block text-sm font-normal text-stone-600">{t.anmelden.passwortHinweis}</span>
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
    </main>
  );
}
