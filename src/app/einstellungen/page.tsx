import Link from "next/link";
import { Kopfleiste, Meldung, Seite, Zurueck } from "@/app/bausteine";
import { AbmeldeKnopf, schritte } from "@/app/einstellungen/rahmen";
import { aktuelleMitgliedschaft, istLeitung } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function Einstellungen({ searchParams }: PageProps<"/einstellungen">) {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  const parameter = await searchParams;
  // Das Team darf jeder sehen, alles andere nur die Leitung.
  const bereiche = [...(istLeitung(ich.rolle) ? [...schritte, "nachrichten" as const] : []), "team" as const];

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/">{t.allgemein.zurueck}</Zurueck>
        <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{t.einstellungen.titel}</h1>

        {parameter.fertig === "1" && <Meldung art="ok">{t.einstellungen.fertig}</Meldung>}

        <ul className="divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-papier">
          {bereiche.map((name) => {
            const text = t.einstellungen.bereiche[name];
            const ziel = name === "team" ? "/team" : `/einstellungen/${name}`;
            return (
              <li key={name}>
                <Link href={ziel} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-kreide">
                  <span>
                    <span className="block text-lg font-semibold">{text.titel}</span>
                    <span className="block text-stift">{text.text}</span>
                  </span>
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-stift" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      </Seite>
    </>
  );
}
