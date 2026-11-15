import { texte } from "@/texte";
import type { FehlerCode } from "@/texte/de";

const bekannte = Object.keys(texte().fehler) as FehlerCode[];

// Übersetzt eine Fehlermeldung aus der Datenbank in einen unserer Fehlercodes.
export function fehlerCode(meldung: string | undefined): FehlerCode {
  if (!meldung) return "UNBEKANNT";
  const treffer = bekannte.find((code) => meldung.includes(code));
  return treffer ?? "UNBEKANNT";
}

// Liefert den Text zu einem Fehlercode aus der Adresszeile (?fehler=...).
export function fehlerText(code: string | string[] | undefined): string | null {
  if (typeof code !== "string") return null;
  const t = texte().fehler;
  return bekannte.includes(code as FehlerCode) ? t[code as FehlerCode] : t.UNBEKANNT;
}
