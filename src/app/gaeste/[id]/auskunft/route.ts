import { istUuid } from "@/lib/daten";
import { leitungErforderlich } from "@/lib/sitzung";
import { datenbank } from "@/lib/supabase/server";

// Datenauskunft für einen Gast (Art. 15 DSGVO): alles, was über ihn gespeichert ist.
export async function GET(_anfrage: Request, { params }: RouteContext<"/gaeste/[id]/auskunft">) {
  await leitungErforderlich();
  const { id } = await params;
  if (!istUuid(id)) return new Response("Nicht gefunden", { status: 404 });
  const db = await datenbank();
  const { data, error } = await db.rpc("gast_auskunft", { p_gast: id });
  if (error || !data) return new Response("Nicht gefunden", { status: 404 });
  const name = String((data as { karteikarte?: { name?: string } }).karteikarte?.name ?? "gast")
    .replace(/[^A-Za-z0-9ÄÖÜäöüß -]/g, "")
    .trim()
    .replaceAll(" ", "-");
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="datenauskunft-${encodeURIComponent(name)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
