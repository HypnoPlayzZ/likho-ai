import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import "./globals.css";

// Self-hosted Inter via next/font. Eliminates the render-blocking
// @import from globals.css and ships a metric-override fallback so
// CLS stays at zero during font swap. CSS variable is consumed by
// `body` in globals.css and surfaced through Tailwind's font-sans.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});

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
  alternates: {
    canonical: SITE_URL,
  },
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
    creator: "@likho_ai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1326",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const DOWNLOAD_URL =
  "https://github.com/HypnoPlayzZ/likho-ai/releases/latest/download/Likho-Setup.msi";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

// Schema.org SoftwareApplication + Organization JSON-LD. Surfaces in
// Google's "software" rich result with price, OS, rating chips. Keeps
// content fields verbatim from the rendered page (price = ₹0 free,
// upgrade tiers from Pricing copy).
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: "Likho",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: [
        "https://x.com/likho_ai",
        "https://www.linkedin.com/company/likho-ai",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: "Likho",
      publisher: { "@id": `${SITE_URL}#organization` },
      inLanguage: "en-IN",
    },
    {
      "@type": "SoftwareApplication",
      name: "Likho",
      operatingSystem: "Windows 11",
      applicationCategory: "BusinessApplication",
      description: DESCRIPTION,
      url: SITE_URL,
      downloadUrl: DOWNLOAD_URL,
      fileSize: "12MB",
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: "0",
          priceCurrency: "INR",
        },
        {
          "@type": "Offer",
          name: "Pro",
          price: "299",
          priceCurrency: "INR",
        },
        {
          "@type": "Offer",
          name: "Pro+",
          price: "499",
          priceCurrency: "INR",
        },
        {
          "@type": "Offer",
          name: "Founding member",
          price: "4900",
          priceCurrency: "INR",
        },
      ],
      publisher: { "@id": `${SITE_URL}#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="likho-bg min-h-screen font-sans">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-outline-variant/40 bg-surface-container-low/75 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 h-16 lg:h-20 flex items-center justify-between gap-6">
        <a
          href="/"
          className="flex items-center gap-2.5 group shrink-0"
          aria-label="Likho.ai home"
        >
          <Image
            src="/logo.png"
            alt="Likho"
            width={40}
            height={40}
            priority
            className="rounded-lg shadow-md shadow-primary-container/20"
          />
          <span className="text-lg lg:text-xl font-extrabold tracking-tight text-on-surface group-hover:text-primary transition-colors">
            Likho<span className="text-secondary">.</span>ai
          </span>
        </a>

        <nav
          aria-label="Primary"
          className="hidden lg:flex items-center gap-1 text-sm font-semibold"
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60 transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href={DOWNLOAD_URL}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-container text-on-primary-container px-4 lg:px-5 py-2 lg:py-2.5 text-xs lg:text-sm font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all shadow-lg shadow-primary-container/30 shrink-0"
        >
          Download
        </a>
      </div>
    </header>
  );
}
