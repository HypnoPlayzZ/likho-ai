/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        likho: {
          indigo: "#3730A3",
          "indigo-soft": "#A5B4FC",
          // Saffron-toned orange for accents on the glass overlay — pops on
          // the dark transparent surface and reads as Indian/warm without
          // veering into "warning" red. Used for tone labels, brand mark,
          // and language badge. Tailwind orange-500; deeper than orange-400
          // (#FB923C) which washes out on bright backdrops behind the glass.
          orange: "#F97316",
          cream: "#FEF9F0",
          ink: "#1F2937",
          slate: "#64748B",
          mint: "#10B981",
          coral: "#F87171",
        },
      },
    },
  },
  plugins: [],
};
