import type { Oeffnungszeit } from "@/lib/daten";
import { texte } from "@/texte";

const minuten = (zeit: string) => Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));

// Wochentag (1 = Montag) und Minuten seit Mitternacht in der Zeitzone des Restaurants.
export function jetztImRestaurant(zeitzone: string, jetzt = new Date()) {
  const teile = new Intl.DateTimeFormat("en-GB", {
    timeZone: zeitzone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(jetzt);
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  const tage = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    wochentag: tage.indexOf(wert("weekday")) + 1,
    minuten: Number(wert("hour")) * 60 + Number(wert("minute")),
  };
}

// Zeigt die heutigen Öffnungszeiten als Leiste mit einer Markierung für "jetzt".
// Hier kommen später auch die Reservierungen des Tages hinein.
export function Tagesleiste({
  zeiten,
  wochentag,
  jetztMinuten,
  hatZeiten,
}: {
  zeiten: Oeffnungszeit[];
  wochentag: number;
  jetztMinuten: number;
  hatZeiten: boolean;
}) {
  const t = texte().startseite;
  const bloecke = zeiten
    .filter((z) => z.wochentag === wochentag)
    .map((z) => {
      const von = minuten(z.von);
      const bis = minuten(z.bis);
      // "bis" vor "von" bedeutet: läuft über Mitternacht.
      return { von, bis: bis > von ? bis : bis + 1440, vonText: z.von, bisText: z.bis };
    })
    .sort((a, b) => a.von - b.von);

  if (bloecke.length === 0) {
    return (
      <p className="text-xl font-semibold">{hatZeiten ? t.heuteGeschlossen : t.keineZeiten}</p>
    );
  }

  const offen = bloecke.find((b) => jetztMinuten >= b.von && jetztMinuten < b.bis);
  const naechster = bloecke.find((b) => b.von > jetztMinuten);
  const status = offen
    ? `${t.jetztGeoeffnetBis} ${offen.bisText} ${t.uhr}`
    : naechster
      ? `${t.oeffnetUm} ${naechster.vonText} ${t.uhr}`
      : t.heuteVorbei;

  // Sichtbarer Bereich: eine Stunde vor dem ersten bis eine Stunde nach dem letzten Block.
  const start = Math.floor((bloecke[0].von - 60) / 60) * 60;
  const ende = Math.ceil((Math.max(...bloecke.map((b) => b.bis)) + 60) / 60) * 60;
  const spanne = ende - start;
  const prozent = (m: number) => `${((m - start) / spanne) * 100}%`;
  const stunden: number[] = [];
  const schritt = spanne > 600 ? 120 : 60;
  for (let m = Math.ceil(start / schritt) * schritt; m <= ende; m += schritt) stunden.push(m);
  const jetztSichtbar = jetztMinuten >= start && jetztMinuten <= ende;

  return (
    <div>
      <p className="text-xl font-semibold">
        <span
          aria-hidden="true"
          className={`mr-2.5 inline-block h-3 w-3 rounded-full ${offen ? "bg-senf" : "bg-linie"}`}
        />
        {status}
      </p>

      <p className="ziffern mb-4 mt-1 text-stift">
        {bloecke.map((b) => `${b.vonText}–${b.bisText}`).join(" und ")} {t.uhr}
      </p>

      <div role="img" aria-label={`${t.tagesleiste}: ${bloecke.map((b) => `${b.vonText} bis ${b.bisText}`).join(", ")}`}>
        <div className="relative h-12 rounded-md bg-kreide">
          {bloecke.map((b) => (
            <div
              key={b.von}
              className="ziffern absolute inset-y-0 flex items-center overflow-hidden rounded-md bg-tafel px-2.5 text-sm font-semibold text-white"
              style={{ left: prozent(b.von), width: `${((b.bis - b.von) / spanne) * 100}%` }}
            >
              {/* Die Uhrzeit steht nur im Block, wenn er breit genug dafür ist. */}
              {(b.bis - b.von) / spanne > 0.3 && (
                <span className="truncate">
                  {b.vonText}–{b.bisText}
                </span>
              )}
            </div>
          ))}
          {jetztSichtbar && (
            <div className="absolute -inset-y-1.5 w-1 -translate-x-1/2 rounded-full bg-senf" style={{ left: prozent(jetztMinuten) }} />
          )}
        </div>
        <div className="ziffern relative mt-1.5 h-5 text-xs text-stift">
          {stunden.map((m, index) => (
            <span
              key={m}
              className={`absolute ${index === 0 ? "" : index === stunden.length - 1 && m === ende ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: prozent(m) }}
            >
              {String(Math.floor(m / 60) % 24).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
