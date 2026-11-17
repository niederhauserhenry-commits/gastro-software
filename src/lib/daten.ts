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

export type ReservierungStatus = "bestaetigt" | "angekommen" | "abgeschlossen" | "storniert" | "nicht_erschienen";
export type Reservierung = {
  id: string;
  tischId: string | null;
  tischName: string | null;
  gastName: string;
  telefon: string;
  personen: number;
  von: string;
  bis: string;
  // Minuten seit Mitternacht des angezeigten Tages (kann über 1440 gehen).
  vonMinuten: number;
  bisMinuten: number;
  status: ReservierungStatus;
  quelle: "personal" | "telefon_ki" | "web";
  anlass: string;
  notiz: string;
  gastId: string | null;
  // Besuche laut Kartei, Allergien und Zimmer, wenn der Gast im Haus wohnt.
  besuche: number;
  allergien: string;
  zimmer: string;
};

export const istAktiv = (r: Reservierung) => r.status === "bestaetigt" || r.status === "angekommen";

// Heutiges Datum (JJJJ-MM-TT) in der Zeitzone des Restaurants.
export function datumImRestaurant(zeitzone: string, jetzt = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zeitzone }).format(jetzt);
}

// Rechnet auf einem Kalenderdatum Tage dazu oder ab, ohne Zeitzonen-Fallen.
export function datumPlus(datum: string, tage: number) {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

// Wochentag 1 = Montag … 7 = Sonntag.
export function wochentagVon(datum: string) {
  const tag = new Date(`${datum}T12:00:00Z`).getUTCDay();
  return tag === 0 ? 7 : tag;
}

export const datumGueltig = (wert: unknown): wert is string =>
  typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert) && !Number.isNaN(Date.parse(`${wert}T12:00:00Z`));

export async function ladeReservierungen(restaurantId: string, datum: string): Promise<Reservierung[]> {
  if (vorschauAktiv()) {
    const r = (
      id: string, tischId: string, tischName: string, gastName: string, personen: number,
      von: string, bis: string, status: ReservierungStatus, anlass = "", notiz = "",
      quelle: Reservierung["quelle"] = "personal",
    ): Reservierung => {
      const min = (z: string) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3, 5));
      const kartei = vorschauGaeste.find((g) => g.name === gastName);
      return {
        id, tischId, tischName, gastName, telefon: kartei?.telefon ?? "0151 2345678", personen, von, bis,
        vonMinuten: min(von), bisMinuten: min(bis), status, quelle, anlass, notiz,
        gastId: kartei?.id ?? null, besuche: kartei?.besuche ?? 0, allergien: kartei?.allergien ?? "", zimmer: kartei?.zimmer ?? "",
      };
    };
    return [
      r("1", "g1", "Tisch 1", "Familie Meyer", 4, "12:00", "14:00", "abgeschlossen"),
      r("2", "g5", "Tisch 5", "Herr Brandt", 2, "12:30", "14:30", "abgeschlossen", "", "", "telefon_ki"),
      r("3", "g2", "Tisch 2", "Frau Lüders", 4, "17:30", "19:30", "angekommen", "Geburtstag", "Kerze zum Dessert"),
      r("4", "s1", "Stammtisch", "Kegelclub Hermannsburg", 9, "18:00", "20:00", "angekommen"),
      r("5", "g6", "Tisch 6", "Petersen", 2, "18:30", "20:30", "bestaetigt", "", "Fensterplatz gewünscht", "telefon_ki"),
      r("6", "t9", "Tisch 9", "Familie Schröder", 4, "19:00", "21:00", "bestaetigt", "", "Ein Kinderstuhl"),
      r("7", "g1", "Tisch 1", "Dr. Albers", 3, "19:30", "21:30", "bestaetigt", "Geschäftsessen"),
      r("8", "g3", "Tisch 3", "Wolters", 4, "20:00", "22:00", "storniert"),
    ];
  }
  const db = await datenbank();
  const { data, error } = await db.rpc("reservierungen_am", { p_restaurant: restaurantId, p_datum: datum });
  if (error) throw new Error(error.message);
  type Zeile = {
    id: string; tisch_id: string | null; tisch_name: string | null; gast_name: string; telefon: string;
    personen: number; von: string; bis: string; von_minuten: number; bis_minuten: number;
    status: ReservierungStatus; quelle: Reservierung["quelle"]; anlass: string; notiz: string;
    gast_id: string | null; besuche: number; allergien: string; zimmer: string;
  };
  return (data as Zeile[]).map((z) => ({
    id: z.id,
    tischId: z.tisch_id,
    tischName: z.tisch_name,
    gastName: z.gast_name,
    telefon: z.telefon,
    personen: z.personen,
    von: z.von,
    bis: z.bis,
    vonMinuten: z.von_minuten,
    bisMinuten: z.bis_minuten,
    status: z.status,
    quelle: z.quelle,
    anlass: z.anlass,
    notiz: z.notiz,
    gastId: z.gast_id,
    besuche: z.besuche,
    allergien: z.allergien,
    zimmer: z.zimmer,
  }));
}

