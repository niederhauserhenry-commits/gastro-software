import { de } from "./de";

// Aktuell gibt es nur Deutsch. Weitere Sprachen werden hier eingetragen.
const sprachen = { de } as const;
export type Sprache = keyof typeof sprachen;
export const standardSprache: Sprache = "de";

export function texte(sprache: Sprache = standardSprache) {
  return sprachen[sprache];
}
