import { redirect } from "next/navigation";
import { datenbank } from "@/lib/supabase/server";

export type Rolle = "inhaber" | "manager" | "mitarbeiter" | "azubi";

export type Mitgliedschaft = {
  restaurantId: string;
  restaurantName: string;
  userId: string;
  anzeigename: string;
  rolle: Rolle;
  darfReservieren: boolean;
  module: string[];
};

// Liefert den angemeldeten Nutzer mit seinem Restaurant.
// Ohne Anmeldung geht es zur Anmeldeseite, ohne Restaurant zur Einrichtung.
export async function aktuelleMitgliedschaft(): Promise<Mitgliedschaft> {
  const db = await datenbank();
  const { data: nutzer } = await db.auth.getUser();
  if (!nutzer.user) redirect("/anmelden");

  const { data: zeilen, error } = await db
    .from("mitglieder")
    .select("restaurant_id, anzeigename, rolle, darf_reservieren, restaurants(name)")
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

  const restaurant = zeile.restaurants as unknown as { name: string } | null;
  const rolle = zeile.rolle as Rolle;
  return {
    restaurantId: zeile.restaurant_id,
    restaurantName: restaurant?.name ?? "",
    userId: nutzer.user.id,
    anzeigename: zeile.anzeigename,
    rolle,
    darfReservieren: rolle === "inhaber" || rolle === "manager" || zeile.darf_reservieren,
    module: (module ?? []).map((m) => m.modul),
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
