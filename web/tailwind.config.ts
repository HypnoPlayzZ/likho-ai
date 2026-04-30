import type { Config } from "tailwindcss";

// Mirrors desktop/tailwind.config.js exactly so brand colours and the glass
// aesthetic stay consistent between the desktop overlay and this landing page.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        likho: {
          indigo: "#3730A3",
          "indigo-soft": "#A5B4FC",
          orange: "#F97316",
          cream: "#FEF9F0",
          ink: "#1F2937",
          slate: "#64748B",
          mint: "#10B981",
          coral: "#F87171",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      animation: {
        "fade-up": "fade-up 600ms ease-out forwards",
        "fade-in": "fade-in 400ms ease-out forwards",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
