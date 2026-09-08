import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("id, roles(nome)")
      .eq("auth_id", authData.user.id)
      .single();

    const rolesData = callerProfile?.roles as { nome?: string } | { nome?: string }[] | null;
    const roleName = Array.isArray(rolesData) ? rolesData[0]?.nome : rolesData?.nome;

    if (profileError || roleName !== "Administrador") {
      return json({ error: "Apenas administradores podem convidar usuários." }, 403);
    }

    const body = await req.json();
    const {
      email,
      nome,
      cargo,
      equipe,
      role_id,
      horario_entrada,
      horario_saida_almoco,
      horario_retorno_almoco,
      horario_saida,
      redirect_origin,
    } = body ?? {};

    if (!email || !nome || !role_id) {
      return json({ error: "Campos obrigatórios faltando (email, nome, role_id)." }, 400);
    }

    const origem = typeof redirect_origin === "string" && redirect_origin.startsWith("http")
      ? redirect_origin
      : "http://localhost:5173";

    // Pode já existir uma linha "só de cobertura" pra esse e-mail (criada
    // direto no banco, auth_id null, só pra contar no cálculo de horário
    // do time). Checa ANTES de convidar: se já tem auth_id, é conflito de
    // verdade (não sobrescreve outra conta); se não tem, depois do convite
    // vincula o Auth novo a essa linha em vez de inserir uma nova e perder
    // jornada/histórico já cadastrados. Escapa % e _ pra não serem coringa
    // do ILIKE.
    const { data: existente } = await adminClient
      .from("users")
      .select("*")
      .ilike("email", (email as string).replace(/[%_]/g, "\\$&"))
      .maybeSingle();
    if (existente?.auth_id) {
      return json({ error: "Já existe uma conta com este e-mail." }, 409);
    }

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origem}/definir-senha`,
    });
    if (inviteError || !inviteData?.user) {
      return json({ error: inviteError?.message ?? "Não foi possível enviar o convite." }, 400);
    }

    if (existente) {
      const { data: vinculado, error: updateError } = await adminClient
        .from("users")
        .update({ auth_id: inviteData.user.id })
        .eq("id", existente.id)
        .select()
        .single();
      if (updateError) {
        await adminClient.auth.admin.deleteUser(inviteData.user.id);
        return json({ error: updateError.message }, 400);
      }
      return json({ user: vinculado }, 200);
    }

    const { data: novoUsuario, error: insertError } = await adminClient
      .from("users")
      .insert({
        auth_id: inviteData.user.id,
        nome,
        email,
        cargo: cargo ?? null,
        equipe: equipe ?? null,
        role_id,
        horario_entrada: horario_entrada ?? "08:00",
        horario_saida_almoco: horario_saida_almoco ?? "12:00",
        horario_retorno_almoco: horario_retorno_almoco ?? "13:00",
        horario_saida: horario_saida ?? "17:00",
        ativo: true,
      })
      .select()
      .single();

    if (insertError) {
      await adminClient.auth.admin.deleteUser(inviteData.user.id);
      return json({ error: insertError.message }, 400);
    }

    return json({ user: novoUsuario }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
