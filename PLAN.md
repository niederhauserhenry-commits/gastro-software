# Gastro-Software – Plan

Modulare Software für die Gastronomie: Web-Programm (Chef/Management) und App für Mitarbeiter (PWA), eine gemeinsame Datenbank, Module pro Restaurant buchbar.

## Technik
- Next.js (TypeScript, Tailwind) – eine Codebasis für Dashboard und App
- Supabase (Postgres, Region Frankfurt) – Datenbank, Login, Zeilen-Rechte pro Restaurant (RLS)
- Vercel (Region Frankfurt) – Hosting
- Retell AI – Telefon-KI per Webhook
- SMS über Twilio oder seven.io
- Claude API – Feedback-Auswertung und Wochenbericht

## Grundregeln
- Jede Tabelle hat `restaurant_id`; die Datenbank trennt die Restaurants (RLS).
- Tabelle `module_freischaltungen` steuert, welche Kacheln ein Restaurant sieht.
- Alle Buchungswege (Telefon-KI, Web, Personal) nutzen dieselbe Datenbankfunktion.
- Doppelbuchungen verhindert die Datenbank: feste Tische per Ausschlussregel auf Tisch + Zeitraum, Platz-Variante per Prüfung unter Sperre. Die Variante ist pro Betrieb wählbar.
- Standard: 2 Stunden Aufenthalt, 15-Minuten-Raster, pro Betrieb einstellbar.
- Bestätigung und Erinnerung zuerst per SMS, WhatsApp später.
- Allergien nur mit ausdrücklicher Einwilligung speichern.
- Alle sichtbaren Texte liegen in `src/texte/` (Mehrsprachigkeit).
- Startseite: höchstens fünf große Kacheln, mobile-first.
- Budget Bauphase: höchstens 150 € im Monat.

## Entscheidungen vom 16.11.2026
- Zielgruppe zum Start: Restaurants und Hotelrestaurants. Weitere Betriebe (Hotels, Motels) später. Keine Zimmerverwaltung.
- Berechtigungen: mehrere Führungskräfte möglich; sie legen pro Person fest, wer Reservierungen eintragen darf.
- Gästekartei: jeder Gast bekommt ab dem ersten Besuch eine Karteikarte mit Besuchsverlauf und Notizen. Automatische Kennzeichnung: neu, wiederkehrend, Stammgast. Hausgäste als eigene Kennzeichnung (Zimmernummer, An- und Abreise) mit eigenem Reiter.
- Löschfrist für Gästedaten pro Betrieb einstellbar (Vorschlag: 3 Jahre nach dem letzten Besuch).
- Tischdauer pro Betrieb einstellbar, drei Varianten: feste Dauer (z. B. 2 Stunden), offen (Tisch bleibt belegt, bis das Personal ihn freigibt), feste Durchgänge mit eigenen Zeiten pro Tag.
- Warteliste: pro Betrieb einstellbar, ob frei gewordene Tische automatisch per SMS angeboten werden (Antwortfrist 15 Minuten, dann der Nächste) oder ob ein Mitarbeiter vergibt. Keine Warteliste für Gäste ohne Reservierung an der Tür.
- Tische in Phase 1 als Liste mit Bereich und Plätzen. Tischplan zum Verschieben direkt nach Phase 1, maßstabsgetreuer Nachbau als späteres Modul.
- Später: Apple Watch (eigene App), Anbindung an Hotelsysteme.

## Technische Notizen
- Datenbank: Supabase-Projekt in Frankfurt (eu-central-1). Die öffentlichen Zugangswerte stehen in `.env`. Geheime Schlüssel gehören nie ins Repository.
- Datenbank-Änderungen liegen als nummerierte Skripte in `supabase/migrations/` und werden im Supabase SQL Editor eingespielt. Lokale Tests dazu in `supabase/tests/`.
- Geschrieben wird in der Datenbank nur über Funktionen (z. B. `restaurant_anlegen`, `mitglied_hinzufuegen`); die Tabellen selbst sind für Nutzer nur lesbar.
- Rechte: Inhaber verwalten alle Rollen, Manager nur Mitarbeiter und Azubis. Leitung darf immer reservieren, alle anderen nur mit Freigabe. Ein Restaurant behält immer mindestens einen Inhaber.
- Neue Konten müssen ihre E-Mail-Adresse bestätigen. Testkonten werden im Supabase-Dashboard mit „Auto Confirm User“ angelegt. Vor echten Kunden: eigenen Mailversand einrichten und in Supabase die Site URL auf die eigene Adresse setzen.

