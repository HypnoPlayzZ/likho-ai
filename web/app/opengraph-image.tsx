import { ImageResponse } from "next/og";

// Auto-generates the 1200x630 OpenGraph image at build time. Next.js
// auto-discovers this file and injects the right meta tags — no manual
// linking needed in layout.tsx.
//
// Note: ImageResponse is a subset of CSS — Tailwind classes don't work,
// only inline styles. Keep the design minimal so it loads fast for the
// crawlers that scrape it (LinkedIn, X, WhatsApp).

export const runtime = "edge";
export const alt = "Likho — Write better English in any Windows app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          // Same sunrise/sunset gradient as the live site, simplified to
          // linear-gradient so ImageResponse renders it predictably.
          background:
            "linear-gradient(135deg, #FEF9F0 0%, #FDE68A 18%, #FDA4AF 45%, #C4B5FD 75%, #A78BFA 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Brand mark, top-left */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "24px",
            fontWeight: 800,
            letterSpacing: "0.25em",
            color: "#EA580C",
            textTransform: "uppercase",
          }}
        >
          <span>LIKHO</span>
          <span style={{ color: "#F97316" }}>.</span>
          <span>AI</span>
        </div>

        {/* Glass card containing the headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            padding: "48px 56px",
            borderRadius: "32px",
            backgroundColor: "rgba(255, 255, 255, 0.65)",
            border: "1px solid rgba(255, 255, 255, 0.85)",
            boxShadow: "0 24px 60px -12px rgba(234, 88, 12, 0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "#EA580C",
              textTransform: "uppercase",
              marginBottom: "16px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundColor: "#F97316",
              }}
            />
            <span>Built for Indian English</span>
          </div>

          <div
            style={{
              fontSize: "78px",
              lineHeight: 1.05,
              fontWeight: 800,
              color: "#EA580C",
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            Write better English in any Windows app.
          </div>

          <div
            style={{
              marginTop: "24px",
              fontSize: "26px",
              lineHeight: 1.4,
              color: "#475569",
              display: "flex",
            }}
          >
            Press Alt+Space anywhere. AI rewrites your text in 3 tones in 2 seconds.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
