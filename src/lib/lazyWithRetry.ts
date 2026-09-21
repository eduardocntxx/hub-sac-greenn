import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "hub-sac:chunk-reload";

// Só devolve true se dá pra recarregar UMA vez com segurança. Sem
// sessionStorage (bloqueado/privado) não recarrega — senão um chunk que sumiu
// de vez viraria loop infinito de reload.
function podeRecarregarUmaVez(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * React.lazy que sobrevive a deploy: uma aba aberta antes do deploy pede
 * arquivos com hash que não existem mais ("Failed to fetch dynamically
 * imported module"). Na primeira falha recarrega a página pra pegar o
 * index.html novo; se falhar de novo, propaga o erro (RouteBoundary mostra).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* storage indisponível: sem flag pra limpar */
      }
      return mod;
    } catch (err) {
      if (podeRecarregarUmaVez()) {
        window.location.reload();
        return new Promise<never>(() => {}); // nunca resolve: a página recarrega
      }
      throw err;
    }
  });
}
