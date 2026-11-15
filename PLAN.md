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

## Fahrplan Phase 1
- [x] 1. Grundgerüst (Projekt, Startseite, PWA-Manifest, Texte-Datei)
- [x] 1b. Online stellen (GitHub + Vercel)
- [ ] 2. Login und Rollen (Inhaber, Manager, Mitarbeiter, Azubi) – gebaut am 16.11.2026, Datenbank-Skript `supabase/migrations/0001_grundlage.sql` muss noch eingespielt und alles online getestet werden
- [ ] 3. Einrichtungsassistent (Öffnungszeiten, Tische, Vergabe-Variante)
- [ ] 4. Reservierungen mit Doppelbuchungsschutz
- [ ] 5. Tagesansicht und Startseite mit Kacheln
- [ ] 6. Gästeprofile mit Einwilligung
- [ ] 7. SMS: Bestätigung und Erinnerung
- [ ] 8. Warteliste
- [ ] 9. Telefon-KI anbinden
- [ ] 10. Feedback-Modul mit Wochenbericht
- [ ] 11. Offline-Ansicht, Datenexport, Löschkonzept

## Spätere Module (nicht in Phase 1)
Dienstplan mit Schichttausch, Arbeitszeiterfassung, Einkaufsliste, HACCP-Checklisten, Event-/Bankett-Anfragen, Bewertungsmanager, Gutscheine, Speisekarte mit Allergenen, Zahlen-Cockpit, Kassenanbindung.
