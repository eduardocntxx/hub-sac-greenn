import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#222222",
          soft: "#7D7D7D",
          tertiary: "#9A9A9A",
        },
        forest: {
          50: "#EAFBF6",
          100: "#C9F0E4",
          300: "#5FCFB0",
          500: "#19BC9C",
          600: "#149A80",
          700: "#0F7A65",
          900: "#0A3D33",
        },
        sand: {
          bg: "#F7F8F6",
          surface: "#FFFFFF",
          subtle: "#F1F2EF",
          line: "#E8E8E8",
          "line-strong": "#D8D8D8",
        },
        amber: {
          50: "#FDF3E1",
          400: "#F7C766",
          500: "#F5B942",
          600: "#D69C2B",
          700: "#9C7420",
        },
        rust: {
          50: "#FCEAEA",
          100: "#F7C6C6",
          400: "#EB7373",
          500: "#E75A5A",
          600: "#C94848",
          700: "#963636",
        },
        sky: {
          50: "#EAF2FA",
          500: "#3B82C4",
          600: "#2E6CA3",
          700: "#22537E",
        },
        violet: {
          50: "#F1EEF9",
          400: "#A79BD1",
          500: "#8B7FB8",
          600: "#71679C",
          700: "#584F7A",
        },
        success: "#4CAF50",
      },
      fontFamily: {
        display: ["'Inter'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["2rem", { lineHeight: "1.25", fontWeight: "700" }],
        "card-title": ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        legenda: ["0.8125rem", { lineHeight: "1.4", fontWeight: "400" }],
        "kpi-lg": ["1.875rem", { lineHeight: "1.15", fontWeight: "700" }],
        micro: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,45,35,0.06), 0 1px 2px rgba(15,45,35,0.04)",
        "card-hover": "0 8px 24px -6px rgba(15,45,35,0.14), 0 2px 6px rgba(15,45,35,0.06)",
        soft: "0 4px 18px rgba(15,45,35,0.06)",
        float: "0 16px 40px -8px rgba(15,45,35,0.22)",
        glow: "0 4px 14px -2px rgba(25,188,156,0.45)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
