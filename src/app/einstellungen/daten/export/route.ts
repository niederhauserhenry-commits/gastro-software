import { strToU8, zipSync } from "fflate";
import { csvSchreiben } from "@/lib/csv";
import { ladeEinstellungen } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";

type Zeile = Record<string, unknown>;

// Lädt alle Zeilen einer Tabelle, auch über die 1000er-Grenze der Datenbank-Schnittstelle hinaus.
async function alle(tabelle: string, spalten: string, restaurantId: string, sortierung: string): Promise<Zeile[]> {
  const db = await datenbank();
  const ergebnis: Zeile[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db
      .from(tabelle)
      .select(spalten)
      .eq("restaurant_id", restaurantId)
      .order(sortierung)
      .range(von, von + 999);
    if (error) throw new Error(error.message);
    const seite = (data ?? []) as unknown as Zeile[];
    ergebnis.push(...seite);
    if (seite.length < 1000) return ergebnis;
  }
}

// Gesamtexport des Restaurants als ZIP mit einer CSV-Datei je Tabelle. Nur für die Leitung.
export async function GET() {
  const ich = await leitungErforderlich();
  const { zeitzone } = await ladeEinstellungen(ich.restaurantId);
  const zeit = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zeitzone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const z = (wert: unknown) => (typeof wert === "string" && wert ? zeit.format(new Date(wert)) : "");
  const s = (wert: unknown) => (wert === null || wert === undefined ? "" : String(wert));
  const name = (verweis: unknown) => s((verweis as { name?: string } | null)?.name);

  const [gaeste, reservierungen, aufenthalte, warteliste, nachrichten, tische, zeiten, team] = await Promise.all([
    alle("gaeste", "name, telefon, email, geburtstag, vorlieben, notizen, allergien, allergien_einwilligung_am, erstellt_am", ich.restaurantId, "erstellt_am"),
    alle("reservierungen", "beginn, ende, status, quelle, gast_name, telefon, personen, anlass, notiz, abgesagt_vom_gast, erstellt_am, tische(name)", ich.restaurantId, "beginn"),
    alle("aufenthalte", "zimmer, anreise, abreise, gaeste(name)", ich.restaurantId, "anreise"),
    alle("warteliste", "datum, von, bis, gast_name, telefon, personen, status, notiz, erstellt_am", ich.restaurantId, "datum"),
    alle("nachrichten", "art, an, text, senden_ab, status", ich.restaurantId, "senden_ab"),
    alle("tische", "name, bereich, plaetze", ich.restaurantId, "erstellt_am"),
    alle("oeffnungszeiten", "wochentag, von, bis", ich.restaurantId, "wochentag"),
    alle("mitglieder", "anzeigename, email, rolle, darf_reservieren, erstellt_am", ich.restaurantId, "erstellt_am"),
  ]);

  const dateien: Record<string, Uint8Array> = {
    "gaeste.csv": strToU8(csvSchreiben(
      ["Name", "Telefon", "E-Mail", "Geburtstag", "Vorlieben", "Notizen", "Allergien", "Einwilligung Allergien am", "Angelegt am"],
      gaeste.map((g) => [s(g.name), s(g.telefon), s(g.email), s(g.geburtstag), s(g.vorlieben), s(g.notizen), s(g.allergien), z(g.allergien_einwilligung_am), z(g.erstellt_am)]),
    )),
    "reservierungen.csv": strToU8(csvSchreiben(
      ["Beginn", "Ende", "Tisch", "Name", "Telefon", "Personen", "Status", "Quelle", "Anlass", "Notiz", "Vom Gast abgesagt", "Eingetragen am"],
      reservierungen.map((r) => [z(r.beginn), z(r.ende), name(r.tische), s(r.gast_name), s(r.telefon), s(r.personen), s(r.status), s(r.quelle), s(r.anlass), s(r.notiz), Boolean(r.abgesagt_vom_gast), z(r.erstellt_am)]),
    )),
    "aufenthalte.csv": strToU8(csvSchreiben(
      ["Gast", "Zimmer", "Anreise", "Abreise"],
      aufenthalte.map((a) => [name(a.gaeste), s(a.zimmer), s(a.anreise), s(a.abreise)]),
    )),
    "warteliste.csv": strToU8(csvSchreiben(
      ["Datum", "Frühestens", "Spätestens", "Name", "Telefon", "Personen", "Status", "Notiz", "Eingetragen am"],
      warteliste.map((w) => [s(w.datum), s(w.von).slice(0, 5), s(w.bis).slice(0, 5), s(w.gast_name), s(w.telefon), s(w.personen), s(w.status), s(w.notiz), z(w.erstellt_am)]),
    )),
    "nachrichten.csv": strToU8(csvSchreiben(
      ["Art", "An", "Text", "Zeitpunkt", "Status"],
      nachrichten.map((n) => [s(n.art), s(n.an), s(n.text), z(n.senden_ab), s(n.status)]),
    )),
    "tische.csv": strToU8(csvSchreiben(["Tisch", "Bereich", "Plätze"], tische.map((t) => [s(t.name), s(t.bereich), s(t.plaetze)]))),
    "oeffnungszeiten.csv": strToU8(csvSchreiben(
      ["Wochentag (1 = Montag)", "Von", "Bis"],
      zeiten.map((o) => [s(o.wochentag), s(o.von).slice(0, 5), s(o.bis).slice(0, 5)]),
    )),
    "team.csv": strToU8(csvSchreiben(
      ["Name", "E-Mail", "Rolle", "Darf reservieren", "Dabei seit"],
      team.map((m) => [s(m.anzeigename), s(m.email), s(m.rolle), Boolean(m.darf_reservieren), z(m.erstellt_am)]),
    )),
    "LIESMICH.txt": strToU8(
      `Export von ${ich.restaurantName}, erstellt am ${zeit.format(new Date())} Uhr.\r\n\r\n` +
        "Jede Tabelle liegt als CSV-Datei bei (Trennzeichen Semikolon, Zeichensatz UTF-8). " +
        "Ein Doppelklick öffnet sie in Excel. Zeiten stehen in der Ortszeit des Restaurants.\r\n\r\n" +
        "Die Datei enthält personenbezogene Daten eurer Gäste. Bitte sicher aufbewahren und nicht weitergeben.\r\n",
    ),
  };

  const db = await datenbank();
  await db.rpc("protokoll_eintragen", { p_restaurant: ich.restaurantId, p_aktion: "export", p_details: `${gaeste.length} Gäste, ${reservierungen.length} Reservierungen` });

  const zip = zipSync(dateien);
  const datum = zeit.format(new Date()).slice(0, 10);
  return new Response(zip.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="gastro-export-${datum}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
