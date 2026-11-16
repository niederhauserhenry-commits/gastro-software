import { redirect } from "next/navigation";
import { datenbank } from "@/lib/supabase/server";
import { vorschauAktiv, vorschauNutzer, vorschauRestaurant } from "@/lib/vorschau";

export type Rolle = "inhaber" | "manager" | "mitarbeiter" | "azubi";

export type Mitgliedschaft = {
  restaurantId: string;
  restaurantName: string;
  userId: string;
  anzeigename: string;
  rolle: Rolle;
  darfReservieren: boolean;
  module: string[];
  einrichtungAbgeschlossen: boolean;
};

// Liefert den angemeldeten Nutzer mit seinem Restaurant.
// Ohne Anmeldung geht es zur Anmeldeseite, ohne Restaurant zur Einrichtung.
export async function aktuelleMitgliedschaft(): Promise<Mitgliedschaft> {
  if (vorschauAktiv()) {
    const rolle = (process.env.VORSCHAU_ROLLE as Rolle | undefined) ?? "inhaber";
    return {
      restaurantId: vorschauRestaurant,
      restaurantName: "Gasthaus Zur Linde",
      userId: vorschauNutzer,
      anzeigename: "Henry",
      rolle,
      darfReservieren: true,
      module: ["reservierungen", "gaeste", "warteliste", "feedback"],
      einrichtungAbgeschlossen: process.env.VORSCHAU_FERTIG === "1",
    };
  }
  const db = await datenbank();
  const { data: nutzer } = await db.auth.getUser();
  if (!nutzer.user) redirect("/anmelden");

  const { data: zeilen, error } = await db
    .from("mitglieder")
    .select("restaurant_id, anzeigename, rolle, darf_reservieren, restaurants(name, einrichtung_abgeschlossen)")
    .eq("user_id", nutzer.user.id)
    .order("erstellt_am", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const zeile = zeilen?.[0];
  if (!zeile) redirect("/einrichten");

  const { data: module } = await db
    .from("module_freischaltungen")
    .select("modul")
    .eq("restaurant_id", zeile.restaurant_id)
    .eq("aktiv", true);

  const restaurant = zeile.restaurants as unknown as { name: string; einrichtung_abgeschlossen: boolean } | null;
  const rolle = zeile.rolle as Rolle;
  return {
    restaurantId: zeile.restaurant_id,
    restaurantName: restaurant?.name ?? "",
    userId: nutzer.user.id,
    anzeigename: zeile.anzeigename,
    rolle,
    darfReservieren: rolle === "inhaber" || rolle === "manager" || zeile.darf_reservieren,
    module: (module ?? []).map((m) => m.modul),
    einrichtungAbgeschlossen: restaurant?.einrichtung_abgeschlossen ?? false,
  };
}

export function istLeitung(rolle: Rolle) {
  return rolle === "inhaber" || rolle === "manager";
}

// Inhaber verwalten alle Rollen, Manager nur Mitarbeiter und Azubis.
export function darfRolleVerwalten(eigene: Rolle, ziel: Rolle) {
  if (eigene === "inhaber") return true;
  if (eigene === "manager") return ziel === "mitarbeiter" || ziel === "azubi";
  return false;
}

// Wie aktuelleMitgliedschaft, aber nur für Inhaber und Manager.
// Alle anderen landen wieder auf der Startseite.
export async function leitungErforderlich(): Promise<Mitgliedschaft> {
  const ich = await aktuelleMitgliedschaft();
  if (!istLeitung(ich.rolle)) redirect("/");
  return ich;
}
