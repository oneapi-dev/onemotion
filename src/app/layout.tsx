import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist carries the interface at editor density; its mono sets timecodes,
// frames and costs, the numbers an editor reads; Bricolage Grotesque, used
// only for the wordmark and the opening line, gives the studio its voice.
const ui = Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "OneMotion",
  description: "Describe a video in a sentence. An AI art director designs it, an AI motion designer writes it, and your computer renders it. Powered by OneAPI.",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
