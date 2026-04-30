import { ImageResponse } from "next/og";

// Auto-generated 32x32 favicon. Next.js wires the right <link rel="icon">
// tag automatically.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3730A3 0%, #4F46E5 100%)",
          color: "#FEF9F0",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          borderRadius: "6px",
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
