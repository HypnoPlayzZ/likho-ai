/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      // Material 3 dark-indigo tokens — mirrors the Stitch design system.
      // Use these instead of arbitrary hex so future palette tweaks stay
      // centralized.
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

        // Brand alias kept so legacy refs degrade gracefully — points at
        // the new accent so we don't need to chase every spot in one PR.
        "likho-orange": "#bcc2ff",
        "likho-coral": "#ffb4ab",
        "likho-mint": "#4edea3",
        likho: {
          orange: "#bcc2ff",
          coral: "#ffb4ab",
          mint: "#4edea3",
          indigo: "#3e52e8",
          "indigo-soft": "#bcc2ff",
        },
      },
    },
  },
  plugins: [],
};
