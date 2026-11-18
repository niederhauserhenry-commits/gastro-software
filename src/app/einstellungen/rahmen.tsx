import Link from "next/link";
import { AbmeldeFormular } from "@/app/offline";
import { Kopfleiste, Meldung, Seite, Zurueck } from "@/app/bausteine";
import { fehlerText } from "@/lib/fehler";
import type { Mitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

export const schritte = ["oeffnungszeiten", "tische", "tischdauer", "warteliste"] as const;
export type Schritt = (typeof schritte)[number];

export function AbmeldeKnopf() {
  const t = texte();
  return (
    <AbmeldeFormular
      className="rounded-lg border border-white/30 px-3 py-1.5 font-medium text-white hover:bg-white/10"
      text={t.allgemein.abmelden}
    />
  );
}

// Gemeinsamer Rahmen der vier Einrichtungsseiten: Kopf, Fortschritt, Meldungen.
export function EinrichtungsRahmen({
  ich,
  schritt,
  parameter,
  children,
}: {
  ich: Mitgliedschaft;
  schritt: Schritt;
  parameter: { fehler?: string | string[]; ok?: string | string[] };
  children: React.ReactNode;
}) {
  const t = texte();
  const nummer = schritte.indexOf(schritt) + 1;
  const fehler = fehlerText(parameter.fehler);

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/einstellungen">{t.einstellungen.zurueck}</Zurueck>

        <nav aria-label={t.einstellungen.titel} className="mb-6">
          <ol className="grid grid-cols-4 gap-2">
            {schritte.map((name, index) => {
              const aktiv = name === schritt;
              return (
                <li key={name}>
                  <Link
                    href={`/einstellungen/${name}`}
                    aria-current={aktiv ? "step" : undefined}
                    className={`block rounded-lg border-t-4 px-1 pt-2 text-sm font-medium sm:text-base ${
                      aktiv ? "border-senf text-tinte" : "border-linie text-stift hover:border-tafel"
                    }`}
                  >
                    <span className="ziffern block text-xs text-stift">
                      {t.einstellungen.schritt} {index + 1}
                    </span>
                    <span className="hidden sm:block">{t.einstellungen.bereiche[name].titel}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.einstellungen.bereiche[schritt].titel}</h1>
        <p className="ziffern mb-6 mt-1 text-stift sm:hidden">
          {t.einstellungen.schritt} {nummer} {t.einstellungen.von} {schritte.length}
        </p>
        <div className="mb-6 hidden sm:block" />

        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {parameter.ok === "1" && <Meldung art="ok">{t.allgemein.gespeichert}</Meldung>}

        {children}
      </Seite>
    </>
  );
}

// Knopf am Ende eines Formulars. Während der Ersteinrichtung führt er zum
// nächsten Schritt, danach speichert er nur.
export function SpeicherKnopf({ ich, text }: { ich: Mitgliedschaft; text?: string }) {
  const t = texte();
  const weiter = !ich.einrichtungAbgeschlossen;
  return (
    <div className="mt-6">
      {weiter && <input type="hidden" name="weiter" value="1" />}
      <button className="inline-flex w-full items-center justify-center rounded-lg bg-tafel px-6 py-3.5 text-lg font-semibold text-white hover:bg-tafel-tief sm:w-auto">
        {text ?? (weiter ? t.allgemein.speichernWeiter : t.allgemein.speichern)}
      </button>
    </div>
  );
}
