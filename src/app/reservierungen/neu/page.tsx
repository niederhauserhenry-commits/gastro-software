import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Kopfleiste, Seite, Zurueck } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { ReservierungsFormular } from "@/app/reservierungen/neu/formular";
import { datumGueltig, datumImRestaurant, ladeDurchgaenge, ladeEinstellungen, ladeOeffnungszeiten, ladeTische } from "@/lib/daten";
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
  const gewuenscht = (await searchParams).datum;
  const startDatum = datumGueltig(gewuenscht) && gewuenscht >= heute ? gewuenscht : heute;

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
          />
        </div>
      </Seite>
    </>
  );
}