## Gestaltung
- Leitbild: Tafel und Reservierungsbuch. Dunkles Tafelgrün (`tafel`), helles Papier, Senfgelb (`senf`) nur für das, was Aufmerksamkeit braucht. Alle Farben stehen in `src/app/globals.css`.
- Schrift: Atkinson Hyperlegible Next, gewählt für gute Lesbarkeit im Service und für ältere Augen. Liegt im Projekt, wird nicht von fremden Servern geladen.
- Gemeinsame Bausteine (Kopfleiste, Knöpfe, Felder, Auswahl) in `src/app/bausteine.tsx`.
- Startseite zeigt das Datum groß und die „Tagesleiste“ mit den heutigen Öffnungszeiten. In diese Leiste kommen später die Reservierungen des Tages.
- Alle Datenabfragen stehen in `src/lib/daten.ts`.
- Vorschau ohne Anmeldung nur in der Entwicklung: `VORSCHAU=1 npx next dev` zeigt alle Seiten mit Beispieldaten. Im echten Betrieb ist das immer aus.

## Reservierungen (Schritt 4)
- Einziger Buchungsweg ist die Datenbankfunktion `reservierung_anlegen`. Personal, Telefon-KI und Webseite nutzen sie alle.
- Doppelbuchungen bei festen Tischen verhindert die Ausschlussregel `kein_doppelter_tisch` in der Tabelle `reservierungen`. Bei „Nur Plätze zählen“ prüft die Funktion die höchste gleichzeitige Belegung unter einer Sperre.
- Getestet mit 30 gleichzeitigen Buchungen: Es wird nie mehr vergeben, als frei ist.
- Tischdauer „offen“: Der Tisch ist bis zum Ende der Öffnungszeit belegt, bis das Personal „Tisch ist wieder frei“ drückt.
- Buchungen außerhalb der Öffnungszeiten darf nur das Personal mit ausdrücklichem Haken anlegen, die Telefon-KI nie.
- Offen für später: Reservierung verschieben oder bearbeiten (bisher stornieren und neu anlegen), Reservierungen nach Mitternacht erscheinen in der Tagesliste des Folgetags, Verknüpfung mit der Gästekartei (Schritt 6).

## Gästekartei (Schritt 6)
- Jede Reservierung legt automatisch eine Karteikarte an oder verknüpft eine bestehende: gewählter Gast aus der Suche, sonst gleiche Telefonnummer (0151…, +49151… und 0049151… gelten als gleich), sonst neue Karte.
- Kennzeichen: ab 2 Besuchen „Wiederkehrend“, ab 5 „Stammgast“. Ein Besuch zählt nur, wenn die Gäste wirklich da waren (Status „angekommen“ oder „abgeschlossen“).
- Hausgäste: Aufenthalt mit Zimmer, An- und Abreise auf der Karteikarte. Eigener Reiter „Hausgäste“ in der Gästeliste.
- Allergien nur mit dokumentierter Einwilligung (Datum wird gespeichert, die Datenbank erzwingt das). Werden die Allergien gelöscht, verfällt die Einwilligung.
- Rechte: alle im Team lesen, wer reservieren darf pflegt, nur die Leitung löscht Karteikarten.
- Löschfrist: Jede Nacht um 03:17 Uhr (UTC) löscht `gaeste_aufraeumen` Karteikarten ohne Besuch innerhalb der Frist und anonymisiert alte Reservierungen. Eingeplant über pg_cron in Supabase.
- Offen für später: doppelte Karteikarten zusammenführen, Geburtstagshinweis in der Tagesliste, Datenauskunft als Export (Schritt 11).
- Alle Datenbank-Tests lokal: `supabase/tests/alle.sh`.

