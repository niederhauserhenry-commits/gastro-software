// Alle sichtbaren Texte stehen hier an einer Stelle.
// Für eine weitere Sprache wird später einfach eine zweite Datei (z. B. en.ts) angelegt.
export const de = {
  appName: "Gastro-Software",
  appKurzname: "Gastro",
  beschreibung: "Reservierungen, Gäste und Team an einem Ort.",
  allgemein: {
    zurueck: "Zurück zur Startseite",
    abmelden: "Abmelden",
    speichern: "Speichern",
    laedt: "Lädt …",
  },
  startseite: {
    begruessung: "Hallo",
    baldVerfuegbar: "Kommt bald",
    deineRolle: "Deine Rolle",
  },
  kacheln: {
    reservierungen: { titel: "Reservierungen", text: "Heute, morgen, alle Tische" },
    gaeste: { titel: "Gäste", text: "Gästekartei und Wünsche" },
    warteliste: { titel: "Warteliste", text: "Freie Tische neu vergeben" },
    feedback: { titel: "Feedback", text: "Wünsche an uns senden" },
    team: { titel: "Team", text: "Wer gehört dazu, wer darf was" },
  },
  rollen: {
    inhaber: "Inhaber",
    manager: "Manager",
    mitarbeiter: "Mitarbeiter",
    azubi: "Azubi",
  },
  anmelden: {
    titel: "Anmelden",
    email: "E-Mail-Adresse",
    passwort: "Passwort",
    passwortHinweis: "Mindestens 8 Zeichen",
    anmelden: "Anmelden",
    registrieren: "Neues Konto anlegen",
    bestaetigen: "Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link in der Mail und melde dich dann an.",
  },
  einrichten: {
    titel: "Restaurant anlegen",
    hinweis: "Du bist noch keinem Restaurant zugeordnet. Lege hier dein Restaurant an. Wenn du zu einem bestehenden Team gehörst, bitte deine Leitung, dich mit deiner E-Mail-Adresse hinzuzufügen.",
    restaurantName: "Name des Restaurants",
    deinName: "Dein Name",
    anlegen: "Restaurant anlegen",
  },
  team: {
    titel: "Team",
    hinzufuegenTitel: "Person hinzufügen",
    hinzufuegenHinweis: "Die Person muss sich vorher selbst mit ihrer E-Mail-Adresse ein Konto angelegt haben.",
    name: "Name",
    rolle: "Rolle",
    darfReservieren: "Darf Reservierungen eintragen",
    immerErlaubt: "Darf immer reservieren",
    hinzufuegen: "Hinzufügen",
    entfernen: "Entfernen",
    du: "Du",
    gespeichert: "Gespeichert.",
  },
  fehler: {
    ANMELDUNG_FALSCH: "E-Mail-Adresse oder Passwort stimmt nicht.",
    EMAIL_NICHT_BESTAETIGT: "Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Mail.",
    KONTO_EXISTIERT: "Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte melde dich an.",
    PASSWORT_ZU_KURZ: "Das Passwort braucht mindestens 8 Zeichen.",
    EINGABE_FEHLT: "Bitte fülle alle Felder aus.",
    NUTZER_NICHT_GEFUNDEN: "Zu dieser E-Mail-Adresse gibt es noch kein Konto. Die Person muss sich zuerst selbst registrieren.",
    SCHON_IM_TEAM: "Diese Person ist schon im Team.",
    KEINE_BERECHTIGUNG: "Dafür fehlt dir die Berechtigung.",
    LETZTER_INHABER: "Das geht nicht: Ein Restaurant braucht mindestens einen Inhaber.",
    ZU_VIELE_VERSUCHE: "Zu viele Versuche. Bitte warte ein paar Minuten.",
    UNBEKANNT: "Das hat leider nicht geklappt. Bitte versuche es noch einmal.",
  },
} as const;

export type Texte = typeof de;
export type FehlerCode = keyof typeof de.fehler;
