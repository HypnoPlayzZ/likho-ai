/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        likho: {
          indigo: "#3730A3",
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
