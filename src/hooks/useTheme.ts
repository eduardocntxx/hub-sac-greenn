import { useEffect, useState } from "react";

type Tema = "light" | "dark";

const STORAGE_KEY = "hub-sac:tema";

function temaAtualNoDOM(): Tema {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Mantém em sincronia com o script inline de index.html, que já aplica
// a classe "dark" antes do primeiro paint (evita flash de tema errado).
// Esse hook só assume o estado que o DOM já tem e expõe o toggle.
export function useTheme() {
  const [tema, setTema] = useState<Tema>(() => (typeof document !== "undefined" ? temaAtualNoDOM() : "light"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      // localStorage indisponível (modo privado etc.) — tema ainda funciona nesta sessão
    }
  }, [tema]);

  function alternar() {
    setTema((t) => (t === "dark" ? "light" : "dark"));
  }

  return { tema, alternar };
}
