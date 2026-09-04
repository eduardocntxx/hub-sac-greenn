import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ink/sand são as únicas cores que trocam de valor no dark mode —
        // por isso vêm de variável CSS (definida em index.css, :root/.dark),
        // no formato "R G B" pra suportar os modificadores de opacidade do
        // Tailwind (text-ink/50 etc.), que não funcionam com var() direto.
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          soft: "rgb(var(--color-ink-soft) / <alpha-value>)",
          tertiary: "rgb(var(--color-ink-tertiary) / <alpha-value>)",
        },
        forest: {
          50: "#EAFBF6",
          100: "#C9F0E4",
          200: "#96E0C8",
          300: "#5FCFB0",
          500: "#19BC9C",
          600: "#149A80",
          700: "#0F7A65",
          900: "#0A3D33",
        },
        sand: {
          bg: "rgb(var(--color-sand-bg) / <alpha-value>)",
          surface: "rgb(var(--color-sand-surface) / <alpha-value>)",
          subtle: "rgb(var(--color-sand-subtle) / <alpha-value>)",
          line: "rgb(var(--color-sand-line) / <alpha-value>)",
          "line-strong": "rgb(var(--color-sand-line-strong) / <alpha-value>)",
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
          400: "#6BA3D6",
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
        // Acento secundário — mesmo valor de #2FE0C8 já aprovado na
        // identidade visual do relatório PPTX/PDF (src/lib/exportPptx.ts),
        // pra o app ao vivo e o relatório exportado lerem como o mesmo
        // produto. Uso pontual (logo do Login, barra de destaque nos
        // cards) — "selecionado/ativo" continua sendo semântica do forest.
        teal: {
          50: "#E1FBF6",
          400: "#5EE8D2",
          500: "#2FE0C8",
          600: "#20B7A3",
          700: "#187F73",
        },
        success: "#4CAF50",
      },
      fontFamily: {
        display: ["'Poppins'", "'Inter'", "system-ui", "sans-serif"],
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
        // Uso pontual (logo do Login) — não vira sombra padrão de card.
        glow: "0 0 0 1px rgba(47,224,200,0.18), 0 10px 30px -8px rgba(47,224,200,0.35)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
