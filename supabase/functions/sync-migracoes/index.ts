import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Sincroniza as migrações da Centralização com o Hub. Substitui o fluxo do n8n "sync-migracoes-hub"
// (gestao-tickets/n8n/sync-migracoes-hub.json), que nunca chegou a ser importado.
//
// Chamada de hora em hora pelo pg_cron (job `sync-migracoes-hora`), com o header `x-cron-secret`.
// Publicada com --no-verify-jwt: quem autoriza é o segredo, não um JWT — senão qualquer usuário logado
// do Hub conseguiria disparar a sincronização.
//
// A Centralização monta as linhas (`migracoes_para_hub()`, só service_role) e o Hub grava tudo numa
// transação (`sync_migracoes(payload)`: upsert + remove o que sumiu da origem; recusa lista vazia).
// Cada execução fica em `integracao_execucoes`.

const JOB = "sync-migracoes";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Comparação em tempo constante, pra não vazar o segredo pelo tempo de resposta.
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

// Chave nova (sb_secret_...) vai só no `apikey`; a legada (JWT) vai também no Authorization.
function headersSupabase(chave: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: chave, "Content-Type": "application/json" };
  if (!chave.startsWith("sb_")) headers.Authorization = `Bearer ${chave}`;
  return headers;
}

async function registrar(hub: SupabaseClient, iniciadoEm: string, ok: boolean, detalhe: Record<string, unknown>) {
  const { error } = await hub.from("integracao_execucoes").insert({
    job: JOB,
    iniciado_em: iniciadoEm,
    concluido_em: new Date().toISOString(),
    ok,
    detalhe,
  });
  if (error) console.error(`${JOB}: não gravou o log da execução`, error.message);
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !segredoConfere(req.headers.get("x-cron-secret"), cronSecret)) {
    return json({ error: "não autorizado" }, 401);
  }

  const hub = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const iniciadoEm = new Date().toISOString();

  try {
    const centralizacaoUrl = Deno.env.get("CENTRALIZACAO_URL");
    const centralizacaoChave = Deno.env.get("CENTRALIZACAO_SERVICE_KEY");
    if (!centralizacaoUrl || !centralizacaoChave) {
      throw new Error("CENTRALIZACAO_URL ou CENTRALIZACAO_SERVICE_KEY não configurado nos segredos da função");
    }

    const resposta = await fetch(`${centralizacaoUrl}/rest/v1/rpc/migracoes_para_hub`, {
      method: "POST",
      headers: headersSupabase(centralizacaoChave),
      body: "{}",
    });
    if (!resposta.ok) {
      throw new Error(`Centralização respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
    }
    const { rows } = await resposta.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Centralização devolveu lista vazia; nada foi alterado no Hub");
    }

    const { data, error } = await hub.rpc("sync_migracoes", { payload: rows });
    if (error) throw new Error(`sync_migracoes: ${error.message}`);

    const resultado = { recebidas: rows.length, ...(data as Record<string, unknown>) };
    await registrar(hub, iniciadoEm, true, resultado);
    return json({ ok: true, ...resultado });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`${JOB}: ${erro}`);
    await registrar(hub, iniciadoEm, false, { erro });
    return json({ ok: false, erro }, 500);
  }
});
