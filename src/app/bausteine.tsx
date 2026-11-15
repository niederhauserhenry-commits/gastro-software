// Kleine Bausteine, die auf mehreren Seiten gleich aussehen sollen.

export const feldKlasse =
  "mt-1 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base focus:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800/30";

export const knopfKlasse =
  "rounded-xl bg-green-900 px-5 py-3 text-base font-semibold text-white hover:bg-green-800";

export const knopfZweitKlasse =
  "rounded-xl border border-stone-300 bg-white px-5 py-3 text-base font-semibold text-stone-800 hover:bg-stone-100";

export function Meldung({ art, children }: { art: "fehler" | "ok"; children: React.ReactNode }) {
  const farbe =
    art === "fehler"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-green-200 bg-green-50 text-green-900";
  return (
    <p role={art === "fehler" ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 ${farbe}`}>
      {children}
    </p>
  );
}
