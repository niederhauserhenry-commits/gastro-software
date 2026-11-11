import type { Metadata, Viewport } from "next";
import { standardSprache, texte } from "@/texte";
import "./globals.css";

const t = texte();

export const metadata: Metadata = {
  title: t.appName,
  description: t.beschreibung,
};

export const viewport: Viewport = {
  themeColor: "#14532d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={standardSprache} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        {children}
      </body>
    </html>
  );
}