## Nachrichten an Gäste (Schritt 7)
- Neue Reservierung mit Telefonnummer: Bestätigung sofort, Erinnerung einstellbar 2 bis 48 Stunden vorher (nur wenn mehr als 2 Stunden Abstand).
- Beide SMS enthalten den Absage-Link `https://gastro-software.vercel.app/r/<schlüssel>`. Die Seite funktioniert ohne Anmeldung; der zwölfstellige Schlüssel ist der Nachweis. Sagt der Gast ab, ist der Tisch sofort frei, und die Tagesliste zeigt „Vom Gast abgesagt“.
- Storno, No-Show oder „Gäste sind da“: noch nicht verschickte Nachrichten entfallen.
- Texte pro Restaurant einstellbar mit Platzhaltern und Live-Vorschau; Standardtexte bleiben unter 160 Zeichen.
- Versand: `nachrichten_verarbeiten` läuft jede Minute (pg_cron). Solange kein Anbieter angebunden ist, werden fällige Nachrichten als „Testmodus, nicht verschickt“ markiert.
- Nächster Schritt dafür: Henry legt ein Konto bei einem SMS-Anbieter an (z. B. seven.io aus Deutschland) und hinterlegt den API-Schlüssel selbst im Supabase-Tresor (Vault). Danach ruft `nachrichten_verarbeiten` den Anbieter über pg_net auf. Die Adresse der Webseite steht in `app_konfiguration`.

## Warteliste (Schritt 8)
- Eintrag mit Datum, Personen und Zeitfenster („frühestens 18:00, spätestens 20:30“). Bekannte Telefonnummern werden mit der Karteikarte verknüpft.
- Für jeden wartenden Eintrag berechnet `warteliste_freie_zeit` die erste Uhrzeit im Fenster, zu der ein passender Platz frei ist (berücksichtigt Öffnungszeiten, Tischdauer und Durchgänge).
- Von Hand: Das Team sieht „Frei um 19:30“ und trägt mit einem Klick ein oder schickt ein Angebot per SMS.
- Automatisch: Storno, No-Show oder „Tisch ist wieder frei“ lösen `warteliste_automatisch` aus. Der erste passende Gast mit Telefonnummer bekommt ein Angebot mit Link `/w/<schlüssel>`. Pro Tag läuft immer nur ein Angebot. Zusage bucht über `reservierung_buchen`; Absage oder Ablauf der Frist gibt an den Nächsten weiter (`warteliste_ablauf` läuft jede Minute).
- Ist der Platz bei der Zusage schon anders vergeben, bleibt der Gast auf der Liste.
- `reservierung_anlegen` prüft jetzt nur noch die Rechte und ruft `reservierung_buchen` auf. Das ist der einzige Ort mit der Buchungslogik.
- Ist im Reservierungsformular nichts mehr frei, bietet es „Auf die Warteliste setzen“ mit denselben Angaben an.

## Fahrplan Phase 1
- [x] 1. Grundgerüst (Projekt, Startseite, PWA-Manifest, Texte-Datei)
- [x] 1b. Online stellen (GitHub + Vercel)
- [x] 2. Login und Rollen (Inhaber, Manager, Mitarbeiter, Azubi) – von Henry am 16.11.2026 online getestet
- [ ] 3. Einrichtungsassistent (Öffnungszeiten, Tische, Tischdauer, Warteliste, Löschfrist) – gebaut am 16.11.2026, Datenbank-Skript `0002_einrichtung.sql` ist eingespielt, Online-Test durch Henry offen
- [ ] 4. Reservierungen mit Doppelbuchungsschutz – gebaut am 16.11.2026, Datenbank-Skript `0003_reservierungen.sql` ist eingespielt, Online-Test durch Henry offen
- [ ] 5. Tagesansicht und Startseite mit Kacheln – zusammen mit Schritt 4 gebaut (Tagesliste, Tischplan als Zeitleiste, Startseite zeigt die heutigen Reservierungen)
- [ ] 6. Gästekartei mit Einwilligung für Allergien – gebaut am 17.11.2026, Datenbank-Skript `0004_gaestekartei.sql` ist eingespielt, Online-Test durch Henry offen
- [ ] 7. Nachrichten an Gäste: Bestätigung, Erinnerung, Absage-Link – gebaut am 18.11.2026 im Testmodus, Skript `0005_nachrichten.sql` eingespielt. Offen: SMS-Anbieter anbinden (Henry legt das Konto an), Online-Test
- [ ] 8. Warteliste – gebaut am 18.11.2026, Skript `0006_warteliste.sql` eingespielt, Online-Test durch Henry offen
- [x] 9. Telefon-KI anbinden (gebaut 18.11.2026, wartet auf Retell-Konto)
- [x] 10. Feedback-Modul mit Wochenbericht (gebaut 18.11.2026)
- [x] 11. Offline-Ansicht, Datenexport, Löschkonzept (gebaut 18.11.2026)

