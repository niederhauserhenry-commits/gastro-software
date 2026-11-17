"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { gastSpeichern, type GastZustand } from "@/app/gaeste/aktionen";
import { feldKlasse, knopfKlasse, knopfZweitKlasse } from "@/app/klassen";
import type { Gast } from "@/lib/daten";
import { texte } from "@/texte";

export function GastFormular({ gast, abbrechenZiel }: { gast: Gast | null; abbrechenZiel: string }) {
  const t = texte();
  const f = t.gaeste.formular;
  const [zustand, absenden, laeuft] = useActionState<GastZustand, FormData>(gastSpeichern, { fehler: null });
  const [allergien, setAllergien] = useState(gast?.allergien ?? "");
  const optional = <span className="font-normal text-stift">({f.optional})</span>;

  return (
    <form action={absenden} className="space-y-5">
      {gast && <input type="hidden" name="id" value={gast.id} />}
      {zustand.fehler && (
        <p role="alert" className="rounded-lg border border-warnrot/30 bg-warnrot-hell px-4 py-3 font-medium text-warnrot">
          {t.fehler[zustand.fehler]}
        </p>
      )}

      <label className="block font-medium">
        {f.name}
        <input name="name" required maxLength={80} defaultValue={gast?.name} autoComplete="off" className={feldKlasse} />
      </label>

      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block font-medium">
          {f.telefon} {optional}
          <input name="telefon" type="tel" maxLength={40} defaultValue={gast?.telefon} autoComplete="off" className={`${feldKlasse} ziffern`} />
        </label>
        <label className="block font-medium">
          {f.email} {optional}
          <input name="email" type="email" maxLength={120} defaultValue={gast?.email} autoComplete="off" className={feldKlasse} />
        </label>
        <label className="block font-medium">
          {f.geburtstag} {optional}
          <input name="geburtstag" type="date" defaultValue={gast?.geburtstag ?? ""} className={`${feldKlasse} ziffern`} />
        </label>
      </div>

      <label className="block font-medium">
        {f.vorlieben} {optional}
        <textarea name="vorlieben" rows={2} maxLength={500} defaultValue={gast?.vorlieben} className={feldKlasse} />
      </label>
      <label className="block font-medium">
        {f.notizen} {optional}
        <textarea name="notizen" rows={3} maxLength={1000} defaultValue={gast?.notizen} className={feldKlasse} />
      </label>

      <fieldset className="rounded-xl border border-warnrot/25 bg-warnrot-hell/40 p-4">
        <legend className="px-1 font-semibold">{f.allergien}</legend>
        <p className="mb-3 text-sm text-stift">{f.einwilligungHinweis}</p>
        <label className="block">
          <span className="sr-only">{f.allergien}</span>
          <input
            name="allergien"
            maxLength={300}
            value={allergien}
            onChange={(e) => setAllergien(e.target.value)}
            autoComplete="off"
            className={feldKlasse}
          />
        </label>
        {allergien.trim() !== "" && (
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              name="einwilligung"
              defaultChecked={Boolean(gast?.einwilligungAm)}
              className="mt-1 h-5 w-5 accent-tafel"
            />
            <span className="font-medium">{f.einwilligung}</span>
          </label>
        )}
      </fieldset>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <button disabled={laeuft} className={`${knopfKlasse} px-6 py-3.5 text-lg disabled:opacity-60`}>
          {f.speichern}
        </button>
        <Link href={abbrechenZiel} className={`${knopfZweitKlasse} px-6 py-3.5 text-lg`}>
          {f.abbrechen}
        </Link>
      </div>
    </form>
  );
}
