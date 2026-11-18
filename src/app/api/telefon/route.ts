import { createServerClient } from "@supabase/ssr";
import { retellSignaturGueltig } from "@/lib/retell";

// Schnittstelle für die Telefon-KI (Retell).
// Retell ruft während des Gesprächs drei Funktionen auf:
//   restaurant_info          Name, heutiges Datum, Öffnungszeiten, Hinweise
//   verfuegbarkeit_pruefen   ist zur Wunschzeit frei, sonst Alternativen
//   reservierung_anlegen     bucht verbindlich
// Jede Anfrage braucht eine gültige Retell-Signatur und den Schlüssel des
// Restaurants in der Adresse (?k=…). Die Antwort enthält einen Satz für die KI.

type Args = Record<string, unknown>;
type Ergebnis = Record<string, unknown> & { ergebnis?: string };

function db() {
  // Ohne Anmeldung: Die Datenbank prüft den Schlüssel selbst.
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

const text = (wert: unknown, max = 120) => (typeof wert === "string" ? wert.trim().slice(0, max) : "");
const datum = (wert: unknown) => (typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert.trim()) ? wert.trim() : null);
const uhrzeit = (wert: unknown) => {
  const t = typeof wert === "string" ? /^(\d{1,2})[:.](\d{2})/.exec(wert.trim()) : null;
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  return `${t[1].padStart(2, "0")}:${t[2]}`;
};
const personen = (wert: unknown) => {
  const n = typeof wert === "number" ? wert : Number.parseInt(String(wert ?? ""), 10);
  return Number.isInteger(n) && n > 0 && n < 500 ? n : null;
};
const deutschesDatum = (iso: string) => {
  const [j, m, t] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(j, m - 1, t)));
};
const liste = (zeiten: unknown) => (Array.isArray(zeiten) ? zeiten.map((z) => `${z} Uhr`).join(", ") : "");

// Ein Satz für die KI, damit sie dem Gast natürlich antworten kann.
function hinweis(e: Ergebnis, tag: string | null): string {
  const am = tag ? `am ${deutschesDatum(tag)}` : "an diesem Tag";
  switch (e.ergebnis) {
    case "frei":
      return `Um ${e.uhrzeit} Uhr ${am} ist ein Tisch frei. Frag nach Namen und Telefonnummer und buche dann.`;
    case "wunschzeit_belegt":
      return `Zur Wunschzeit ist ${am} leider nichts frei. Frei wäre: ${liste(e.alternativen)}. Biete das an.`;
    case "freie_zeiten":
      return `${am[0].toUpperCase()}${am.slice(1)} ist frei um: ${liste(e.zeiten)}. Nenne höchstens drei passende Zeiten.`;
    case "ausgebucht":
      return `${am[0].toUpperCase()}${am.slice(1)} ist für diese Personenzahl leider alles ausgebucht. Biete einen anderen Tag an.`;
    case "geschlossen":
      return `${am[0].toUpperCase()}${am.slice(1)} hat das Restaurant geschlossen. Biete einen anderen Tag an.`;
    case "gruppe_zu_gross":
      return `Gruppen über ${e.max_personen} Personen kann ich am Telefon nicht buchen. Sag, dass sich das Team mit einem Angebot meldet, und nimm Name, Telefonnummer, Datum und Personenzahl als Rückrufbitte auf. Buche nichts.`;
    case "datum_vergangen":
      return "Dieses Datum liegt in der Vergangenheit. Frag noch einmal nach dem Tag.";
    case "zu_weit_voraus":
      return "So weit im Voraus kann ich nicht buchen, höchstens ein Jahr. Bitte an das Team verweisen.";
    case "personen_fehlen":
      return "Frag, für wie viele Personen reserviert werden soll.";
    case "name_fehlt":
      return "Frag nach dem Namen, auf den reserviert werden soll.";
    case "telefon_fehlt":
      return "Frag nach einer Telefonnummer für Rückfragen.";
    case "gerade_vergeben":
      return `Der Tisch wurde gerade eben vergeben. Frei wäre noch: ${liste(e.alternativen) || "leider nichts"}.`;
    case "zu_viele_buchungen":
      return "Gerade kann ich keine weiteren Buchungen annehmen. Bitte den Gast, es später noch einmal zu versuchen oder direkt mit dem Team zu sprechen.";
    case "gebucht":
      return `Gebucht: ${e.personen} Personen ${am} um ${e.uhrzeit} Uhr auf den Namen ${e.name}. Bestätige das dem Gast und sag, dass eine Bestätigung per SMS kommt.`;
    default:
      return "";
  }
}

