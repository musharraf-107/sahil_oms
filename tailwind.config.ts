import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E1626",
        panel: "#141F35",
        panel2: "#182644",
        border: "#26365A",
        bordersoft: "#1E2C4A",
        muted: "#8C9AC2",
        muted2: "#5E6E96",
        amber: "#F0A94E",
        teal: "#3FD6BE",
        red: "#EF6259",
        indigo: "#7C8CF8",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
