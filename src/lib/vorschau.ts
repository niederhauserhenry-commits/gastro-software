// Vorschau-Modus nur für die Entwicklung: zeigt die Seiten mit Beispieldaten,
// ohne Anmeldung und ohne Datenbank. Im echten Betrieb ist er immer aus,
// weil dort NODE_ENV fest auf "production" steht.
export function vorschauAktiv() {
  return process.env.NODE_ENV !== "production" && process.env.VORSCHAU === "1";
}

export const vorschauRestaurant = "00000000-0000-0000-0000-0000000000aa";
export const vorschauNutzer = "00000000-0000-0000-0000-000000000001";
