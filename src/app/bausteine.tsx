// Bausteine, die auf allen Seiten gleich aussehen sollen.
import Link from "next/link";

export const feldKlasse =
  "mt-1.5 block w-full rounded-lg border border-linie bg-papier px-4 py-3 text-base text-tinte placeholder:text-stift/70 focus:border-tafel focus:outline-none focus:ring-2 focus:ring-tafel/25";

export const knopfKlasse =
  "inline-flex items-center justify-center rounded-lg bg-tafel px-5 py-3 text-base font-semibold text-white hover:bg-tafel-tief";

export const knopfZweitKlasse =
  "inline-flex items-center justify-center rounded-lg border border-linie bg-papier px-5 py-3 text-base font-semibold text-tinte hover:border-tafel";

export const knopfLoeschKlasse =
  "inline-flex items-center justify-center rounded-lg px-3 py-2 text-base font-medium text-warnrot underline underline-offset-2 hover:bg-warnrot-hell";

export const karteKlasse = "rounded-xl border border-linie bg-papier p-5 sm:p-6";

export function Meldung({ art, children }: { art: "fehler" | "ok"; children: React.ReactNode }) {
  const farbe =
    art === "fehler"
      ? "border-warnrot/30 bg-warnrot-hell text-warnrot"
      : "border-tafel/20 bg-tafel-hell text-tafel-tief";
  return (
    <p role={art === "fehler" ? "alert" : "status"} className={`mb-5 rounded-lg border px-4 py-3 font-medium ${farbe}`}>
      {children}
    </p>
  );
}

// Dunkle Kopfleiste mit dem Namen des Restaurants.
export function Kopfleiste({
  restaurantName,
  rechts,
}: {
  restaurantName: string;
  rechts?: React.ReactNode;
}) {
  return (
    <header className="bg-tafel text-white">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="rounded text-lg font-bold tracking-tight">
          {restaurantName}
        </Link>
        {rechts}
      </div>
    </header>
  );
}

export function Seite({ children, schmal }: { children: React.ReactNode; schmal?: boolean }) {
  return (
    <main className={`mx-auto w-full flex-1 px-4 py-6 sm:py-10 ${schmal ? "max-w-md" : "max-w-4xl"}`}>
      {children}
    </main>
  );
}

export function Zurueck({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-2 rounded font-medium text-tafel underline underline-offset-4">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

// Auswahl mit großer Klickfläche: Titel plus ein erklärender Satz.
export function Auswahl({
  name,
  wert,
  gewaehlt,
  titel,
  text,
}: {
  name: string;
  wert: string;
  gewaehlt: boolean;
  titel: string;
  text: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-linie bg-papier p-4 has-[:checked]:border-tafel has-[:checked]:bg-tafel-hell">
      <input type="radio" name={name} value={wert} defaultChecked={gewaehlt} className="mt-1 h-5 w-5 accent-tafel" />
      <span>
        <span className="block text-lg font-semibold">{titel}</span>
        <span className="block text-stift">{text}</span>
      </span>
    </label>
  );
}
