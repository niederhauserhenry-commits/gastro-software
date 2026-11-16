import { datenbank } from "@/lib/supabase/server";
import { vorschauAktiv, vorschauNutzer } from "@/lib/vorschau";
import type { Rolle } from "@/lib/sitzung";

// Alle Lesezugriffe auf die Datenbank an einer Stelle.
// Die Datenbank liefert von sich aus nur Zeilen des eigenen Restaurants.

export type Einstellungen = {
  vergabeModus: "tische" | "plaetze";
  plaetzeGesamt: number | null;
  dauerModus: "fest" | "offen" | "durchgaenge";
  standardDauerMinuten: number;
  wartelisteModus: "automatisch" | "manuell";
  wartelisteFristMinuten: number;
  loeschfristMonate: number;
  zeitzone: string;
};

export type Oeffnungszeit = { wochentag: number; von: string; bis: string };
export type Tisch = { id: string; name: string; bereich: string; plaetze: number };
export type Durchgang = { id: string; wochentag: number | null; name: string; von: string; bis: string };
export type Teammitglied = {
  userId: string;
  anzeigename: string;
  email: string;
  rolle: Rolle;
  darfReservieren: boolean;
};

// "11:30:00" aus der Datenbank wird zu "11:30".
const kurz = (zeit: string) => zeit.slice(0, 5);

export async function ladeEinstellungen(restaurantId: string): Promise<Einstellungen> {
  if (vorschauAktiv()) {
    return {
      vergabeModus: "tische",
      plaetzeGesamt: null,
      dauerModus: "fest",
      standardDauerMinuten: 120,
      wartelisteModus: "automatisch",
      wartelisteFristMinuten: 15,
      loeschfristMonate: 36,
      zeitzone: "Europe/Berlin",
    };
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("restaurants")
    .select(
      "vergabe_modus, plaetze_gesamt, dauer_modus, standard_dauer_minuten, warteliste_modus, warteliste_frist_minuten, loeschfrist_monate, zeitzone",
    )
    .eq("id", restaurantId)
    .single();
  if (error) throw new Error(error.message);
  return {
    vergabeModus: data.vergabe_modus,
    plaetzeGesamt: data.plaetze_gesamt,
    dauerModus: data.dauer_modus,
    standardDauerMinuten: data.standard_dauer_minuten,
    wartelisteModus: data.warteliste_modus,
    wartelisteFristMinuten: data.warteliste_frist_minuten,
    loeschfristMonate: data.loeschfrist_monate,
    zeitzone: data.zeitzone,
  };
}

export async function ladeOeffnungszeiten(restaurantId: string): Promise<Oeffnungszeit[]> {
  if (vorschauAktiv()) {
    const tage = [1, 2, 3, 4, 5, 6, 7];
    return tage.flatMap((wochentag) => [
      { wochentag, von: "11:30", bis: "14:00" },
      { wochentag, von: "17:30", bis: wochentag >= 5 && wochentag <= 6 ? "23:30" : "22:00" },
    ]);
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("oeffnungszeiten")
    .select("wochentag, von, bis")
    .eq("restaurant_id", restaurantId)
    .order("wochentag")
    .order("von");
  if (error) throw new Error(error.message);
  return data.map((z) => ({ wochentag: z.wochentag, von: kurz(z.von), bis: kurz(z.bis) }));
}

export async function ladeTische(restaurantId: string): Promise<Tisch[]> {
  if (vorschauAktiv()) {
    const liste: Tisch[] = [];
    for (let i = 1; i <= 8; i++) liste.push({ id: `g${i}`, name: `Tisch ${i}`, bereich: "Gastraum", plaetze: i <= 4 ? 4 : 2 });
    for (let i = 9; i <= 12; i++) liste.push({ id: `t${i}`, name: `Tisch ${i}`, bereich: "Terrasse", plaetze: 4 });
    liste.push({ id: "s1", name: "Stammtisch", bereich: "Stube", plaetze: 10 });
    return liste;
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("tische")
    .select("id, name, bereich, plaetze")
    .eq("restaurant_id", restaurantId)
    .order("erstellt_am")
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function ladeDurchgaenge(restaurantId: string): Promise<Durchgang[]> {
  if (vorschauAktiv()) {
    return [
      { id: "d1", wochentag: null, name: "Früher Abend", von: "17:30", bis: "19:30" },
      { id: "d2", wochentag: null, name: "Später Abend", von: "19:45", bis: "22:00" },
    ];
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("durchgaenge")
    .select("id, wochentag, name, von, bis")
    .eq("restaurant_id", restaurantId)
    .order("von");
  if (error) throw new Error(error.message);
  return data.map((d) => ({ ...d, von: kurz(d.von), bis: kurz(d.bis) }));
}

export async function ladeTeam(restaurantId: string): Promise<Teammitglied[]> {
  if (vorschauAktiv()) {
    return [
      { userId: vorschauNutzer, anzeigename: "Henry", email: "chef@test.de", rolle: "inhaber", darfReservieren: true },
      { userId: "m", anzeigename: "Mia", email: "manager@test.de", rolle: "manager", darfReservieren: true },
      { userId: "s", anzeigename: "Sven", email: "service@test.de", rolle: "mitarbeiter", darfReservieren: true },
      { userId: "a", anzeigename: "Ali", email: "azubi@test.de", rolle: "azubi", darfReservieren: false },
    ];
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("mitglieder")
    .select("user_id, anzeigename, email, rolle, darf_reservieren")
    .eq("restaurant_id", restaurantId)
    .order("erstellt_am", { ascending: true });
  if (error) throw new Error(error.message);
  return data.map((p) => ({
    userId: p.user_id,
    anzeigename: p.anzeigename,
    email: p.email,
    rolle: p.rolle as Rolle,
    darfReservieren: p.darf_reservieren,
  }));
}
