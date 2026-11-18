import { createHmac, timingSafeEqual } from "node:crypto";

// Prüft, ob eine Anfrage wirklich von Retell kommt.
// Kopfzeile X-Retell-Signature: "v=<Zeit in ms>,d=<HMAC-SHA256 in hex>".
// Signiert ist der unveränderte Text der Anfrage mit angehängter Zeit,
// Schlüssel ist der Retell-API-Schlüssel. Älter als 5 Minuten gilt nicht.
export function retellSignaturGueltig(rohtext: string, signatur: string | null, schluessel: string, jetzt = Date.now()): boolean {
  if (!signatur || !schluessel) return false;
  const treffer = /^v=(\d+),d=([0-9a-fA-F]+)$/.exec(signatur.trim());
  if (!treffer) return false;
  const [, zeit, wert] = treffer;
  if (Math.abs(jetzt - Number(zeit)) > 5 * 60 * 1000) return false;
  const erwartet = createHmac("sha256", schluessel).update(rohtext + zeit).digest();
  const erhalten = Buffer.from(wert, "hex");
  return erhalten.length === erwartet.length && timingSafeEqual(erhalten, erwartet);
}
