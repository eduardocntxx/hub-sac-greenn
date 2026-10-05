import { createClient } from "@supabase/supabase-js";

// As credenciais devem vir de variáveis de ambiente (.env), nunca hardcoded.
// Ver .env.example na raiz do projeto.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

// Fila de RPCs (2026-10-01): telas como a Reunião de Resultados disparam ~40
// RPCs pesadas de uma vez; no compute Micro (plano gratuito) elas disputam a
// CPU, todas ficam lentas e estouram o statement_timeout de 25s (erro 500).
// Em fila, cada uma termina rápido. Só limita /rest/v1/rpc/ — leitura de
// tabela, auth e realtime seguem sem fila.
const MAX_RPC_SIMULTANEAS = 3;
let rpcsAtivas = 0;
const filaRpc: Array<() => void> = [];

// Repassa a vaga direto pra próxima da fila (sem decrementar), pra uma RPC
// nova não furar a fila entre o fim de uma e o início da outra.
function liberarRpc() {
  const proxima = filaRpc.shift();
  if (proxima) proxima();
  else rpcsAtivas--;
}

const fetchComFila: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/rest/v1/rpc/")) return fetch(input, init);
  if (rpcsAtivas >= MAX_RPC_SIMULTANEAS) {
    await new Promise<void>((resolve) => filaRpc.push(resolve));
  } else {
    rpcsAtivas++;
  }
  try {
    return await fetch(input, init);
  } finally {
    liberarRpc();
  }
};

// Enquanto as credenciais reais não são configuradas, o Hub roda inteiramente
// sobre dados mockados (src/lib/mockData.ts). Isso permite validar UX e fluxo
// de produto antes de existir schema de banco definitivo.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchComFila } })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
