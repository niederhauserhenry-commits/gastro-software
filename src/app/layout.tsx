import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { standardSprache, texte } from "@/texte";
import { ServiceWorkerAnmelden } from "@/app/offline";
import "./globals.css";

const t = texte();

export const metadata: Metadata = {
  title: t.appName,
  description: t.beschreibung,
};

export const viewport: Viewport = {
  themeColor: "#1f3b33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={standardSprache} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* Jede Seite hängt vom angemeldeten Nutzer ab und wird deshalb
            erst beim Aufruf erzeugt. Bis dahin erscheint der Ladehinweis. */}
        <Suspense fallback={<p className="p-8 text-stift">{t.allgemein.laedt}</p>}>{children}</Suspense>
        <ServiceWorkerAnmelden />
      </body>
    </html>
  );
}
