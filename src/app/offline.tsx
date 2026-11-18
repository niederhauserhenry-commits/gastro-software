"use client";

import { useEffect, useSyncExternalStore } from "react";
import { abmelden } from "@/app/aktionen";
import { texte } from "@/texte";

const SEITEN_SPEICHER = "gastro-seiten-v1";

// Meldet den Service Worker an. Im Entwicklungsmodus nur auf ausdrücklichen Wunsch,
// damit alte Seitenstände beim Programmieren nicht stören.
export function ServiceWorkerAnmelden() {
  useEffect(() => {
    const erlaubt = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_TEST === "1";
    if (erlaubt && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return null;
}

function abonnieren(rueckruf: () => void) {
  window.addEventListener("online", rueckruf);
  window.addEventListener("offline", rueckruf);
  return () => {
    window.removeEventListener("online", rueckruf);
    window.removeEventListener("offline", rueckruf);
  };
}

// Hinweis am unteren Rand, solange keine Verbindung besteht.
// "stand" ist die Uhrzeit, zu der die angezeigte Seite erzeugt wurde.
export function OfflineHinweis({ stand }: { stand: string }) {
  const online = useSyncExternalStore(abonnieren, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 bg-senf px-4 py-3 text-center font-semibold text-tinte shadow-lg">
      {texte().offline.hinweis.replace("{zeit}", stand)}
    </div>
  );
}

// Abmelden löscht vorher die gespeicherten Seiten, damit auf einem geteilten
// Gerät niemand Gästedaten aus dem Zwischenspeicher sehen kann.
export function AbmeldeFormular({ className, text }: { className: string; text: string }) {
  return (
    <form
      action={async () => {
        try {
          await caches.delete(SEITEN_SPEICHER);
          navigator.serviceWorker?.controller?.postMessage("abmelden");
        } catch {
          // Ohne Zwischenspeicher gibt es nichts zu löschen.
        }
        await abmelden();
      }}
    >
      <button className={className}>{text}</button>
    </form>
  );
}
