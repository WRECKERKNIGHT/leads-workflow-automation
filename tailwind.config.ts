import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#000000",
        panel: "#080808",
        edge: "#232323",
        accent: "#ffffff",
        dim: "#9a9a9a",
        faint: "#555555",
      },
    },
  },
  plugins: [],
};
export default config;