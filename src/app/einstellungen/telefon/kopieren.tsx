"use client";

import { useState } from "react";

// Kasten mit Text und Knopf zum Kopieren, zum Beispiel für die Einrichtung bei Retell.
export function KopierKasten({ titel, inhalt, knopf, kopiert }: { titel: string; inhalt: string; knopf: string; kopiert: string }) {
  const [fertig, setFertig] = useState(false);
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{titel}</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inhalt);
              setFertig(true);
              setTimeout(() => setFertig(false), 2000);
            } catch {
              // Ohne Zugriff auf die Zwischenablage kann man den Text markieren.
            }
          }}
          className="rounded-md border border-linie bg-papier px-3 py-1 text-sm font-medium hover:border-tafel"
        >
          <span aria-live="polite">{fertig ? kopiert : knopf}</span>
        </button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-linie bg-kreide p-3 text-sm leading-relaxed">{inhalt}</pre>
    </div>
  );
}
