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
          // Verdee (guia de estilo da Greenn, 2026-09-24): verde-azulado.
          50: "#EEFFFE",
          100: "#E1F4F3",
          200: "#C8EAE7",
          300: "#96D4CF",
          400: "#32A9A0",
          500: "#009488",
          600: "#00766D",
          700: "#005952",
          800: "#002F2B",
          900: "#003B36",
        },
        sand: {
          bg: "rgb(var(--color-sand-bg) / <alpha-value>)",
          surface: "rgb(var(--color-sand-surface) / <alpha-value>)",
          subtle: "rgb(var(--color-sand-subtle) / <alpha-value>)",
          line: "rgb(var(--color-sand-line) / <alpha-value>)",
          "line-strong": "rgb(var(--color-sand-line-strong) / <alpha-value>)",
        },
        amber: {
          50: "#FEFCE8",
          400: "#FADC4A",
          500: "#F6C819",
          600: "#E6AF0C",
          700: "#9E610A",
        },
        rust: {
          50: "#FFF3ED",
          100: "#FFE3D4",
          400: "#FF6337",
          500: "#F02006",
          600: "#C71307",
          700: "#9E110E",
        },
        sky: {
          50: "#EFF6FF",
          400: "#5EA9FC",
          500: "#3886F9",
          600: "#2469EE",
          700: "#1C43B1",
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
        display: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
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
        card: "0 1px 2px rgba(0,24,22,0.04)",
        "card-hover": "0 4px 12px -4px rgba(0,24,22,0.10)",
        soft: "0 2px 10px rgba(0,24,22,0.05)",
        float: "0 12px 32px -12px rgba(0,24,22,0.18)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
