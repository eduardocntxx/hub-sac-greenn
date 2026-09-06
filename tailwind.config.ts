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
        success: "#4CAF50",
      },
      fontFamily: {
        // Uma única voz tipográfica para o app inteiro (redesign 2026-09-05,
        // substitui o par Poppins/Inter) — display e body usam a mesma
        // família, diferenciados só por peso/tamanho, princípio de
        // minimalismo refinado. Manter os dois nomes de utilitário (não
        // colapsar em um só) porque ~180 usos de font-display/font-body no
        // código já esperam essas duas classes.
        display: ["'Sora'", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["'Sora'", "ui-sans-serif", "system-ui", "sans-serif"],
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
      // Sombras mais rasas e neutras (redesign 2026-09-05) — o conjunto
      // anterior usava tinta verde forte e um "glow" decorativo, mais
      // "produto com personalidade" do que minimalista refinado.
      boxShadow: {
        card: "0 1px 2px rgba(15,23,21,0.04)",
        "card-hover": "0 4px 12px -4px rgba(15,23,21,0.10)",
        soft: "0 2px 10px rgba(15,23,21,0.05)",
        float: "0 12px 32px -12px rgba(15,23,21,0.18)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
