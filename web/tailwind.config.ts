import type { Config } from "tailwindcss";

// Material 3 dark indigo theme — matches the desktop overlay (v0.6.0+).
// Brand-side aliases (`likho-indigo`, `likho-orange`, etc.) redirect to the
// nearest M3 token so legacy references in page/component files render in
// the new theme without needing a per-class sweep.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b1326",
        surface: "#0b1326",
        "surface-dim": "#0b1326",
        "surface-bright": "#31394d",
        "surface-container-lowest": "#060e20",
        "surface-container-low": "#131b2e",
        "surface-container": "#171f33",
        "surface-container-high": "#222a3d",
        "surface-container-highest": "#2d3449",
        "surface-variant": "#2d3449",

        primary: "#bcc2ff",
        "on-primary": "#00179b",
        "primary-container": "#3e52e8",
        "on-primary-container": "#dfe0ff",

        secondary: "#4edea3",
        "on-secondary": "#003824",
        "secondary-container": "#00a572",
        "on-secondary-container": "#00311f",

        tertiary: "#ffb597",
        "on-tertiary": "#591d00",
        "tertiary-container": "#af4100",
        "on-tertiary-container": "#ffdbce",

        error: "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",

        "on-surface": "#dae2fd",
        "on-surface-variant": "#c5c5d8",
        outline: "#8f8fa1",
        "outline-variant": "#444655",

        // Brand aliases — redirect every legacy `likho-*` reference at the
        // token layer so we don't have to chase every utility class.
        likho: {
          indigo: "#dae2fd",      // was dark indigo headline; on dark bg → light on-surface
          "indigo-soft": "#bcc2ff", // accent
          orange: "#ffb597",      // peach tertiary (warm accent)
          cream: "#dfe0ff",       // on-primary-container
          ink: "#dae2fd",
          slate: "#c5c5d8",       // on-surface-variant
          mint: "#4edea3",
          coral: "#ffb4ab",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
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
