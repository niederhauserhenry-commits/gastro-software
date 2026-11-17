"use client";

import { useState } from "react";
import { feldKlasse } from "@/app/klassen";
import { texte } from "@/texte";

// Textfeld für eine SMS-Vorlage mit Live-Vorschau und Zeichenzähler.
export function VorlagenFeld({
  name,
  titel,
  startwert,
  restaurant,
}: {
  name: string;
  titel: string;
  startwert: string;
  restaurant: string;
}) {
  const t = texte().nachrichten;
  const [wert, setWert] = useState(startwert);
  const vorschau = wert
    .replaceAll("{restaurant}", restaurant)
    .replaceAll("{name}", t.beispielName)
    .replaceAll("{datum}", "21.11.")
    .replaceAll("{uhrzeit}", "19:00")
    .replaceAll("{personen}", "2")
    .replaceAll("{link}", "https://gastro-software.vercel.app/r/3f9a1c07b2d4");
  const zuLang = vorschau.length > 160;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="block font-medium">
        {titel}
        <textarea
          name={name}
          required
          minLength={10}
          maxLength={300}
          rows={4}
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          className={feldKlasse}
        />
      </label>
      <div>
        <p className="font-medium">{t.vorschau}</p>
        {/* Sprechblase wie auf dem Handy des Gastes */}
        <div className="mt-1.5 rounded-2xl rounded-bl-sm bg-kreide px-4 py-3 text-[15px] leading-snug">{vorschau}</div>
        <p className={`ziffern mt-1.5 text-sm ${zuLang ? "font-semibold text-senf-tief" : "text-stift"}`}>
          {vorschau.length} {t.zeichen}
          {zuLang && `. ${t.zweiSms}`}
        </p>
      </div>
    </div>
  );
}
