import { ImageResponse } from "next/og";

// Auto-generates the 1200x630 OpenGraph image at build time. Next.js
// auto-discovers this file and injects the right meta tags.
//
// ImageResponse is a CSS subset — Tailwind doesn't work, only inline styles.

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
          padding: "72px",
          background:
            "linear-gradient(135deg, #0b1326 0%, #131b2e 45%, #222a3d 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Soft brand-color glow accents */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            left: "-120px",
            width: "420px",
            height: "420px",
            borderRadius: "999px",
            background: "rgba(62, 82, 232, 0.35)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-120px",
            right: "-120px",
            width: "420px",
            height: "420px",
            borderRadius: "999px",
            background: "rgba(78, 222, 163, 0.18)",
            filter: "blur(80px)",
          }}
        />

        {/* Brand wordmark, top-left */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "0.25em",
            color: "#bcc2ff",
            textTransform: "uppercase",
          }}
        >
          <span>LIKHO</span>
          <span style={{ color: "#4edea3" }}>.</span>
          <span>AI</span>
        </div>

        {/* Headline card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            padding: "44px 52px",
            borderRadius: "24px",
            backgroundColor: "rgba(45, 52, 73, 0.55)",
            border: "1px solid rgba(143, 143, 161, 0.25)",
            boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "#bcc2ff",
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
                backgroundColor: "#4edea3",
              }}
            />
            <span>Built for Indian English</span>
          </div>

          <div
            style={{
              fontSize: "74px",
              lineHeight: 1.05,
              fontWeight: 800,
              color: "#dae2fd",
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            Write better English in any Windows app.
          </div>

          <div
            style={{
              marginTop: "22px",
              fontSize: "24px",
              lineHeight: 1.4,
              color: "#c5c5d8",
              display: "flex",
            }}
          >
            Press Alt+Space anywhere. AI rewrites your text in 3 tones in 2 seconds.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
