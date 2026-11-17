import { gastStufe } from "@/lib/gaststufe";
import { texte } from "@/texte";

// Kleine Kennzeichen eines Gastes: Stammgast, Hausgast mit Zimmer, Allergie.
// "nurWichtige" lässt "Neu" weg, damit Listen im Service ruhig bleiben.
export function GastMarken({
  besuche,
  zimmer,
  allergien,
  nurWichtige = false,
}: {
  besuche: number;
  zimmer: string;
  allergien: string;
  nurWichtige?: boolean;
}) {
  const t = texte().gaeste;
  const stufe = gastStufe(besuche);
  const marke = "inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold";
  return (
    <>
      {stufe === "stammgast" && <span className={`${marke} bg-senf text-tinte`}>{t.stufe.stammgast}</span>}
      {stufe === "wiederkehrend" && <span className={`${marke} bg-tafel-hell text-tafel-tief`}>{t.stufe.wiederkehrend}</span>}
      {stufe === "neu" && !nurWichtige && <span className={`${marke} bg-kreide text-stift`}>{t.stufe.neu}</span>}
      {zimmer && (
        <span className={`${marke} bg-tafel text-white`}>
          {t.zimmer} {zimmer}
        </span>
      )}
      {allergien && (
        <span className={`${marke} border border-warnrot/40 bg-warnrot-hell text-warnrot`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="mr-1 h-4 w-4" fill="currentColor">
            <path d="M10 2.5 1.8 17h16.4L10 2.5Zm0 4.3 1 .1-.3 5.6H9.3L9 6.9l1-.1Zm0 7.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          </svg>
          {t.allergie}: {allergien}
        </span>
      )}
    </>
  );
}
