// Service Worker der Gastro-Software.
// Hält die wichtigsten Seiten (Startseite, Reservierungen, Warteliste) als letzten
// Stand bereit, damit das Team sie auch ohne Internet lesen kann.
// Beim Abmelden wird der Zwischenspeicher gelöscht.

const SEITEN = "gastro-seiten-v1";
const STATISCH = "gastro-statisch-v1";
const OFFLINE_PFADE = ["/", "/reservierungen", "/warteliste"];

const OFFLINE_SEITE = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Keine Verbindung</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f5f2;color:#15211d;margin:0;padding:2rem}
h1{font-size:1.6rem}a{color:#1f3b33}</style></head><body>
<h1>Keine Internetverbindung</h1>
<p>Diese Seite war noch nicht gespeichert. Die Startseite und die Reservierungen von heute sind auch offline lesbar, wenn sie vorher einmal geöffnet wurden.</p>
<p><a href="/">Zur Startseite</a> · <a href="/reservierungen">Reservierungen heute</a></p>
</body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== SEITEN && name !== STATISCH) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (ereignis) => {
  if (ereignis.data === "abmelden") ereignis.waitUntil(caches.delete(SEITEN));
});

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  const url = new URL(anfrage.url);
  if (anfrage.method !== "GET" || url.origin !== self.location.origin) return;

  // Programmdateien ändern sich nie unter derselben Adresse: erst aus dem Speicher.
  if (url.pathname.startsWith("/_next/static/")) {
    ereignis.respondWith(speicherZuerst(anfrage));
    return;
  }
  // Wichtige Seiten: immer frisch aus dem Netz, bei Ausfall der letzte Stand.
  if (anfrage.mode === "navigate" && OFFLINE_PFADE.includes(url.pathname)) {
    ereignis.respondWith(netzZuerst(anfrage));
    return;
  }
  // Alle anderen Seiten: ohne Netz ein verständlicher Hinweis statt einer Fehlerseite.
  if (anfrage.mode === "navigate") {
    ereignis.respondWith(
      fetch(anfrage).catch(() => new Response(OFFLINE_SEITE, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
    );
  }
});

async function speicherZuerst(anfrage) {
  const speicher = await caches.open(STATISCH);
  const treffer = await speicher.match(anfrage);
  if (treffer) return treffer;
  const antwort = await fetch(anfrage);
  if (antwort.ok) speicher.put(anfrage, antwort.clone());
  return antwort;
}

async function netzZuerst(anfrage) {
  const speicher = await caches.open(SEITEN);
  try {
    const antwort = await fetch(anfrage);
    // Weiterleitungen (zum Beispiel zur Anmeldung) werden nicht gespeichert.
    if (antwort.ok && !antwort.redirected) speicher.put(anfrage, antwort.clone());
    return antwort;
  } catch {
    const treffer = (await speicher.match(anfrage)) || (await speicher.match(new URL(anfrage.url).pathname));
    if (treffer) return treffer;
    return new Response(OFFLINE_SEITE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