const antwort = (inhalt: Record<string, unknown>, status = 200) =>
  Response.json(inhalt, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(anfrage: Request) {
  const apiSchluessel = process.env.RETELL_API_KEY ?? "";
  if (!apiSchluessel) return antwort({ fehler: "Telefon-KI ist noch nicht eingerichtet." }, 503);

  const rohtext = await anfrage.text();
  if (rohtext.length > 100_000 || !retellSignaturGueltig(rohtext, anfrage.headers.get("x-retell-signature"), apiSchluessel)) {
    return antwort({ fehler: "Ungültige Signatur." }, 401);
  }

  const url = new URL(anfrage.url);
  const k = url.searchParams.get("k") ?? "";
  let koerper: { name?: unknown; args?: unknown; call?: { from_number?: unknown } } & Args;
  try {
    koerper = JSON.parse(rohtext);
  } catch {
    return antwort({ fehler: "Ungültige Anfrage." }, 400);
  }
  // Retell schickt {name, args, call} oder, mit "nur Argumente", die Argumente direkt.
  const name = text(koerper.name) || url.searchParams.get("f") || "";
  const args: Args = koerper.args && typeof koerper.args === "object" ? (koerper.args as Args) : koerper;
  const anrufer = text(koerper.call?.from_number, 40);

  try {
    if (name === "restaurant_info") {
      const { data, error } = await db().rpc("telefon_info", { p_schluessel: k });
      if (error) return antwort({ fehler: "Telefon-KI ist für dieses Restaurant ausgeschaltet." }, 403);
      return antwort(data as Record<string, unknown>);
    }

    if (name === "verfuegbarkeit_pruefen") {
      const tag = datum(args.datum);
      const { data, error } = await db().rpc("telefon_anfrage", {
        p_schluessel: k, p_datum: tag, p_uhrzeit: uhrzeit(args.uhrzeit), p_personen: personen(args.personen),
      });
      if (error) return antwort({ fehler: "Telefon-KI ist für dieses Restaurant ausgeschaltet." }, 403);
      const e = data as Ergebnis;
      return antwort({ ...e, hinweis: tag ? hinweis(e, tag) : "Frag nach dem Datum." });
    }

    if (name === "reservierung_anlegen") {
      const tag = datum(args.datum);
      const zeit = uhrzeit(args.uhrzeit);
      const anzahl = personen(args.personen);
      if (!tag || !zeit || !anzahl) {
        return antwort({ ergebnis: "angaben_fehlen", hinweis: "Datum, Uhrzeit und Personenzahl werden gebraucht. Frag nach dem, was fehlt." });
      }
      const { data, error } = await db().rpc("telefon_buchen", {
        p_schluessel: k, p_datum: tag, p_uhrzeit: zeit, p_personen: anzahl,
        p_name: text(args.name, 80),
        p_telefon: text(args.telefon, 40) || anrufer,
        p_anlass: text(args.anlass, 120),
        p_notiz: text(args.notiz, 300),
      });
      if (error) return antwort({ fehler: "Telefon-KI ist für dieses Restaurant ausgeschaltet." }, 403);
      const e = data as Ergebnis;
      return antwort({ ...e, hinweis: hinweis(e, tag) });
    }

    return antwort({ fehler: `Unbekannte Funktion: ${name || "(ohne Namen)"}` }, 400);
  } catch {
    return antwort({ fehler: "Technischer Fehler. Bitte den Gast an das Team verweisen." }, 500);
  }
}