// Gästekartei ---------------------------------------------------------------

export { gastStufe, type GastStufe } from "@/lib/gaststufe";

export type GastFilter = "alle" | "stammgaeste" | "hausgaeste";
export type GastEintrag = {
  id: string;
  name: string;
  telefon: string;
  besuche: number;
  letzterBesuch: string | null;
  allergien: string;
  zimmer: string;
};

export type Gast = {
  id: string;
  name: string;
  telefon: string;
  email: string;
  geburtstag: string | null;
  vorlieben: string;
  notizen: string;
  allergien: string;
  einwilligungAm: string | null;
  erstelltAm: string;
};

export type Besuch = {
  id: string;
  datum: string;
  von: string;
  personen: number;
  tischName: string | null;
  status: ReservierungStatus;
  anlass: string;
  notiz: string;
};

export type Aufenthalt = { id: string; zimmer: string; anreise: string; abreise: string };

const vorschauGaeste: (GastEintrag & { vorlieben: string; email: string; geburtstag: string | null; notizen: string })[] = [
  { id: "00000000-0000-0000-0000-0000000000a1", name: "Frau Lüders", telefon: "0151 2233445", besuche: 14, letzterBesuch: "2026-11-02", allergien: "Haselnüsse", zimmer: "", vorlieben: "Trinkt gern einen trockenen Riesling. Sitzt am liebsten am Fenster (Tisch 2).", email: "anna.lueders@example.de", geburtstag: "1958-11-16", notizen: "Kommt meist mit ihrer Schwester. Mag es ruhig." },
  { id: "00000000-0000-0000-0000-0000000000a2", name: "Kegelclub Hermannsburg", telefon: "05052 1234", besuche: 23, letzterBesuch: "2026-11-09", allergien: "", zimmer: "", vorlieben: "Jeden zweiten Montag. Erst eine Runde Pils, dann Schnitzel.", email: "", geburtstag: null, notizen: "" },
  { id: "00000000-0000-0000-0000-0000000000a3", name: "Dr. Albers", telefon: "0171 9988776", besuche: 3, letzterBesuch: "2026-10-20", allergien: "", zimmer: "12", vorlieben: "Geschäftsessen, braucht eine Rechnung auf die Firma.", email: "", geburtstag: null, notizen: "" },
  { id: "00000000-0000-0000-0000-0000000000a4", name: "Familie Schröder", telefon: "0160 5544332", besuche: 2, letzterBesuch: "2024-08-14", allergien: "Laktose (Tochter)", zimmer: "", vorlieben: "Rotwein: Spätburgunder von der Ahr.", email: "", geburtstag: null, notizen: "Waren vor zwei Jahren zur Konfirmation da." },
  { id: "00000000-0000-0000-0000-0000000000a5", name: "Petersen", telefon: "0152 7766554", besuche: 0, letzterBesuch: null, allergien: "", zimmer: "7", vorlieben: "", email: "", geburtstag: null, notizen: "" },
  { id: "00000000-0000-0000-0000-0000000000a6", name: "Familie Meyer", telefon: "0151 2345678", besuche: 6, letzterBesuch: "2026-11-16", allergien: "", zimmer: "", vorlieben: "Kinderteller ohne Pommes.", email: "", geburtstag: null, notizen: "" },
];

