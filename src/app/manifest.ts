import type { MetadataRoute } from "next";
import { texte } from "@/texte";

// Das Manifest sorgt dafür, dass sich die Seite wie eine App
// auf dem Handy-Startbildschirm installieren lässt (PWA).
export default function manifest(): MetadataRoute.Manifest {
  const t = texte();
  return {
    name: t.appName,
    short_name: t.appKurzname,
    description: t.beschreibung,
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f2",
    theme_color: "#1f3b33",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
