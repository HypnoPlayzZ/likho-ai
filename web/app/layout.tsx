import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://likho.ai";
const TITLE = "Likho — Write better English in any Windows app";
const DESCRIPTION =
  "Press Alt+Space anywhere on Windows. AI rewrites your text in 3 professional tones in 2 seconds. Built for Indian English and Hinglish.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Likho",
  keywords: [
    "Indian English",
    "Hinglish",
    "AI writing",
    "Windows app",
    "rewrite",
    "Grammarly alternative",
    "Indian SaaS",
  ],
  authors: [{ name: "Chetan" }],
  // OG + Twitter images and the favicon are produced by app/opengraph-image.tsx
  // and app/icon.tsx — Next.js auto-discovers and links them, so we don't
  // hand-wire URLs here.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Likho",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="likho-bg min-h-screen">{children}</body>
    </html>
  );
}
