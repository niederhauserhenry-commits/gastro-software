// Alle sichtbaren Texte stehen hier an einer Stelle.
// Für eine weitere Sprache wird später einfach eine zweite Datei (z. B. en.ts) angelegt.
export const de = {
  appName: "Gastro-Software",
  appKurzname: "Gastro",
  beschreibung: "Reservierungen, Gäste und Team an einem Ort.",
  startseite: {
    begruessung: "Willkommen",
    hinweis: "Das Grundgerüst steht. Die Kacheln werden Schritt für Schritt freigeschaltet.",
    baldVerfuegbar: "Kommt bald",
  },
  kacheln: {
    reservierungen: { titel: "Reservierungen", text: "Heute, morgen, alle Tische" },
    gaeste: { titel: "Gäste", text: "Stammgäste und Wünsche" },
    warteliste: { titel: "Warteliste", text: "Freie Tische neu vergeben" },
    feedback: { titel: "Feedback", text: "Wünsche an uns senden" },
    einstellungen: { titel: "Einstellungen", text: "Öffnungszeiten, Tische, Team" },
  },
} as const;

export type Texte = typeof de;
