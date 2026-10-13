import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Manrope: a warm geometric sans that stays legible in small UI labels and
// stays out of the way of the video, the real subject of the page.
const ui = Manrope({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "OneMotion",
  description: "Describe a video in a sentence. An AI director designs it, your browser renders the MP4. Open source, powered by OneAPI.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
