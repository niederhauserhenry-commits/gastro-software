import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Kopfleiste, Seite, Zurueck } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ReservierungsFormular } from "@/app/reservierungen/neu/formular";
import {
  datumGueltig, datumImRestaurant, istUuid, ladeAufenthalte, ladeBesuche, ladeDurchgaenge, ladeEinstellungen, ladeGast,
  ladeOeffnungszeiten, ladeTische, type GastEintrag,
} from "@/lib/daten";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function NeueReservierung({ searchParams }: PageProps<"/reservierungen/neu">) {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  if (!ich.darfReservieren) redirect("/reservierungen");

  const [einstellungen, oeffnungszeiten, durchgaenge, tische] = await Promise.all([
    ladeEinstellungen(ich.restaurantId),
    ladeOeffnungszeiten(ich.restaurantId),
    ladeDurchgaenge(ich.restaurantId),
    ladeTische(ich.restaurantId),
  ]);
  await connection();
  const heute = datumImRestaurant(einstellungen.zeitzone);
  const parameter = await searchParams;
  const gewuenscht = parameter.datum;
  const startDatum = datumGueltig(gewuenscht) && gewuenscht >= heute ? gewuenscht : heute;

  // Kommt man von einer Karteikarte, ist der Gast schon ausgewählt.
  let startGast: GastEintrag | null = null;
  if (istUuid(parameter.gast)) {
    const [gast, besuche, aufenthalte] = await Promise.all([
      ladeGast(parameter.gast),
      ladeBesuche(parameter.gast),
      ladeAufenthalte(parameter.gast),
    ]);
    if (gast) {
      const echte = besuche.filter((b) => b.status === "angekommen" || b.status === "abgeschlossen");
      startGast = {
        id: gast.id,
        name: gast.name,
        telefon: gast.telefon,
        besuche: echte.length,
        letzterBesuch: echte[0]?.datum ?? null,
        allergien: gast.allergien,
        zimmer: aufenthalte.find((a) => a.anreise <= heute && heute <= a.abreise)?.zimmer ?? "",
      };
    }
  }

  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href={`/reservierungen?datum=${startDatum}`}>{t.reservierungen.titel}</Zurueck>
        <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{t.reservierungen.neu}</h1>
        <div className="rounded-xl border border-linie bg-papier p-5 sm:p-6">
          <ReservierungsFormular
            startDatum={startDatum}
            heute={heute}
            oeffnungszeiten={oeffnungszeiten}
            durchgaenge={durchgaenge}
            tische={tische}
            mitDurchgaengen={einstellungen.dauerModus === "durchgaenge"}
            mitTischen={einstellungen.vergabeModus === "tische"}
            startGast={startGast}
          />
        </div>
      </Seite>
    </>
  );
}
