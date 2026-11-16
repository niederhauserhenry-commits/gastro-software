import type { Oeffnungszeit, Reservierung, Tisch } from "@/lib/daten";
import { istAktiv } from "@/lib/daten";
import { texte } from "@/texte";

const minuten = (zeit: string) => Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));

// Zeitleiste des Tages: eine Zeile je Tisch, Reservierungen als Balken.
// So sieht das Team auf einen Blick, wann welcher Tisch frei ist.
export function Tischplan({
  tische,
  reservierungen,
  zeiten,
  wochentag,
  jetztMinuten,
}: {
  tische: Tisch[];
  reservierungen: Reservierung[];
  zeiten: Oeffnungszeit[];
  wochentag: number;
  // Nur gesetzt, wenn der angezeigte Tag heute ist.
  jetztMinuten: number | null;
}) {
  const t = texte().reservierungen;
  const aktive = reservierungen.filter(istAktiv);

  // Sichtbarer Bereich: Öffnungszeiten des Tages, erweitert um alle Reservierungen.
  const bloecke = zeiten
    .filter((z) => z.wochentag === wochentag)
    .map((z) => {
      const von = minuten(z.von);
      const bis = minuten(z.bis);
      return { von, bis: bis > von ? bis : bis + 1440 };
    });
  let start = Math.min(...bloecke.map((b) => b.von), ...aktive.map((r) => r.vonMinuten), bloecke.length ? Infinity : 660);
  let ende = Math.max(...bloecke.map((b) => b.bis), ...aktive.map((r) => r.bisMinuten), bloecke.length ? -Infinity : 1380);
  start = Math.floor(start / 60) * 60;
  ende = Math.min(Math.ceil(ende / 60) * 60, start + 1440);
  const spanne = ende - start;
  const prozent = (m: number) => `${(Math.min(Math.max(m, start), ende) - start) / spanne * 100}%`;
  const breite = (von: number, bis: number) =>
    `${((Math.min(bis, ende) - Math.max(von, start)) / spanne) * 100}%`;
  const stunden: number[] = [];
  for (let m = start; m <= ende; m += 60) stunden.push(m);

  // Tische nach Bereich gruppieren.
  const gruppen = new Map<string, Tisch[]>();
  for (const tisch of tische) gruppen.set(tisch.bereich, [...(gruppen.get(tisch.bereich) ?? []), tisch]);

  return (
    <div className="overflow-x-auto rounded-xl border border-linie bg-papier">
      <div className="min-w-[44rem] p-4 sm:p-5">
        {/* Stundenleiste */}
        <div className="ml-28 mr-2">
          <div className="ziffern relative h-5 text-xs text-stift">
            {stunden.map((m) => (
              <span key={m} className="absolute -translate-x-1/2" style={{ left: prozent(m) }}>
                {String(Math.floor(m / 60) % 24).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        {[...gruppen.entries()].map(([bereich, liste]) => (
          <div key={bereich || "ohne"} className="mt-2">
            {gruppen.size > 1 && <p className="mb-1 mt-3 text-sm font-semibold text-stift">{bereich || "–"}</p>}
            {liste.map((tisch) => (
              <div key={tisch.id} className="flex items-center border-t border-linie/70">
                <div className="sticky left-0 z-10 w-28 shrink-0 bg-papier py-2 pr-2">
                  <span className="block truncate font-semibold leading-tight">{tisch.name}</span>
                  <span className="ziffern block text-xs text-stift">
                    {tisch.plaetze} {t.formular.plaetze}
                  </span>
                </div>
                <div className="relative mr-2 h-11 flex-1">
                  {/* Senkrechte Stundenlinien */}
                  {stunden.map((m) => (
                    <span key={m} className="absolute inset-y-0 w-px bg-linie/60" style={{ left: prozent(m) }} />
                  ))}
                  {/* Geschlossene Zeiten leicht abgedunkelt */}
                  {bloecke.length > 0 && <Geschlossen bloecke={bloecke} start={start} ende={ende} />}
                  {aktive
                    .filter((r) => r.tischId === tisch.id)
                    .map((r) => (
                      <div
                        key={r.id}
                        title={`${r.von}–${r.bis} ${r.gastName}, ${r.personen} ${t.personen}`}
                        className={`absolute inset-y-1 overflow-hidden rounded-md px-2 text-sm leading-9 ${
                          r.status === "angekommen" ? "bg-senf font-semibold text-tinte" : "bg-tafel font-medium text-white"
                        }`}
                        style={{ left: prozent(r.vonMinuten), width: breite(r.vonMinuten, r.bisMinuten) }}
                      >
                        <span className="block truncate">
                          {r.gastName} <span className="ziffern opacity-80">({r.personen})</span>
                        </span>
                      </div>
                    ))}
                  {jetztMinuten !== null && jetztMinuten >= start && jetztMinuten <= ende && (
                    <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-warnrot" style={{ left: prozent(jetztMinuten) }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Schraffiert die Zeiten, in denen geschlossen ist.
function Geschlossen({ bloecke, start, ende }: { bloecke: { von: number; bis: number }[]; start: number; ende: number }) {
  const sortiert = [...bloecke].sort((a, b) => a.von - b.von);
  const luecken: { von: number; bis: number }[] = [];
  let zeiger = start;
  for (const b of sortiert) {
    if (b.von > zeiger) luecken.push({ von: zeiger, bis: b.von });
    zeiger = Math.max(zeiger, b.bis);
  }
  if (zeiger < ende) luecken.push({ von: zeiger, bis: ende });
  const spanne = ende - start;
  return (
    <>
      {luecken.map((l) => (
        <span
          key={l.von}
          className="absolute inset-y-0 bg-kreide"
          style={{ left: `${((l.von - start) / spanne) * 100}%`, width: `${((l.bis - l.von) / spanne) * 100}%` }}
        />
      ))}
    </>
  );
}