export async function ladeGaesteListe(restaurantId: string, suche: string, filter: GastFilter): Promise<GastEintrag[]> {
  if (vorschauAktiv()) {
    const s = suche.trim().toLowerCase();
    return vorschauGaeste
      .filter((g) => !s || g.name.toLowerCase().includes(s) || g.telefon.replace(/\D/g, "").includes(s.replace(/\D/g, "") || "#"))
      .filter((g) => filter === "alle" || (filter === "stammgaeste" ? g.besuche >= 5 : g.zimmer !== ""));
  }
  const db = await datenbank();
  const { data, error } = await db.rpc("gaeste_liste", { p_restaurant: restaurantId, p_suche: suche, p_filter: filter });
  if (error) throw new Error(error.message);
  type Zeile = { id: string; name: string; telefon: string; besuche: number; letzter_besuch: string | null; allergien: string; zimmer: string };
  return (data as Zeile[]).map((z) => ({
    id: z.id,
    name: z.name,
    telefon: z.telefon,
    besuche: z.besuche,
    letzterBesuch: z.letzter_besuch,
    allergien: z.allergien,
    zimmer: z.zimmer,
  }));
}

export async function ladeGast(id: string): Promise<Gast | null> {
  if (vorschauAktiv()) {
    const g = vorschauGaeste.find((x) => x.id === id);
    return g
      ? { id: g.id, name: g.name, telefon: g.telefon, email: g.email, geburtstag: g.geburtstag, vorlieben: g.vorlieben, notizen: g.notizen, allergien: g.allergien, einwilligungAm: g.allergien ? "2025-03-02T18:00:00Z" : null, erstelltAm: "2023-05-12T10:00:00Z" }
      : null;
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("gaeste")
    .select("id, name, telefon, email, geburtstag, vorlieben, notizen, allergien, allergien_einwilligung_am, erstellt_am")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    telefon: data.telefon,
    email: data.email,
    geburtstag: data.geburtstag,
    vorlieben: data.vorlieben,
    notizen: data.notizen,
    allergien: data.allergien,
    einwilligungAm: data.allergien_einwilligung_am,
    erstelltAm: data.erstellt_am,
  };
}

export async function ladeBesuche(gastId: string): Promise<Besuch[]> {
  if (vorschauAktiv()) {
    const tage = ["2026-11-02", "2026-09-27", "2026-08-15", "2026-06-06", "2026-04-18", "2025-12-24"];
    return tage.map((datum, i) => ({
      id: `b${i}`, datum, von: i === 5 ? "12:00" : "18:30", personen: i === 5 ? 6 : 2, tischName: "Tisch 2",
      status: i === 3 ? "storniert" : "abgeschlossen", anlass: i === 5 ? "Heiligabend" : i === 2 ? "Geburtstag der Schwester" : "",
      notiz: i === 0 ? "Riesling war ausverkauft, hat Grauburgunder genommen" : "",
    }));
  }
  const db = await datenbank();
  const { data, error } = await db.rpc("gast_besuche", { p_gast: gastId });
  if (error) throw new Error(error.message);
  type Zeile = { id: string; datum: string; von: string; personen: number; tisch_name: string | null; status: ReservierungStatus; anlass: string; notiz: string };
  return (data as Zeile[]).map((z) => ({
    id: z.id, datum: z.datum, von: z.von, personen: z.personen, tischName: z.tisch_name, status: z.status, anlass: z.anlass, notiz: z.notiz,
  }));
}

export async function ladeAufenthalte(gastId: string): Promise<Aufenthalt[]> {
  if (vorschauAktiv()) {
    const g = vorschauGaeste.find((x) => x.id === gastId);
    return g?.zimmer ? [{ id: "a1", zimmer: g.zimmer, anreise: "2026-11-15", abreise: "2026-11-19" }] : [];
  }
  const db = await datenbank();
  const { data, error } = await db
    .from("aufenthalte")
    .select("id, zimmer, anreise, abreise")
    .eq("gast_id", gastId)
    .order("anreise", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// "2026-11-16" wird zu "16. November 2026" (oder ohne Jahr).
export function datumLang(datum: string, mitJahr = true) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    ...(mitJahr ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${datum.slice(0, 10)}T12:00:00Z`));
}

export const istUuid = (wert: unknown): wert is string =>
  typeof wert === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert);
