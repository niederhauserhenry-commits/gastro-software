import type { FeedbackArt, FeedbackStatus } from "@/lib/daten";
import { texte } from "@/texte";

const artFarbe: Record<FeedbackArt, string> = {
  wunsch: "bg-senf/25 text-tinte",
  problem: "bg-warnrot-hell text-warnrot",
  lob: "bg-tafel-hell text-tafel-tief",
};

const statusFarbe: Record<FeedbackStatus, string> = {
  neu: "border border-linie text-stift",
  gelesen: "border border-linie text-tinte",
  geplant: "bg-senf text-tinte",
  erledigt: "bg-tafel text-white",
  abgelehnt: "bg-kreide text-stift",
};

export function ArtMarke({ art }: { art: FeedbackArt }) {
  return <span className={`rounded-md px-2 py-0.5 font-semibold ${artFarbe[art]}`}>{texte().feedback.art[art]}</span>;
}

export function StatusMarke({ status }: { status: FeedbackStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${statusFarbe[status]}`}>{texte().feedback.status[status]}</span>;
}
