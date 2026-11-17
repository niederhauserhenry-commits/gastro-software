import { redirect } from "next/navigation";
import { Kopfleiste, Seite, Zurueck } from "@/app/bausteine";
import { AbmeldeKnopf } from "@/app/einstellungen/rahmen";
import { GastFormular } from "@/app/gaeste/formular";
import { aktuelleMitgliedschaft } from "@/lib/sitzung";
import { texte } from "@/texte";

export default async function NeuerGast() {
  const t = texte();
  const ich = await aktuelleMitgliedschaft();
  if (!ich.darfReservieren) redirect("/gaeste");
  return (
    <>
      <Kopfleiste restaurantName={ich.restaurantName} rechts={<AbmeldeKnopf />} />
      <Seite>
        <Zurueck href="/gaeste">{t.gaeste.zurueck}</Zurueck>
        <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{t.gaeste.neu}</h1>
        <div className="rounded-xl border border-linie bg-papier p-5 sm:p-6">
          <GastFormular gast={null} abbrechenZiel="/gaeste" />
        </div>
      </Seite>
    </>
  );
}
