// CSV lesen und schreiben, passend für Excel in Deutschland (Semikolon, UTF-8 mit BOM).

export function csvLesen(text: string): string[][] {
  const inhalt = text.replace(/^﻿/, "");
  const ersteZeile = inhalt.split(/\r?\n/, 1)[0] ?? "";
  const trenner = [";", "\t", ","].sort((a, b) => ersteZeile.split(b).length - ersteZeile.split(a).length)[0];
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = "";
  let inAnfuehrung = false;
  for (let i = 0; i < inhalt.length; i++) {
    const z = inhalt[i];
    if (inAnfuehrung) {
      if (z === '"' && inhalt[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (z === '"') {
        inAnfuehrung = false;
      } else {
        feld += z;
      }
    } else if (z === '"') {
      inAnfuehrung = true;
    } else if (z === trenner) {
      zeile.push(feld);
      feld = "";
    } else if (z === "\n" || z === "\r") {
      if (z === "\r" && inhalt[i + 1] === "\n") i++;
      zeile.push(feld);
      if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
      zeile = [];
      feld = "";
    } else {
      feld += z;
    }
  }
  zeile.push(feld);
  if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
  return zeilen;
}

type Zelle = string | number | boolean | null | undefined;

// Zellen, die Excel als Formel deuten würde, werden entschärft.
function zelle(wert: Zelle): string {
  if (wert === null || wert === undefined) return "";
  let s = typeof wert === "boolean" ? (wert ? "ja" : "nein") : String(wert);
  if (/^[=@]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()./-]*$/.test(s))) s = `'${s}`;
  return /[";\r\n]|^\s|\s$/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function csvSchreiben(kopf: string[], zeilen: Zelle[][]): string {
  return "﻿" + [kopf, ...zeilen].map((z) => z.map(zelle).join(";")).join("\r\n") + "\r\n";
}

// Ordnet die Spalten einer Gästeliste aus einem anderen Programm zu.
const spalten = {
  name: ["name", "gast", "gastname", "kunde", "kundenname"],
  vorname: ["vorname", "firstname"],
  nachname: ["nachname", "familienname", "lastname"],
  telefon: ["telefon", "tel", "telefonnummer", "handy", "mobil", "mobilnummer", "phone", "telefonmobil", "rufnummer"],
  email: ["email", "mail", "emailadresse"],
  geburtstag: ["geburtstag", "geburtsdatum", "geboren", "birthday"],
  notizen: ["notiz", "notizen", "bemerkung", "bemerkungen", "info", "kommentar", "hinweis"],
} as const;

const ohneZeichen = (s: string) => s.toLowerCase().replace(/[^a-zäöüß]/g, "").replace("ä", "ae");

function datum(wert: string): string {
  const w = wert.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(w);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(w);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export type ImportGast = { name: string; telefon: string; email: string; geburtstag: string; notizen: string };

export function gaesteAusCsv(text: string): { gaeste: ImportGast[]; spaltenGefunden: boolean } {
  const [kopf, ...daten] = csvLesen(text);
  if (!kopf) return { gaeste: [], spaltenGefunden: false };
  const index = (namen: readonly string[]) => kopf.findIndex((k) => namen.includes(ohneZeichen(k)));
  const i = Object.fromEntries(Object.entries(spalten).map(([k, v]) => [k, index(v)])) as Record<keyof typeof spalten, number>;
  if (i.name < 0 && i.nachname < 0) return { gaeste: [], spaltenGefunden: false };
  const wert = (zeile: string[], spalte: number) => (spalte >= 0 ? (zeile[spalte] ?? "").trim() : "");
  const gaeste = daten.map((z) => ({
    name: i.name >= 0 ? wert(z, i.name) : [wert(z, i.vorname), wert(z, i.nachname)].filter(Boolean).join(" "),
    telefon: wert(z, i.telefon),
    email: wert(z, i.email),
    geburtstag: datum(wert(z, i.geburtstag)),
    notizen: wert(z, i.notizen),
  }));
  return { gaeste, spaltenGefunden: true };
}
