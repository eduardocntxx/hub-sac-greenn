import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    watch: {
      // Pastas locais do design-sync: o cache tem symlinks para node_modules do
      // próprio projeto, e o watcher entrava em loop (sem memória / ELOOP).
      ignored: ["**/.design-sync/**", "**/.ds-sync/**", "**/ds-bundle/**", "**/dist/**"],
    },
  },
});
