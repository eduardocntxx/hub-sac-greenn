import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOMINIO_PERMITIDO = "@greenn.com.br";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // O e-mail vem sempre do JWT do próprio chamador (verificado pelo
    // Supabase Auth), nunca de um campo enviado no corpo da requisição —
    // evita que alguém tente burlar a checagem de domínio informando um
    // e-mail diferente do que autenticou de verdade no Google.
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const authUser = authData.user;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existente } = await adminClient
      .from("users")
      .select("*")
      .eq("auth_id", authUser.id)
      .maybeSingle();
    if (existente) {
      // Login recorrente via Google — já tem vínculo, nada a fazer.
      return json({ user: existente }, 200);
    }

    const email = authUser.email ?? "";
    if (!email.toLowerCase().endsWith(DOMINIO_PERMITIDO)) {
      // Sem isso a pessoa ficaria com um usuário no Auth sem nenhum
      // vínculo em public.users — exatamente o bug que já derrubou o Hub
      // em produção antes (auth_id órfão). Desfaz o usuário do Auth em vez
      // de deixar esse estado quebrado.
      await adminClient.auth.admin.deleteUser(authUser.id);
      return json({ error: `Cadastro liberado só pra e-mails ${DOMINIO_PERMITIDO}.` }, 400);
    }

    // Pode já existir uma linha "só de cobertura" pra esse e-mail (criada
    // direto no banco, auth_id null, só pra contar no cálculo de horário
    // do time) — é o primeiro login de verdade dessa pessoa. Sem essa
    // checagem o insert abaixo bate na constraint única de e-mail, e o
    // catch de erro deletava o usuário do Auth recém-autenticado como se
    // fosse órfão (não era — só ainda não tinha vínculo). Escapa % e _ pra
    // não serem tratados como coringa do ILIKE.
    const { data: porEmail } = await adminClient
      .from("users")
      .select("*")
      .ilike("email", email.replace(/[%_]/g, "\\$&"))
      .maybeSingle();

    if (porEmail) {
      // auth_id preenchido pode estar órfão (aponta pra um auth.users que
      // não existe mais — já aconteceu, causa desconhecida, log de
      // auditoria do Supabase não guarda histórico) — nesse caso trata
      // igual auth_id nulo, senão a pessoa fica travada num loop
      // permanente de "e-mail já vinculado" contra uma conta que não
      // existe de verdade.
      const authIdAindaExiste = porEmail.auth_id
        ? !(await adminClient.auth.admin.getUserById(porEmail.auth_id)).error
        : false;

      if (porEmail.auth_id && authIdAindaExiste) {
        // E-mail já vinculado a outra conta de verdade — não sobrescreve
        // o vínculo de outra pessoa.
        await adminClient.auth.admin.deleteUser(authUser.id);
        return json({ error: "Este e-mail já está vinculado a outra conta." }, 409);
      }
      const { data: vinculado, error: updateError } = await adminClient
        .from("users")
        .update({ auth_id: authUser.id })
        .eq("id", porEmail.id)
        .select()
        .single();
      if (updateError) {
        await adminClient.auth.admin.deleteUser(authUser.id);
        return json({ error: updateError.message }, 400);
      }
      return json({ user: vinculado }, 200);
    }

    const { data: roleColaborador, error: roleError } = await adminClient
      .from("roles")
      .select("id")
      .eq("nome", "Colaborador")
      .single();
    if (roleError || !roleColaborador) {
      return json({ error: "Perfil padrão (Colaborador) não encontrado." }, 500);
    }

    const meta = authUser.user_metadata ?? {};
    const nome = (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? email;

    const { data: novoUsuario, error: insertError } = await adminClient
      .from("users")
      .insert({
        auth_id: authUser.id,
        nome,
        email,
        role_id: roleColaborador.id,
        horario_entrada: "08:00",
        horario_saida_almoco: "12:00",
        horario_retorno_almoco: "13:00",
        horario_saida: "17:00",
        ativo: true,
        aprovado: false,
      })
      .select()
      .single();

    if (insertError) {
      await adminClient.auth.admin.deleteUser(authUser.id);
      return json({ error: insertError.message }, 400);
    }

    return json({ user: novoUsuario }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
