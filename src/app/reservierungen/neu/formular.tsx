"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { gaesteSuchen } from "@/app/gaeste/aktionen";
import { GastMarken } from "@/app/gaeste/marken";
import { feldKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/klassen";
import { reservierungAnlegen, type FormularZustand } from "@/app/reservierungen/aktionen";
import type { Durchgang, GastEintrag, Oeffnungszeit, Tisch } from "@/lib/daten";
import { texte } from "@/texte";

const minuten = (zeit: string) => Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
const zeitText = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function wochentagVon(datum: string) {
  const tag = new Date(`${datum}T12:00:00Z`).getUTCDay();
  return tag === 0 ? 7 : tag;
}

// Alle Viertelstunden, zu denen an diesem Datum geöffnet ist. Die letzte
// Reservierung beginnt eine halbe Stunde vor Schluss.
function freieZeiten(datum: string, zeiten: Oeffnungszeit[], alle: boolean) {
  const slots = new Set<number>();
  if (alle) {
    for (let m = 0; m < 1440; m += 15) slots.add(m);
  } else {
    const tag = wochentagVon(datum);
    const vortag = tag === 1 ? 7 : tag - 1;
    for (const z of zeiten) {
      const von = minuten(z.von);
      const bis = minuten(z.bis);
      const ueberMitternacht = bis <= von;
      if (z.wochentag === tag) {
        const ende = ueberMitternacht ? 1440 : bis - 30;
        for (let m = von; m <= ende && m < 1440; m += 15) slots.add(m);
      }
      // Der Rest eines Abends, der am Vortag begonnen hat.
      if (z.wochentag === vortag && ueberMitternacht) {
        for (let m = 0; m <= bis - 30; m += 15) slots.add(m);
      }
    }
  }
  return [...slots].sort((a, b) => a - b).map(zeitText);
}

export function ReservierungsFormular({
  startDatum,
  heute,
  oeffnungszeiten,
  durchgaenge,
  tische,
  mitDurchgaengen,
  mitTischen,
  startGast,
}: {
  startDatum: string;
  heute: string;
  oeffnungszeiten: Oeffnungszeit[];
  durchgaenge: Durchgang[];
  tische: Tisch[];
  mitDurchgaengen: boolean;
  mitTischen: boolean;
  startGast: GastEintrag | null;
}) {
  const t = texte();
  const f = t.reservierungen.formular;
  const [zustand, absenden, laeuft] = useActionState<FormularZustand, FormData>(reservierungAnlegen, { fehler: null });
  const [datum, setDatum] = useState(startDatum);
  const [ausserhalb, setAusserhalb] = useState(false);
  const [gast, setGast] = useState<GastEintrag | null>(startGast);
  const [name, setName] = useState("");
  const [telefon, setTelefon] = useState(startGast?.telefon ?? "");
  const [treffer, setTreffer] = useState<GastEintrag[]>([]);

  // Während der Eingabe von Name oder Telefon in der Kartei nachsehen.
  const suchbegriff = gast ? "" : telefon.replace(/\D/g, "").length >= 4 ? telefon : name.trim().length >= 2 ? name : "";
  useEffect(() => {
    if (!suchbegriff) return;
    let aktuell = true;
    const zeitgeber = setTimeout(async () => {
      const ergebnis = await gaesteSuchen(suchbegriff);
      if (aktuell) setTreffer(ergebnis);
    }, 300);
    return () => {
      aktuell = false;
      clearTimeout(zeitgeber);
    };
  }, [suchbegriff]);
  const sichtbareTreffer = suchbegriff ? treffer : [];

  const uebernehmen = (g: GastEintrag) => {
    setGast(g);
    setTelefon(g.telefon);
    setTreffer([]);
  };

  const zeiten = freieZeiten(datum, oeffnungszeiten, ausserhalb);
  const tag = wochentagVon(datum);
  const passendeDurchgaenge = durchgaenge.filter((d) => d.wochentag === null || d.wochentag === tag);
  // Vorschlag: 18:00 Uhr, wenn möglich, sonst die erste freie Zeit.
  const vorschlag = zeiten.includes("18:00") ? "18:00" : zeiten[0];

  return (
    <form action={absenden} className="space-y-5">
      {zustand.fehler && (
        <p role="alert" className="rounded-lg border border-warnrot/30 bg-warnrot-hell px-4 py-3 font-medium text-warnrot">
          {t.fehler[zustand.fehler]}
          {zustand.warteliste && (
            <Link href={zustand.warteliste} className="mt-2 block font-semibold underline underline-offset-4">
              {t.wartelisteSeite.voll}
            </Link>
          )}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block font-medium">
          {f.datum}
          <input type="date" name="datum" required min={heute} value={datum} onChange={(e) => setDatum(e.target.value)} className={`${feldKlasse} ziffern`} />
        </label>

        {mitDurchgaengen ? (
          <label className="block font-medium">
            {f.durchgang}
            <select name="durchgang" required className={`${feldKlasse} ziffern`} key={datum}>
              {passendeDurchgaenge.length === 0 && <option value="">{f.keinDurchgang}</option>}
              {passendeDurchgaenge.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.von}–{d.bis} {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block font-medium">
            {f.uhrzeit}
            <select name="uhrzeit" required defaultValue={vorschlag} className={`${feldKlasse} ziffern`} key={`${datum}-${ausserhalb}`}>
              {zeiten.length === 0 && <option value="">{f.keineZeiten}</option>}
              {zeiten.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block font-medium">
          {f.personen}
          <input type="number" name="personen" required min={1} max={500} defaultValue={2} inputMode="numeric" className={`${feldKlasse} ziffern`} />
        </label>
      </div>

      {gast ? (
        <div className="rounded-xl border border-tafel/30 bg-tafel-hell/60 p-4">
          <input type="hidden" name="gast" value={gast.id} />
          <input type="hidden" name="name" value={gast.name} />
          <p className="text-sm text-stift">{f.gastGewaehlt}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-semibold">{gast.name}</span>
            <GastMarken besuche={gast.besuche} zimmer={gast.zimmer} allergien={gast.allergien} />
          </div>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block font-medium">
              {f.telefon} <span className="font-normal text-stift">({f.optional})</span>
              <input name="telefon" type="tel" maxLength={40} value={telefon} onChange={(e) => setTelefon(e.target.value)} autoComplete="off" className={`${feldKlasse} ziffern`} />
            </label>
            <button
              type="button"
              onClick={() => {
                setGast(null);
                setTelefon("");
              }}
              className={`${knopfZweitKlasse} py-3`}
            >
              {f.anderenGast}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block font-medium">
              {f.name}
              <input name="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={feldKlasse} />
            </label>
            <label className="block font-medium">
              {f.telefon} <span className="font-normal text-stift">({f.optional})</span>
              <input name="telefon" type="tel" maxLength={40} value={telefon} onChange={(e) => setTelefon(e.target.value)} autoComplete="off" className={`${feldKlasse} ziffern`} />
            </label>
          </div>
          {sichtbareTreffer.length > 0 && (
            <div className="mt-3 rounded-xl border border-linie bg-kreide p-3" aria-live="polite">
              <p className="mb-2 px-1 text-sm font-semibold text-stift">{f.gastSuche}</p>
              <ul className="space-y-2">
                {sichtbareTreffer.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-papier px-3 py-2">
                    <span className="min-w-0">
                      <span className="mr-2 font-semibold">{g.name}</span>
                      <span className="ziffern text-stift">{g.telefon}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <GastMarken besuche={g.besuche} zimmer={g.zimmer} allergien={g.allergien} />
                      </span>
                    </span>
                    <button type="button" onClick={() => uebernehmen(g)} className={`${knopfZweitKlasse} px-4 py-2`}>
                      {f.gastWaehlen}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mitTischen && (
        <label className="block font-medium">
          {f.tisch}
          <select name="tisch" defaultValue="" className={feldKlasse}>
            <option value="">{f.tischAutomatisch}</option>
            {tische.map((tisch) => (
              <option key={tisch.id} value={tisch.id}>
                {tisch.name} ({tisch.plaetze} {f.plaetze}
                {tisch.bereich ? `, ${tisch.bereich}` : ""})
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block font-medium">
          {f.anlass} <span className="font-normal text-stift">({f.optional})</span>
          <input name="anlass" maxLength={80} className={feldKlasse} />
        </label>
        <label className="block font-medium">
          {f.notiz} <span className="font-normal text-stift">({f.optional})</span>
          <input name="notiz" maxLength={500} className={feldKlasse} />
        </label>
      </div>

      {!mitDurchgaengen && (
        <label className="flex items-start gap-3">
          <input type="checkbox" name="ausserhalb" checked={ausserhalb} onChange={(e) => setAusserhalb(e.target.checked)} className="mt-1 h-5 w-5 accent-tafel" />
          <span>
            <span className="block font-medium">{f.ausserhalb}</span>
            <span className="block text-sm text-stift">{f.ausserhalbHinweis}</span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <button disabled={laeuft} className={`${knopfKlasse} px-6 py-3.5 text-lg disabled:opacity-60`}>
          {f.speichern}
        </button>
        <Link href={`/reservierungen?datum=${datum}`} className={`${knopfZweitKlasse} px-6 py-3.5 text-lg`}>
          {f.abbrechen}
        </Link>
      </div>
    </form>
  );
}
