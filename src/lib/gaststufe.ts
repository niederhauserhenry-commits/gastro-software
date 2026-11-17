// Ohne Datenbankzugriff, damit auch Bausteine im Browser es nutzen können.

export type GastStufe = "stammgast" | "wiederkehrend" | "neu";

// Ab fünf Besuchen Stammgast, ab zwei wiederkehrend.
export function gastStufe(besuche: number): GastStufe {
  if (besuche >= 5) return "stammgast";
  if (besuche >= 2) return "wiederkehrend";
  return "neu";
}
