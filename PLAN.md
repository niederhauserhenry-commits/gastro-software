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

## Fahrplan Phase 1
- [x] 1. Grundgerüst (Projekt, Startseite, PWA-Manifest, Texte-Datei)
- [ ] 1b. Online stellen (GitHub + Vercel)
- [ ] 2. Login und Rollen (Inhaber, Manager, Mitarbeiter, Azubi)
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
