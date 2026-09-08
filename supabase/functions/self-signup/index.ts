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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { nome, email, senha } = body ?? {};

    if (!nome || !email || !senha) {
      return json({ error: "Campos obrigatórios faltando (nome, email, senha)." }, 400);
    }
    if (typeof senha !== "string" || senha.length < 8) {
      return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    }
    // Validação de domínio no servidor — a do cliente é só UX, esta é a que
    // vale de verdade (mesmo princípio de RLS/backend usado no resto da
    // plataforma: nunca confiar só no frontend pra regra de acesso).
    if (typeof email !== "string" || !email.toLowerCase().endsWith(DOMINIO_PERMITIDO)) {
      return json({ error: `Cadastro liberado só pra e-mails ${DOMINIO_PERMITIDO}.` }, 400);
    }

    // Pode já existir uma linha pra esse e-mail (conta "só de cobertura",
    // ou já convidada). Diferente do login via Google, aqui não tem
    // nenhuma garantia de que quem preencheu o formulário é dono desse
    // e-mail — então não vincula automaticamente, só recusa de forma
    // clara. Checa ANTES de criar o usuário no Auth, pra não precisar
    // desfazer nada. Escapa % e _ pra não serem coringa do ILIKE.
    const { data: existente } = await adminClient
      .from("users")
      .select("id")
      .ilike("email", email.replace(/[%_]/g, "\\$&"))
      .maybeSingle();
    if (existente) {
      return json(
        { error: "Já existe uma conta com este e-mail. Use 'Entrar com Google' ou contate um administrador." },
        409
      );
    }

    const { data: roleColaborador, error: roleError } = await adminClient
      .from("roles")
      .select("id")
      .eq("nome", "Colaborador")
      .single();
    if (roleError || !roleColaborador) {
      return json({ error: "Perfil padrão (Colaborador) não encontrado." }, 500);
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (authError || !authData?.user) {
      return json({ error: authError?.message ?? "Não foi possível criar a conta." }, 400);
    }

    const { data: novoUsuario, error: insertError } = await adminClient
      .from("users")
      .insert({
        auth_id: authData.user.id,
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
      // Nunca deixar o usuário do Auth órfão sem registro em public.users
      // vinculado — mesmo padrão de rollback da invite-user (esse vínculo
      // quebrado já derrubou o Hub em produção antes).
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return json({ error: insertError.message }, 400);
    }

    return json({ user: novoUsuario }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