## Spätere Module (nicht in Phase 1)
Dienstplan mit Schichttausch, Arbeitszeiterfassung, Einkaufsliste, HACCP-Checklisten, Event-/Bankett-Anfragen, Bewertungsmanager, Gutscheine, Speisekarte mit Allergenen, Zahlen-Cockpit, Kassenanbindung.

## Schritt 11: Datenschutz und Ausfallsicherheit (gebaut 18.11.2026)
- Änderungsprotokoll (Tabelle protokoll): Reservierungen, Karteikarten (nur Feldnamen, keine Inhalte), Team, Einstellungen, Export, Auskunft, Import, Löschfrist. Nur Leitung sieht es, Einträge nach 24 Monaten gelöscht.
- Gesamtexport als ZIP mit CSV je Tabelle (/einstellungen/daten/export), Excel-tauglich (UTF-8 mit BOM, Semikolon, Formelschutz).
- Gäste-Import aus CSV (bis 5000 Zeilen, erkennt Spalten, überspringt Doppelte, Windows-Zeichensatz wird erkannt).
- Datenauskunft je Gast (Art. 15 DSGVO) als JSON-Datei auf der Karteikarte.
- Restaurant löschen nur durch Inhaber, mit Namensbestätigung.
- Offline-Ansicht: Service Worker hält Startseite, Reservierungen und Warteliste als letzten Stand; gelber Hinweis ohne Netz; Abmelden leert den Speicher.

## Schritt 10: Feedback-Modul und KI-Wochenbericht (gebaut 18.11.2026)
- Jedes Teammitglied schickt Wünsche, Probleme oder Lob unter /feedback (höchstens 20 am Tag). Leitung sieht alles aus dem Betrieb, sonst nur eigene Einträge; Status und Antwort des Anbieters erscheinen dort.
- Anbieter-Bereich /anbieter nur für Einträge in plattform_admins (Henry): alle Rückmeldungen mit Betriebsnamen, Status setzen, antworten.
- Wochenbericht: pg_cron montags 06:07 UTC, wochenbericht_erstellen() schickt die Rückmeldungen ohne Personen- und Betriebsnamen per pg_net an die Claude API (claude-sonnet-5-5); wochenberichte_abholen() holt die Antwort jede Minute ab. Schlüssel nur im Supabase Vault (anthropic_api_key), von Henry selbst angelegt. Ohne Schlüssel: Bericht nur mit Zahlen.

## Schritt 9: Telefon-KI über Retell (gebaut 18.11.2026)
- Einstellungen → Telefon-KI (Leitung): an/aus, größte Gruppe am Telefon, Hinweise für die KI; fertige Anweisung für den Retell-Agenten und drei Custom Functions zum Kopieren.
- Schnittstelle POST /api/telefon?k=<Restaurant-Schlüssel>: prüft X-Retell-Signature (HMAC-SHA256 über Rohtext + Zeit, 5 Minuten gültig) mit RETELL_API_KEY aus Vercel; Funktionen restaurant_info, verfuegbarkeit_pruefen, reservierung_anlegen. Antworten enthalten einen Satz "hinweis" für die KI.
- Datenbank: telefon_zugang (Schlüssel nur für Leitung sichtbar, erneuerbar), telefon_info/telefon_anfrage/telefon_buchen nur mit gültigem Schlüssel und eingeschalteter KI; Buchung über reservierung_buchen mit Quelle telefon_ki (gleicher Doppelbuchungsschutz, Karteikarte, SMS-Bestätigung); höchstens 30 Telefonbuchungen pro Stunde.
- Deutsche Nummer: Retell verkauft keine deutschen Nummern, Anbindung per Elastic SIP Trunk (z. B. Twilio, sipgate).
