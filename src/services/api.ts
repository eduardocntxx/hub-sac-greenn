import { supabase } from "@/integrations/supabase/client";
import type {
  DbAnnouncement,
  DbTool,
  DbCourse,
  DbDocumentation,
  DbMission,
  DbMissionProgress,
  DbCsatResult,
  DbUser,
  DbModule,
  DbUserPermission,
  CollaboratorStatus,
  DbCourseProgress,
  DbReclameAquiCase,
  DbReclameAquiMetric,
  DbNpsResponse,
  DbCrispConversation,
  DbHelpdesk,
} from "@/types/database";

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env."
    );
  }
  return supabase;
}

// Chama uma Edge Function e propaga a mensagem de erro real do corpo da
// resposta. Quando a função responde com status não-2xx, o client do
// Supabase joga tudo em `error` (um FunctionsHttpError genérico,
// "Edge Function returned a non-2xx status code") e `data` vem `null` —
// a mensagem específica que a função quis mandar só existe dentro de
// `error.context` (a Response crua), nunca em `data.error`. Sem isso, todo
// erro de validação de uma Edge Function (inclusive os já existentes,
// como invite-user) aparece genérico pro usuário em vez do motivo real.
async function invokeFunction<T>(nome: string, body: object): Promise<T> {
  const { data, error } = await client().functions.invoke(nome, { body });
  if (error) {
    let mensagem = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const corpo = await context.clone().json();
        if (corpo?.error) mensagem = corpo.error;
      } catch {
        // corpo não era JSON — mantém a mensagem genérica
      }
    }
    throw new Error(mensagem);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ---------- Perfil / Usuários ----------

export async function fetchCurrentProfile(authId: string): Promise<DbUser | null> {
  const { data, error } = await client()
    .from("users")
    .select("*, roles(*)")
    .eq("auth_id", authId)
    .maybeSingle();
  if (error) throw error;
  return data as DbUser | null;
}

export async function fetchUsers(): Promise<DbUser[]> {
  const { data, error } = await client()
    .from("users")
    .select("*, roles(*)")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as DbUser[];
}

export async function upsertUser(user: Partial<DbUser> & { id?: string }) {
  const { data, error } = await client().from("users").upsert(user).select().single();
  if (error) throw error;
  return data as DbUser;
}

export async function approveUser(id: string) {
  const { data, error } = await client()
    .from("users")
    .update({ aprovado: true })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DbUser;
}

export async function updateOwnProfile(id: string, dados: { nome: string; cargo: string; equipe: string }) {
  const { data, error } = await client().from("users").update(dados).eq("id", id).select().single();
  if (error) throw error;
  return data as DbUser;
}

export async function deleteUser(id: string) {
  const { error } = await client().from("users").delete().eq("id", id);
  if (error) throw error;
}

export interface InviteUserInput {
  email: string;
  nome: string;
  cargo?: string;
  equipe?: string;
  role_id: string;
  horario_entrada: string;
  horario_saida_almoco: string;
  horario_retorno_almoco: string;
  horario_saida: string;
}

// Convida um usuário novo: cria o acesso no Supabase Auth (manda e-mail de
// convite pra pessoa definir a própria senha) e já vincula o auth_id em
// public.users — tudo numa Edge Function, nunca expondo a service role key.
export async function inviteUser(input: InviteUserInput): Promise<DbUser> {
  const { user } = await invokeFunction<{ user: DbUser }>("invite-user", {
    ...input,
    redirect_origin: window.location.origin,
  });
  return user;
}

export interface SignUpInput {
  nome: string;
  email: string;
  senha: string;
}

// Autocadastro público (domínio @greenn.com.br, validado no servidor pela
// própria Edge Function) — conta nasce com aprovado=false, sem acesso ao
// Hub até um admin aprovar em Administração → Usuários.
export async function signUpUser(input: SignUpInput): Promise<DbUser> {
  const { user } = await invokeFunction<{ user: DbUser }>("self-signup", input);
  return user;
}

// Chamada logo após um login via Google que ainda não tem public.users
// vinculado (primeiro acesso) — cria o vínculo (aprovado=false) se o
// e-mail for @greenn.com.br, ou desfaz o usuário do Auth caso contrário.
export async function completeOAuthSignup(): Promise<DbUser> {
  const { user } = await invokeFunction<{ user: DbUser }>("complete-oauth-signup", {});
  return user;
}

export async function fetchRoles() {
  const { data, error } = await client().from("roles").select("*").order("nome");
  if (error) throw error;
  return data;
}

// ---------- Comunicados / Atualizações ----------

export async function fetchAnnouncements(limit?: number): Promise<DbAnnouncement[]> {
  let query = client()
    .from("announcements")
    .select("*")
    .eq("ativo", true)
    .order("fixado", { ascending: false })
    .order("data_publicacao", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbAnnouncement[];
}

export async function fetchAllAnnouncements(): Promise<DbAnnouncement[]> {
  const { data, error } = await client()
    .from("announcements")
    .select("*")
    .order("data_publicacao", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbAnnouncement[];
}

export async function upsertAnnouncement(a: Partial<DbAnnouncement> & { id?: string }) {
  const { data, error } = await client().from("announcements").upsert(a).select().single();
  if (error) throw error;
  return data as DbAnnouncement;
}

export async function deleteAnnouncement(id: string) {
  const { error } = await client().from("announcements").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Outros Links (antiga "Ferramentas") ----------

export async function fetchTools(): Promise<DbTool[]> {
  const { data, error } = await client()
    .from("tools")
    .select("*")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as DbTool[];
}

// Para o admin: traz também os links inativos
export async function fetchAllTools(): Promise<DbTool[]> {
  const { data, error } = await client().from("tools").select("*").order("ordem");
  if (error) throw error;
  return (data ?? []) as DbTool[];
}

export async function upsertTool(tool: Partial<DbTool> & { id?: string }) {
  const { data, error } = await client().from("tools").upsert(tool).select().single();
  if (error) throw error;
  return data as DbTool;
}

export async function deleteTool(id: string) {
  const { error } = await client().from("tools").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Cursos ----------

export async function fetchCourses(): Promise<DbCourse[]> {
  const { data, error } = await client()
    .from("courses")
    .select("*")
    .eq("publicado", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as DbCourse[];
}

export async function fetchAllCourses(): Promise<DbCourse[]> {
  const { data, error } = await client().from("courses").select("*").order("ordem");
  if (error) throw error;
  return (data ?? []) as DbCourse[];
}

export async function upsertCourse(c: Partial<DbCourse> & { id?: string }) {
  const { data, error } = await client().from("courses").upsert(c).select().single();
  if (error) throw error;
  return data as DbCourse;
}

export async function deleteCourse(id: string) {
  const { error } = await client().from("courses").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Documentação ----------

export async function fetchDocumentation(): Promise<DbDocumentation[]> {
  const { data, error } = await client()
    .from("documentation")
    .select("*")
    .eq("publicado", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as DbDocumentation[];
}

export async function fetchAllDocumentation(): Promise<DbDocumentation[]> {
  const { data, error } = await client().from("documentation").select("*").order("ordem");
  if (error) throw error;
  return (data ?? []) as DbDocumentation[];
}

export async function upsertDocumentation(d: Partial<DbDocumentation> & { id?: string }) {
  const { data, error } = await client().from("documentation").upsert(d).select().single();
  if (error) throw error;
  return data as DbDocumentation;
}

export async function deleteDocumentation(id: string) {
  const { error } = await client().from("documentation").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Missões ----------

// Para quem tem permissão de gerenciar Missões: traz todas, ativas ou não
export async function fetchAllMissions(): Promise<DbMission[]> {
  const { data, error } = await client()
    .from("missions")
    .select("*, responsavel:users!missions_responsavel_id_fkey(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbMission[];
}

export async function upsertMission(mission: Partial<DbMission> & { id?: string }) {
  const { data, error } = await client().from("missions").upsert(mission).select().single();
  if (error) throw error;
  return data as DbMission;
}

export async function deleteMission(id: string) {
  const { error } = await client().from("missions").delete().eq("id", id);
  if (error) throw error;
}

export async function claimMission(missionId: string) {
  const { data, error } = await client().rpc("claim_mission", { p_mission_id: missionId });
  if (error) throw error;
  return data as DbMission;
}

export async function updateMyMissionProgress(missionId: string, atual: number) {
  const { data, error } = await client().rpc("update_my_mission_progress", {
    p_mission_id: missionId,
    p_atual: atual,
  });
  if (error) throw error;
  return data as DbMissionProgress;
}

export async function fetchMissionProgress(userId: string): Promise<DbMissionProgress[]> {
  const { data, error } = await client()
    .from("mission_progress")
    .select("*, missions(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as DbMissionProgress[];
}

// ---------- CSAT ----------

// Bug real achado em 2026-09-23 (auditoria pedida pelo usuário em Meu
// Painel): esta função buscava `csat_results` direto por e-mail, sem o
// mesmo filtro `cliente_e_teste()` que já existe em toda função SQL de
// agregação (`atendente_performance` etc.) — o próprio Eduardo testando o
// widget de CSAT contava como avaliação real dele mesmo. Medido: 40
// avaliações "brutas" pro Eduardo no mês, 23 (57%) eram teste — "boas"
// saía 80% quando o real é 70,6% (17 avaliações). Corrigido trocando pra
// `csat_resultados_atendente()`, função SQL nova que já filtra teste (não
// `security definer` — roda como quem chama, RLS da tabela continua
// valendo igual antes).
export async function fetchCsatForUser(email: string): Promise<DbCsatResult[]> {
  const { data, error } = await client().rpc("csat_resultados_atendente", { p_email: email });
  if (error) throw error;
  return (data ?? []) as DbCsatResult[];
}

// ---------- Reunião de Resultados ----------





// ---------- Permissões granulares ----------

export async function fetchModules(): Promise<DbModule[]> {
  const { data, error } = await client().from("modules").select("*").order("ordem");
  if (error) throw error;
  return (data ?? []) as DbModule[];
}

export async function upsertRole(r: { id?: string; nome: string; descricao?: string }) {
  const { data, error } = await client().from("roles").upsert(r).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRole(id: string) {
  const { error } = await client().from("roles").delete().eq("id", id);
  if (error) throw error;
}

// Permissões do usuário atualmente logado (usado pelo front para decidir o que mostrar)
export async function fetchMyPermissions(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from("user_permissions")
    .select("pode_gerenciar, modules(slug)")
    .eq("user_id", userId)
    .eq("pode_gerenciar", true);
  if (error) throw error;
  return (data ?? [])
    .map((row) => {
      const modules = row.modules as { slug: string | null } | { slug: string | null }[] | null;
      const modulo = Array.isArray(modules) ? modules[0] : modules;
      return modulo?.slug;
    })
    .filter((s): s is string => Boolean(s));
}

// Todas as permissões concedidas (usado na tela de administração)
export async function fetchAllUserPermissions(): Promise<DbUserPermission[]> {
  const { data, error } = await client()
    .from("user_permissions")
    .select("*, modules(*)");
  if (error) throw error;
  return (data ?? []) as DbUserPermission[];
}

export async function grantPermission(userId: string, moduleId: string) {
  const { error } = await client()
    .from("user_permissions")
    .upsert(
      { user_id: userId, module_id: moduleId, pode_gerenciar: true },
      { onConflict: "user_id,module_id" }
    );
  if (error) throw error;
}

export async function revokePermission(userId: string, moduleId: string) {
  const { error } = await client()
    .from("user_permissions")
    .delete()
    .eq("user_id", userId)
    .eq("module_id", moduleId);
  if (error) throw error;
}

// ---------- Status dos colaboradores (Home) ----------

export interface ColaboradorStatusInfo {
  id: string;
  user_id: string;
  status: CollaboratorStatus;
  horario_inicio: string | null;
  horario_fim: string | null;
  updated_at: string;
  nome: string;
  cargo: string | null;
}

// RPC security definer em vez de select("*, users(*)") direto: a policy de
// SELECT de public.users só libera a própria linha pra quem não é admin
// (users_select_own_or_admin), então o embed implícito vinha null pra
// qualquer colega que não fosse o próprio usuário logado — Colaboradores
// Online só "funcionava" pra admin, nunca detectado porque só o admin
// tinha testado até um colaborador de verdade logar (ver CLAUDE.md).
// Expõe só nome/cargo, nada sensível (email, auth_id, jornada de trabalho).
export async function fetchUserStatuses(): Promise<ColaboradorStatusInfo[]> {
  const { data, error } = await client().rpc("colaboradores_online");
  if (error) throw error;
  return (data ?? []) as ColaboradorStatusInfo[];
}

export async function upsertMyStatus(userId: string, status: CollaboratorStatus) {
  const { error } = await client()
    .from("user_status")
    .upsert({ user_id: userId, status }, { onConflict: "user_id" });
  if (error) throw error;
}

// Marca o usuário como "online" ao entrar no Hub, sem sobrescrever um status
// que a própria pessoa já tenha escolhido manualmente (almoço, folga, férias,
// plantão) — só assume quando não há registro ainda ou quando está "offline".
export async function ensureOnlineStatus(userId: string) {
  const { data, error } = await client()
    .from("user_status")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "offline") {
    await upsertMyStatus(userId, "online");
  }
}

// ---------- Progresso de cursos ----------

export async function fetchCourseProgressForUser(userId: string): Promise<DbCourseProgress[]> {
  const { data, error } = await client()
    .from("course_progress")
    .select("*, courses(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as DbCourseProgress[];
}

// ---------- Módulo CSAT (planilha + dashboard) ----------

export interface CsatFilters {
  busca?: string;
  emailAtendente?: string;
  canal?: string;
  topico?: string;
  categoriaCliente?: string;
  nota?: number;
  classificacaoCsat?: "Promotor" | "Detrator";
  inicio?: Date;
  fim?: Date;
  sortBy?: string;
  sortAsc?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CsatTempoReal {
  tempo_primeira_resposta_seg: number | null;
  tempo_encerramento_seg: number | null;
}

// csat_results.tempo_primeira_resposta_seg/tempo_encerramento_seg nunca são
// preenchidos pelo n8n (ver CLAUDE.md) — mas csat_results.crisp_id passou a
// vir populado pro dado recente (desde 26/08/2026), permitindo buscar o
// tempo real direto em crisp_conversations quando esse vínculo existe.
// Retorna null quando não há vínculo (dado antigo) ou sem permissão.
export async function fetchCsatTempoReal(crispId: string): Promise<CsatTempoReal | null> {
  const { data, error } = await client().rpc("csat_tempo_real", { p_crisp_id: crispId });
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

// Correção manual de metadado (RLS já libera admin/permissão "csat" via
// csat_write_admin_or_perm) — nunca inclui "nota", que é o dado real que o
// cliente deu na pesquisa, não um metadado de atribuição/classificação.
export async function updateCsatResult(
  id: string,
  payload: Partial<
    Pick<
      DbCsatResult,
      "atendente" | "email_atendente" | "cliente" | "telefone" | "email" | "numero_whatsapp" | "canal" | "topico" | "categoria_cliente" | "tags_cliente" | "comentario" | "link_chamado"
    >
  >
): Promise<DbCsatResult> {
  const { data, error } = await client()
    .from("csat_results")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DbCsatResult;
}

export async function fetchCsatFiltered(
  filters: CsatFilters
): Promise<{ rows: DbCsatResult[]; count: number }> {
  const {
    busca,
    emailAtendente,
    canal,
    topico,
    categoriaCliente,
    nota,
    classificacaoCsat,
    inicio,
    fim,
    sortBy = "data_hora",
    sortAsc = false,
    page = 0,
    pageSize = 10,
  } = filters;

  let query = client().from("csat_results").select("*", { count: "exact" });

  if (busca) query = query.or(`comentario.ilike.%${busca}%,atendente.ilike.%${busca}%`);
  if (emailAtendente) query = query.eq("email_atendente", emailAtendente);
  if (canal) query = query.eq("canal", canal);
  if (topico) query = query.eq("topico", topico);
  if (categoriaCliente) query = query.eq("categoria_cliente", categoriaCliente);
  if (nota) query = query.eq("nota", nota);
  // classificacao_csat é texto cru do n8n com vocabulário inconsistente
  // (ver comentário em types/database.ts) — filtra por nota, nunca por
  // igualdade de texto contra essa coluna.
  if (classificacaoCsat === "Promotor") query = query.gte("nota", 4);
  else if (classificacaoCsat === "Detrator") query = query.lte("nota", 3);
  if (inicio) query = query.gte("data_hora", inicio.toISOString());
  if (fim) query = query.lte("data_hora", fim.toISOString());

  query = query
    .order(sortBy, { ascending: sortAsc })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as DbCsatResult[], count: count ?? 0 };
}

// Sem paginação, para o dashboard e para exportação (mesmos filtros, sem limite)
export async function fetchCsatForDashboard(
  filters: Omit<CsatFilters, "page" | "pageSize" | "sortBy" | "sortAsc">
): Promise<DbCsatResult[]> {
  const { busca, emailAtendente, canal, topico, categoriaCliente, nota, classificacaoCsat, inicio, fim } =
    filters;
  let query = client().from("csat_results").select("*");

  if (busca) query = query.or(`comentario.ilike.%${busca}%,atendente.ilike.%${busca}%`);
  if (emailAtendente) query = query.eq("email_atendente", emailAtendente);
  if (canal) query = query.eq("canal", canal);
  if (topico) query = query.eq("topico", topico);
  if (categoriaCliente) query = query.eq("categoria_cliente", categoriaCliente);
  if (nota) query = query.eq("nota", nota);
  if (classificacaoCsat === "Promotor") query = query.gte("nota", 4);
  else if (classificacaoCsat === "Detrator") query = query.lte("nota", 3);
  if (inicio) query = query.gte("data_hora", inicio.toISOString());
  if (fim) query = query.lte("data_hora", fim.toISOString());

  const { data, error } = await query.order("data_hora", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbCsatResult[];
}

// ---------- Analytics avançado (agregados via função no Postgres) ----------

export interface AnalyticsFilters {
  inicio: Date;
  fim: Date;
  equipe?: string;
  canal?: string;
  categoriaCliente?: string;
}

export interface AnalyticsSummary {
  total_avaliacoes: number;
  media_csat: number | null;
  media_csat_10: number | null;
  percentual_satisfacao: number | null;
  tempo_1resposta_medio: number | null;
  tempo_encerramento_medio: number | null;
}

export async function fetchAnalyticsSummary(f: AnalyticsFilters): Promise<AnalyticsSummary | null> {
  const { data, error } = await client().rpc("analytics_summary", {
    data_inicio: f.inicio.toISOString(),
    data_fim: f.fim.toISOString(),
    p_equipe: f.equipe ?? null,
    p_canal: f.canal ?? null,
    p_categoria_cliente: f.categoriaCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as AnalyticsSummary | null;
}

export interface TfrTtrPercentis {
  tfr_amostras: number;
  tfr_media: number | null;
  tfr_p50: number | null;
  tfr_p90: number | null;
  tfr_p95: number | null;
  tfr_sla_pct: number | null;
  ttr_amostras: number;
  ttr_media: number | null;
  ttr_p50: number | null;
  ttr_p90: number | null;
  ttr_p95: number | null;
  ttr_sla_pct: number | null;
  // Resolução final (ttr_media acima) é a resolução mais recente — se o
  // chamado reabriu, esse tempo inclui a demora até resolver de novo. Esta
  // é a 1ª resolução (nunca sobrescrita), pra separar "quanto demorou a
  // primeira vez" de "quanto demorou no total até fechar de vez".
  ttr_primeira_resolucao_amostras: number;
  ttr_primeira_resolucao_media: number | null;
}

// "uteis" desconta fora de expediente (minutos_uteis_entre_time); "corridas"
// é o tempo de relógio cru, sem desconto. Afeta só TFR/TTR/tempo de
// resolução — posse e espera do cliente já são sempre "corridas" por
// natureza (não faz sentido descontar expediente de quanto tempo um cliente
// literalmente esperou).
export type ModoTempo = "uteis" | "corridas";

export async function fetchTfrTtrPercentis(
  inicio: Date,
  fim: Date,
  canal?: string,
  atendenteNomes?: string[],
  modoTempo: ModoTempo = "uteis",
  tipoCliente?: string
): Promise<TfrTtrPercentis | null> {
  const { data, error } = await client().rpc("tfr_ttr_percentis", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_modo_tempo: modoTempo,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as TfrTtrPercentis | null;
}

export interface RelogioPosse {
  atendente: string;
  minutos_posse: number;
  chamados: number;
}

// Só considera chamados já resolvidos no período — pra chamado ainda
// pendente, "posse" cresceria indefinidamente enquanto ninguém retomar,
// o que infla o agregado sem refletir trabalho de verdade (ver CLAUDE.md).
export async function fetchRelogioPosse(inicio: Date, fim: Date, canal?: string, tipoCliente?: string): Promise<RelogioPosse[]> {
  const { data, error } = await client().rpc("relogio_posse_periodo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as RelogioPosse[];
}

export interface RelogioEsperaCliente {
  amostras: number;
  minutos_espera_medio: number | null;
  minutos_espera_total: number | null;
}

export async function fetchRelogioEsperaCliente(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<RelogioEsperaCliente | null> {
  const { data, error } = await client().rpc("relogio_espera_cliente", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as RelogioEsperaCliente | null;
}

// Horas de expediente cadastrado (união das jornadas dos usuários ativos)
// no período — mesmo cálculo que já desconta fora de expediente em TFR/TTR
// ("horas úteis"), só que aqui aplicado ao período inteiro, não a um
// chamado específico. É "capacidade nominal", não "estava online de fato" —
// o Crisp não expõe presença/status do operador pela API. Sem
// atendenteNomes, é a união do time inteiro; com, só das pessoas
// selecionadas (sábado fixo 08-12 só entra na versão sem filtro — não dá
// pra atribuir esse plantão a uma pessoa específica aqui).
export async function fetchHorasExpedientePeriodo(inicio: Date, fim: Date, atendenteNomes?: string[]): Promise<number> {
  const { data, error } = await client().rpc("minutos_uteis_entre_time", {
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export interface TransferenciasResumo {
  total_atendidos: number;
  total_transferidos: number;
  taxa_pct: number | null;
  total_eventos: number;
  tempo_medio_antes_seg: number | null;
}

// Só conta handoff entre dois atendentes HUMANOS de verdade (exclui o
// marcador sintético do bot e a conta real "IA Greenn"/allan@gdigital.com.br
// — ver CLAUDE.md seção 10) — passar a bola do bot pro humano é fluxo
// normal de escalonamento, não é "transferência" no sentido de fricção
// operacional que essa métrica quer capturar.
export async function fetchTransferenciasResumo(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], modoTempo: ModoTempo = "uteis", tipoCliente?: string): Promise<TransferenciasResumo | null> {
  const { data, error } = await client().rpc("transferencias_resumo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_modo_tempo: modoTempo,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as TransferenciasResumo | null;
}

export interface TransferenciaCaso {
  crisp_id: string | null;
  cliente_nome: string | null;
  origem: string | null;
  destino: string | null;
  event_at: string;
  tempo_antes_seg: number | null;
  link_chamado: string | null;
}

// A função SQL pagina de verdade (p_limit/p_offset + total_count) porque o
// PostgREST corta silenciosamente qualquer resposta de RPC em 1000 linhas —
// sem isso, um período com mais de 1000 eventos de transferência perdia o
// restante sem erro nenhum (bug real encontrado em 2026-09-02). Aqui
// buscamos todas as páginas de uma vez porque essa lista é sempre consumida
// inteira no cliente (mapas de Origem/Destino, tabela "Ver mais"), sem
// paginação própria de UI.
export async function fetchTransferenciasCasos(inicio: Date, fim: Date, canal?: string, modoTempo: ModoTempo = "uteis", atendenteNomes?: string[], tipoCliente?: string): Promise<TransferenciaCaso[]> {
  const BLOCO = 500;
  const todos: TransferenciaCaso[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client().rpc("transferencias_casos", {
      data_inicio: inicio.toISOString(),
      data_fim: fim.toISOString(),
      p_canal: canal ?? null,
      p_modo_tempo: modoTempo,
      p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
      p_tipo_cliente: tipoCliente ?? null,
      p_limit: BLOCO,
      p_offset: offset,
    });
    if (error) throw error;
    const rows = (data ?? []) as (TransferenciaCaso & { total_count: number })[];
    todos.push(...rows);
    const total = rows[0]?.total_count ?? 0;
    if (rows.length < BLOCO || todos.length >= total) break;
    offset += BLOCO;
  }
  return todos;
}

export interface FcrRecontatoResumo {
  total_elegiveis: number;
  total_fcr: number;
  fcr_pct: number | null;
  total_recontato: number;
  recontato_pct: number | null;
}

// "Elegível" = conversa com a 1ª resolução no período e cliente identificado
// (people_id ou e-mail). FCR = o cliente não voltou em 7 dias (conversa nova ou
// reabertura real). Recontato = só conversa nova, qualquer tópico (desde
// 2026-09-25; tópico é texto livre e quase nunca se repete igual).
export async function fetchFcrRecontatoResumo(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<FcrRecontatoResumo | null> {
  const { data, error } = await client().rpc("fcr_recontato_resumo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as FcrRecontatoResumo | null;
}

export interface RecontatoCaso {
  crisp_id: string | null;
  cliente_nome: string | null;
  topico: string | null;
  atendente: string | null;
  resolved_at: string;
  proximo_contato_at: string | null;
  link_chamado: string | null;
}

export async function fetchRecontatoCasos(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<RecontatoCaso[]> {
  const { data, error } = await client().rpc("recontato_casos", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as RecontatoCaso[];
}

export interface MotivoContatoResumo {
  topico: string;
  chamados: number;
  tfr_media_seg: number | null;
  ttr_media_seg: number | null;
}

// Mesmo motivo do fix em fetchTransferenciasCasos acima: tópico é texto
// livre de alta cardinalidade (3500+ valores distintos hoje) — sem paginar
// de verdade, o PostgREST cortava a resposta em 1000 tópicos, silenciosamente
// descartando ~70% da lista (bug real encontrado em 2026-09-02).
export async function fetchMotivoContatoResumo(inicio: Date, fim: Date, canal?: string, modoTempo: ModoTempo = "uteis", atendenteNomes?: string[], tipoCliente?: string): Promise<MotivoContatoResumo[]> {
  const BLOCO = 500;
  const todos: MotivoContatoResumo[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client().rpc("motivo_contato_resumo", {
      data_inicio: inicio.toISOString(),
      data_fim: fim.toISOString(),
      p_canal: canal ?? null,
      p_modo_tempo: modoTempo,
      p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
      p_tipo_cliente: tipoCliente ?? null,
      p_limit: BLOCO,
      p_offset: offset,
    });
    if (error) throw error;
    const rows = (data ?? []) as (MotivoContatoResumo & { total_count: number })[];
    todos.push(...rows);
    const total = rows[0]?.total_count ?? 0;
    if (rows.length < BLOCO || todos.length >= total) break;
    offset += BLOCO;
  }
  return todos;
}

export interface MetricaTipoCliente {
  tipo_cliente: string;
  chamados: number;
  tfr_media_seg: number | null;
  ttr_media_seg: number | null;
}

// "Geral" (time inteiro, sem filtro de tag) + 1 linha por tipo_cliente real
// (+"Sem tipo") — média E mediana, horas úteis E corridas juntas, sem
// precisar de toggle nem de chamada em dobro. Usada só pelos cards
// segmentados de Velocidade do Overview — não confundir com
// MetricaTipoCliente (fetchMetricasPorTipoCliente), usada por outras 3
// telas (Home, Meu Painel, PPTX da Reunião de Resultados).
export interface VelocidadePorTipoCliente {
  tipo_cliente: string; // "Geral" | tag real | "Sem tipo"
  chamados: number;
  tfr_media_uteis_seg: number | null;
  tfr_p50_uteis_seg: number | null;
  tfr_media_corridas_seg: number | null;
  tfr_p50_corridas_seg: number | null;
  ttr_media_uteis_seg: number | null;
  ttr_p50_uteis_seg: number | null;
  ttr_media_corridas_seg: number | null;
  ttr_p50_corridas_seg: number | null;
}

export async function fetchVelocidadePorTipoCliente(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[]): Promise<VelocidadePorTipoCliente[]> {
  const { data, error } = await client().rpc("velocidade_por_tipo_cliente", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
  });
  if (error) throw error;
  return (data ?? []) as VelocidadePorTipoCliente[];
}

export interface ReaberturaPorTipoCliente {
  tipo_cliente: string; // "Geral" | tag real | "Sem tipo"
  total_resolvidos: number;
  total_reabertos: number;
  taxa_pct: number | null;
  total_eventos: number;
}

export async function fetchReaberturaPorTipoCliente(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[]): Promise<ReaberturaPorTipoCliente[]> {
  const { data, error } = await client().rpc("reabertura_por_tipo_cliente", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
  });
  if (error) throw error;
  return (data ?? []) as ReaberturaPorTipoCliente[];
}

// Um card por tipo_cliente que existir DE VERDADE no período — não é uma
// lista fixa de segmentos; quando o pipeline capturar um segmento novo,
// aparece aqui automaticamente, sem precisar mexer no código.
// atendenteNomes escopa pro próprio colaborador (Meu Painel) — sem admin,
// só retorna dado se for um array de 1 nome batendo com o usuário
// autenticado (checado no banco, não confiar só no parâmetro).
export async function fetchMetricasPorTipoCliente(inicio: Date, fim: Date, canal?: string, modoTempo: ModoTempo = "uteis", atendenteNomes?: string[]): Promise<MetricaTipoCliente[]> {
  const { data, error } = await client().rpc("metricas_por_tipo_cliente", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_modo_tempo: modoTempo,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
  });
  if (error) throw error;
  return (data ?? []) as MetricaTipoCliente[];
}

export interface ReaberturaResumo {
  total_resolvidos: number;
  total_reabertos: number;
  taxa_pct: number | null;
  total_eventos: number;
}

export async function fetchReaberturaResumo(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<ReaberturaResumo | null> {
  const { data, error } = await client().rpc("reabertura_resumo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as ReaberturaResumo | null;
}

export interface ReaberturaCaso {
  crisp_id: string | null;
  cliente_nome: string | null;
  topico: string;
  atendente: string | null;
  reopened_count: number;
  current_started_at: string;
  link_chamado: string | null;
}

export async function fetchReaberturaCasos(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<ReaberturaCaso[]> {
  const { data, error } = await client().rpc("reabertura_casos", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ReaberturaCaso[];
}

export interface CsatDistribuicao {
  boas: number;
  neutras: number;
  ruins: number;
  total: number;
}

export async function fetchCsatDistribuicao(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[]): Promise<CsatDistribuicao | null> {
  const { data, error } = await client().rpc("csat_distribuicao_notas", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as CsatDistribuicao | null;
}

export interface AtendenteCsatDistribuicao {
  atendente: string;
  total: number;
  boas: number;
  neutras: number;
  ruins: number;
}

// Boas/neutras/ruins por atendente (mesma chave de junção já usada em
// `atendente_performance()`: `csat_results.atendente` bate direto contra o
// nome canônico do operador) — usado no Ranking (CSAT%) e no card do Bot
// (Promotor/Neutro/Detrator) da Reunião de Resultados. Sem par "Anterior":
// nenhuma tela mostra delta pra esse recorte, mesmo padrão de
// `csatPorAtendente`/`atendente_performance`, que também não tem versão do
// período anterior.
export async function fetchAtendenteCsatDistribuicao(inicio: Date, fim: Date): Promise<AtendenteCsatDistribuicao[]> {
  const { data, error } = await client().rpc("atendente_csat_distribuicao", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as AtendenteCsatDistribuicao[];
}

export interface CsatEnviosPorAtendente {
  atendente: string;
  enviadas: number;
  respondidas: number;
}

// Pesquisas de CSAT enviadas no período (`csat_pending`, uma linha por
// conversa, dono da conversa no momento do envio) × quantas dessas
// conversas têm avaliação em `csat_results` (ligação por crisp_id —
// a coluna `respondido` de `csat_pending` subconta, não usar). Admin-only.
export async function fetchCsatEnviosPorAtendente(inicio: Date, fim: Date): Promise<CsatEnviosPorAtendente[]> {
  const { data, error } = await client().rpc("csat_envios_por_atendente", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return ((data ?? []) as CsatEnviosPorAtendente[]).map((r) => ({
    atendente: r.atendente,
    enviadas: Number(r.enviadas),
    respondidas: Number(r.respondidas),
  }));
}

export interface AtendidoNaoResolvido {
  atendente: string;
  abertos: number;
  parados_48h: number;
}

// Conversas do período com atendimento humano que continuam abertas, por
// dono atual (sem resolução o cliente não recebe a pesquisa de CSAT).
// "Parado" = sem mensagem nova há mais de 48h. Admin-only.
export async function fetchAtendidoNaoResolvido(inicio: Date, fim: Date): Promise<AtendidoNaoResolvido[]> {
  const { data, error } = await client().rpc("atendido_nao_resolvido", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return ((data ?? []) as AtendidoNaoResolvido[]).map((r) => ({
    atendente: r.atendente,
    abertos: Number(r.abertos),
    parados_48h: Number(r.parados_48h),
  }));
}

// Avaliações ruins (nota 1–3) do período, com os mesmos filtros do card de
// distribuição (sem teste, sem fora do SAC, atendente via e-mail do alias).
// Pior nota primeiro. Admin-only.
export async function fetchCsatRuins(inicio: Date, fim: Date, atendenteNomes?: string[]): Promise<DbCsatResult[]> {
  const { data, error } = await client().rpc("csat_ruins_periodo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
  });
  if (error) throw error;
  return (data ?? []) as DbCsatResult[];
}

export interface CsatFunilCanal {
  canal: string;
  conversas: number;
  com_humano: number;
  resolvidas: number;
  enviadas: number;
  respondidas: number;
}

// Funil do CSAT por canal: conversas → resolvidas → pesquisa enviada →
// respondida (ligação por crisp_id). Admin-only.
export async function fetchCsatFunilCanal(inicio: Date, fim: Date): Promise<CsatFunilCanal[]> {
  const { data, error } = await client().rpc("csat_funil_canal", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return ((data ?? []) as CsatFunilCanal[]).map((r) => ({
    canal: r.canal,
    conversas: Number(r.conversas),
    com_humano: Number(r.com_humano),
    resolvidas: Number(r.resolvidas),
    enviadas: Number(r.enviadas),
    respondidas: Number(r.respondidas),
  }));
}

export interface CsatDistribuicaoPorTipoCliente {
  tipo_cliente: string; // tag real (ex: "Produtor"/"Final") ou "Sem tipo"
  total: number;
  boas: number;
  neutras: number;
  ruins: number;
}

// CSAT é reconciliado por e-mail, não por operator_crisp_id — não tem
// relação nenhuma com `tipo_cliente` nativamente (decisão arquitetural, ver
// CLAUDE.md seção 21). Isso só existe via o vínculo direto
// `csat_results.crisp_id = crisp_conversations.crisp_id`, populado pelo n8n
// só a partir de 26/08/2026 (~40%+ das avaliações recentes, crescendo) —
// é uma AMOSTRA, não a contagem exata de CSAT por tipo de cliente.
export async function fetchCsatDistribuicaoPorTipoCliente(inicio: Date, fim: Date): Promise<CsatDistribuicaoPorTipoCliente[]> {
  const { data, error } = await client().rpc("csat_distribuicao_por_tipo_cliente", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as CsatDistribuicaoPorTipoCliente[];
}

export interface TempoRespostaBot {
  amostras: number;
  tempo_medio_seg: number | null;
}

export async function fetchTempoRespostaBot(inicio: Date, fim: Date, canal?: string, tipoCliente?: string): Promise<TempoRespostaBot | null> {
  const { data, error } = await client().rpc("tempo_resposta_bot", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as TempoRespostaBot | null;
}

// "SAC — Migrações" deixou de ser manual em 2026-09-23 — sincronizado via
// n8n a partir do projeto "Centralização" (gestao-tickets, Supabase
// unuulffumnmkpsogkznx) pra `public.migracoes_sync` no Hub SAC. Ver
// CLAUDE.md seção 10.
export interface MigracoesResumo {
  finalizados: number;
  em_progresso: number;
  aguardando: number;
  cancelados: number;
  total: number;
  // SLA vem de `v_ticket_sla` (Centralização) — "na" (sem SLA ativo,
  // geralmente ticket já finalizado/cancelado) não entra aqui de propósito,
  // só os 3 estados que importam pra quem ainda está em aberto.
  sla_ok: number;
  sla_risco: number;
  sla_atrasado: number;
}

export async function fetchMigracoesResumo(inicio: Date, fim: Date): Promise<MigracoesResumo | null> {
  const { data, error } = await client().rpc("migracoes_resumo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data?.[0] ?? null) as MigracoesResumo | null;
}

export interface MigracaoPorPlataforma {
  plataforma: string;
  total: number;
}

export async function fetchMigracoesPorPlataforma(inicio: Date, fim: Date): Promise<MigracaoPorPlataforma[]> {
  const { data, error } = await client().rpc("migracoes_por_plataforma", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as MigracaoPorPlataforma[];
}

export interface ContagemPeriodo {
  total_chamados: number;
  total_conversas: number;
  total_mensagens: number;
}

export async function fetchContagemPeriodo(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<ContagemPeriodo | null> {
  const { data, error } = await client().rpc("contagem_periodo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as ContagemPeriodo | null;
}

export interface BacklogFaixa {
  faixa: string;
  total: number;
}

export interface VolumeDiaHora {
  dia_semana: number; // 0=domingo .. 6=sábado (extract(dow), mesma convenção de cobertura_semanal)
  hora: number; // 0-23, horário de Brasília
  chamados: number;
}

export async function fetchVolumeDiaHora(inicio: Date, fim: Date, canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<VolumeDiaHora[]> {
  const { data, error } = await client().rpc("volume_dia_hora", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as VolumeDiaHora[];
}

export async function fetchBacklogPorIdade(canal?: string, atendenteNomes?: string[], tipoCliente?: string): Promise<BacklogFaixa[]> {
  const { data, error } = await client().rpc("backlog_por_idade", {
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as BacklogFaixa[];
}

export interface BacklogCaso {
  crisp_id: string | null;
  cliente_nome: string | null;
  operator_nome: string | null;
  topico: string | null;
  canal: string | null;
  status: string | null;
  current_started_at: string;
  idade_dias: number;
  link_chamado: string | null;
  total_count: number;
}

export async function fetchBacklogCasos(
  faixa: string,
  canal?: string,
  atendenteNomes?: string[],
  page = 0,
  pageSize = 15,
  direcao: "asc" | "desc" = "asc",
  tipoCliente?: string
): Promise<{ rows: BacklogCaso[]; count: number }> {
  const { data, error } = await client().rpc("backlog_casos", {
    p_faixa: faixa,
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_limit: pageSize,
    p_offset: page * pageSize,
    p_direcao: direcao,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as BacklogCaso[];
  return { rows, count: rows[0]?.total_count ?? 0 };
}

// "Resposta genérica da IA" — achado #1 de uma auditoria externa qualitativa
// do SAC (leitura de conversa por conversa): o bot responde "Pode me dar
// mais detalhes da sua solicitação" mesmo quando o cliente já mandou todo o
// contexto (ex: e-mail com fatura). Validado contra nosso próprio banco
// (33,1% das conversas, 2026-09-03) — bate perto do achado externo (35%).
export interface RespostaGenericaResumo {
  total_conversas: number;
  total_com_generico: number;
  taxa_pct: number | null;
  generico_sem_resposta_depois: number;
}

export async function fetchRespostaGenericaResumo(
  inicio: Date,
  fim: Date,
  canal?: string,
  atendenteNomes?: string[],
  tipoCliente?: string
): Promise<RespostaGenericaResumo | null> {
  const { data, error } = await client().rpc("resposta_generica_resumo", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as RespostaGenericaResumo | null;
}

export interface RespostaGenericaCaso {
  crisp_id: string;
  cliente_nome: string | null;
  canal: string | null;
  atendente: string | null;
  topico: string | null;
  primeira_generica_at: string;
  sem_resposta_depois: boolean;
  link_chamado: string | null;
  total_count: number;
}

export async function fetchRespostaGenericaCasos(
  inicio: Date,
  fim: Date,
  canal?: string,
  atendenteNomes?: string[],
  tipoCliente?: string,
  soSemResposta = false,
  page = 0,
  pageSize = 15
): Promise<{ rows: RespostaGenericaCaso[]; count: number }> {
  const { data, error } = await client().rpc("resposta_generica_casos", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_atendente_nomes: atendenteNomes && atendenteNomes.length > 0 ? atendenteNomes : null,
    p_tipo_cliente: tipoCliente ?? null,
    p_so_sem_resposta: soSemResposta,
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  if (error) throw error;
  const rows = (data ?? []) as RespostaGenericaCaso[];
  return { rows, count: rows[0]?.total_count ?? 0 };
}

export interface SlaConfig {
  id: string;
  meta_primeira_resposta_min: number;
  meta_resolucao_min: number;
  meta_csat: number | null;
}

export async function fetchSlaConfigPadrao(): Promise<SlaConfig | null> {
  const { data, error } = await client()
    .from("sla_config")
    .select("id, meta_primeira_resposta_min, meta_resolucao_min, meta_csat")
    .is("canal", null)
    .is("prioridade", null)
    .is("motivo", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSlaConfigPadrao(id: string, meta: { meta_primeira_resposta_min: number; meta_resolucao_min: number; meta_csat: number }) {
  const { error } = await client().from("sla_config").update(meta).eq("id", id);
  if (error) throw error;
}

export async function fetchAnalyticsEvolucao(
  f: AnalyticsFilters & { granularidade: "day" | "week" | "month" }
): Promise<{ periodo: string; media_csat: number; total: number }[]> {
  const { data, error } = await client().rpc("analytics_evolucao", {
    data_inicio: f.inicio.toISOString(),
    data_fim: f.fim.toISOString(),
    granularidade: f.granularidade,
    p_equipe: f.equipe ?? null,
    p_canal: f.canal ?? null,
    p_categoria_cliente: f.categoriaCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as { periodo: string; media_csat: number; total: number }[];
}

// "Chamados" (não "avaliações") no mesmo recorte de período/canal do
// gráfico de evolução acima — pedido do usuário pra poder comparar volume
// de chamados com volume de avaliações lado a lado. Conta cada ciclo
// aberto→resolvido (1+reopened_count), igual ao resto da plataforma —
// diferente de `analytics_evolucao()`, que lê `csat_results` (só quem foi
// avaliado).
export async function fetchChamadosEvolucao(
  inicio: Date,
  fim: Date,
  granularidade: "day" | "week" | "month",
  canal?: string
): Promise<{ periodo: string; total_chamados: number }[]> {
  const { data, error } = await client().rpc("chamados_evolucao", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    granularidade,
    p_canal: canal ?? null,
  });
  if (error) throw error;
  return (data ?? []) as { periodo: string; total_chamados: number }[];
}

export interface DbAtendenteAlias {
  id: string;
  email_variante: string;
  email_canonico: string;
  nome_canonico: string;
  created_at: string;
}

export async function fetchAtendenteAliases(): Promise<DbAtendenteAlias[]> {
  const { data, error } = await client().from("atendente_aliases").select("*").order("nome_canonico");
  if (error) throw error;
  return data ?? [];
}

export async function fetchDistinctCanais(): Promise<string[]> {
  const { data, error } = await client().rpc("distinct_canais");
  if (error) throw error;
  return (data ?? []).map((r: { canal: string }) => r.canal);
}

export interface OperadorFilters {
  inicio: Date;
  fim: Date;
  canal?: string;
  estado?: string;
}

export interface OperadorRankingRow {
  atendente: string;
  email_atendente: string | null;
  user_id: string | null;
  total_chamados: number;
  tempo_1resposta_medio: number | null;
  tempo_encerramento_medio: number | null;
  csat_medio: number | null;
  total_avaliacoes: number;
  posicao: number;
}

export async function fetchOperadorRanking(f: OperadorFilters): Promise<OperadorRankingRow[]> {
  const { data, error } = await client().rpc("operador_ranking", {
    data_inicio: f.inicio.toISOString(),
    data_fim: f.fim.toISOString(),
    p_canal: f.canal ?? null,
    p_estado: f.estado ?? null,
  });
  if (error) throw error;
  return (data ?? []) as OperadorRankingRow[];
}

export interface DistribuicaoRow {
  chave: string;
  total: number;
}

export async function fetchDistribuicaoCanal(
  inicio: Date,
  fim: Date,
  estado?: string
): Promise<DistribuicaoRow[]> {
  const { data, error } = await client().rpc("distribuicao_canal", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_estado: estado ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DistribuicaoRow[];
}

export async function fetchDistribuicaoStatus(
  inicio: Date,
  fim: Date,
  canal?: string
): Promise<DistribuicaoRow[]> {
  const { data, error } = await client().rpc("distribuicao_status", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DistribuicaoRow[];
}

export async function fetchDistribuicaoTopico(
  inicio: Date,
  fim: Date,
  canal?: string,
  estado?: string
): Promise<DistribuicaoRow[]> {
  const { data, error } = await client().rpc("distribuicao_topico", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_estado: estado ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DistribuicaoRow[];
}

export async function fetchDistinctOperadores(): Promise<{ atendente: string; email_atendente: string }[]> {
  const { data, error } = await client()
    .from("csat_results")
    .select("atendente, email_atendente")
    .not("atendente", "is", null);
  if (error) throw error;
  // Agrupar por NOME, não por e-mail — dedupar pela chave (email ?? nome)
  // fazia um mesmo atendente com uma linha antiga sem email_atendente
  // preenchido cair numa chave diferente das linhas com email, duplicando
  // a entrada na lista (ex: "Ana Franca" aparecendo 2x). Sempre 1 linha
  // por nome; o e-mail escolhido é o primeiro não-nulo encontrado.
  const porNome = new Map<string, string | null>();
  (data ?? []).forEach((r) => {
    if (!r.atendente) return;
    const atual = porNome.get(r.atendente);
    if (!porNome.has(r.atendente) || (!atual && r.email_atendente)) {
      porNome.set(r.atendente, r.email_atendente);
    }
  });
  return Array.from(porNome.entries())
    .map(([atendente, email_atendente]) => ({ atendente, email_atendente: email_atendente ?? "" }))
    .sort((a, b) => a.atendente.localeCompare(b.atendente));
}

// ---------- Reclame Aqui ----------

export interface ReclameAquiFilters {
  status?: string;
  responsavelId?: string;
  inicio?: Date;
  fim?: Date;
}

export async function fetchReclameAquiCases(
  filters: ReclameAquiFilters = {}
): Promise<DbReclameAquiCase[]> {
  let query = client()
    .from("reclame_aqui_cases")
    .select("*, responsavel:users!reclame_aqui_cases_responsavel_id_fkey(*)");

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.responsavelId) query = query.eq("responsavel_id", filters.responsavelId);
  if (filters.inicio) query = query.gte("data_abertura", filters.inicio.toISOString());
  if (filters.fim) query = query.lte("data_abertura", filters.fim.toISOString());

  const { data, error } = await query.order("data_abertura", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbReclameAquiCase[];
}

export async function upsertReclameAquiCase(
  c: Partial<DbReclameAquiCase> & { id?: string }
) {
  const { data, error } = await client().from("reclame_aqui_cases").upsert(c).select().single();
  if (error) throw error;
  return data as DbReclameAquiCase;
}

export async function deleteReclameAquiCase(id: string) {
  const { error } = await client().from("reclame_aqui_cases").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchReclameAquiMetrics(): Promise<DbReclameAquiMetric[]> {
  const { data, error } = await client()
    .from("reclame_aqui_metrics")
    .select("*")
    .order("data");
  if (error) throw error;
  return (data ?? []) as DbReclameAquiMetric[];
}

// ---------- NPS ----------

export interface NpsFilters {
  classificacao?: "Promotor" | "Neutro" | "Detrator";
  fonte?: string;
  busca?: string;
  inicio?: Date;
  fim?: Date;
}

export async function fetchNpsResponses(filters: NpsFilters = {}): Promise<DbNpsResponse[]> {
  let query = client().from("nps_responses").select("*");

  if (filters.classificacao) query = query.eq("classificacao", filters.classificacao);
  if (filters.fonte) query = query.eq("fonte", filters.fonte);
  if (filters.busca) query = query.or(`comentario.ilike.%${filters.busca}%,respondente.ilike.%${filters.busca}%`);
  if (filters.inicio) query = query.gte("data_resposta", filters.inicio.toISOString());
  if (filters.fim) query = query.lte("data_resposta", filters.fim.toISOString());

  const { data, error } = await query.order("data_resposta", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbNpsResponse[];
}

export async function upsertNpsResponse(r: Partial<DbNpsResponse> & { id?: string }) {
  const { data, error } = await client().from("nps_responses").upsert(r).select().single();
  if (error) throw error;
  return data as DbNpsResponse;
}

export async function deleteNpsResponse(id: string) {
  const { error } = await client().from("nps_responses").delete().eq("id", id);
  if (error) throw error;
}

// ---------- crisp_conversations (fonte principal de atendimento) ----------

export interface DashboardAtendimentoSummary {
  total_conversas: number;
  // 1 + reaberturas por conversa — "chamado" é cada ciclo aberto→resolvido,
  // diferente de total_conversas (contagem crua de conversas, usada só pela Home).
  total_chamados: number;
  conversas_resolvidas: number;
  tfr_medio_min: number | null;
  tempo_resolucao_medio_min: number | null;
  csat_medio: number | null;
  percentual_satisfacao: number | null;
}

export async function fetchDashboardAtendimentoSummary(
  inicio: Date,
  fim: Date,
  canal?: string
): Promise<DashboardAtendimentoSummary | null> {
  const { data, error } = await client().rpc("dashboard_atendimento_summary", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as DashboardAtendimentoSummary | null;
}

export async function fetchConversasEvolucao(
  inicio: Date,
  fim: Date,
  granularidade: "day" | "week" | "month"
): Promise<{ periodo: string; total: number; resolvidas: number }[]> {
  const { data, error } = await client().rpc("conversas_evolucao", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    granularidade,
  });
  if (error) throw error;
  return (data ?? []) as { periodo: string; total: number; resolvidas: number }[];
}

export interface AtendentePerformanceRow {
  operator_nome: string;
  operator_email: string | null;
  total_atendimentos: number;
  tfr_medio: number | null;
  tempo_resolucao_medio: number | null;
  csat_medio: number | null;
  total_avaliacoes: number;
  total_interacoes: number;
  total_mensagens: number;
  posicao: number;
}

export async function fetchAtendentePerformance(
  inicio: Date,
  fim: Date,
  canal?: string,
  status?: string,
  modoTempo: ModoTempo = "uteis",
  tipoCliente?: string
): Promise<AtendentePerformanceRow[]> {
  const { data, error } = await client().rpc("atendente_performance", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    p_canal: canal ?? null,
    p_status: status ?? null,
    p_modo_tempo: modoTempo,
    p_tipo_cliente: tipoCliente ?? null,
  });
  if (error) throw error;
  return (data ?? []) as AtendentePerformanceRow[];
}

export async function fetchDistribuicaoCanalConversas(inicio: Date, fim: Date): Promise<DistribuicaoRow[]> {
  const { data, error } = await client().rpc("distribuicao_canal_conversas", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as DistribuicaoRow[];
}

export async function fetchDistribuicaoStatusConversas(inicio: Date, fim: Date): Promise<DistribuicaoRow[]> {
  const { data, error } = await client().rpc("distribuicao_status_conversas", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as DistribuicaoRow[];
}

export interface ConversaNotaBaixa {
  id: string;
  cliente_nome: string | null;
  operator_nome: string | null;
  canal: string | null;
  topico: string | null;
  nota: number;
  comentario: string | null;
  started_at: string;
  link_chamado: string | null;
}

export async function fetchConversasNotaBaixa(inicio: Date, fim: Date, limite = 2): Promise<ConversaNotaBaixa[]> {
  const { data, error } = await client().rpc("conversas_nota_baixa", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    limite_nota: limite,
  });
  if (error) throw error;
  return (data ?? []) as ConversaNotaBaixa[];
}

export interface ConversasFilters {
  busca?: string;
  atendenteEmail?: string;
  canal?: string;
  tipoCliente?: string;
  status?: string;
  inicio?: Date;
  fim?: Date;
  page?: number;
  pageSize?: number;
}

export async function fetchConversasFiltered(
  filters: ConversasFilters
): Promise<{ rows: DbCrispConversation[]; count: number }> {
  const { busca, atendenteEmail, canal, tipoCliente, status, inicio, fim, page = 0, pageSize = 15 } = filters;
  let query = client().from("crisp_conversations").select("*", { count: "exact" });

  if (busca) query = query.or(`cliente_nome.ilike.%${busca}%,cliente_email.ilike.%${busca}%`);
  if (atendenteEmail) query = query.eq("operator_email", atendenteEmail);
  if (canal) query = query.eq("canal", canal);
  if (tipoCliente) query = query.ilike("tipo_cliente", `%${tipoCliente}%`);
  if (status) query = query.eq("status", status);
  if (inicio) query = query.gte("started_at", inicio.toISOString());
  if (fim) query = query.lte("started_at", fim.toISOString());

  query = query.order("started_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as DbCrispConversation[], count: count ?? 0 };
}

export async function fetchDistinctAtendentesConversas(): Promise<{ nome: string }[]> {
  // Antes juntava variações de nome ("Ana"/"Vittor") por substring no cliente,
  // o que podia juntar pessoas DIFERENTES que compartilham apelido curto (ex:
  // "Ana" era Ana Paula em algumas conversas e Ana Franca em outras). Agora usa
  // operator_id_aliases (chave = ID do operador no Crisp, não o nome) via
  // distinct_atendentes_canonico() no banco — resolve por identidade, não texto.
  const { data, error } = await client().rpc("distinct_atendentes_canonico");
  if (error) throw error;
  return (data ?? []) as { nome: string }[];
}

// tipo_cliente no banco é uma lista de tags separadas por vírgula, não um
// valor único — por isso o filtro usa correspondência por tag (ILIKE), não
// igualdade exata. As opções vêm direto do banco (distinct_tipos_cliente()),
// não de uma lista fixa no frontend — uma lista hardcoded aqui já causou um
// bug real: a opção "Produtor" apontava pra tag "vendedor", que nunca bateu
// com o valor de verdade gravado ("Produtor"), zerando esse filtro sempre.
export async function fetchDistinctTiposCliente(): Promise<{ label: string; tag: string }[]> {
  const { data, error } = await client().rpc("distinct_tipos_cliente");
  if (error) throw error;
  return ((data ?? []) as { tag: string }[]).map((r) => ({ label: r.tag, tag: r.tag }));
}

// ---------- Helpdesks ----------

export const HELPDESK_LINK_PREFIX = "https://greenn.crisp.help/pt-br/";

export async function fetchHelpdesks(): Promise<DbHelpdesk[]> {
  const { data, error } = await client()
    .from("helpdesks")
    .select("*, solicitante:users!helpdesks_created_by_fkey(*), aprovador:users!helpdesks_approved_by_fkey(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbHelpdesk[];
}

export async function requestHelpdesk(payload: {
  nome: string;
  descricao: string;
  link?: string;
  created_by: string;
}) {
  const { data, error } = await client()
    .from("helpdesks")
    .insert({ ...payload, status: "solicitando" })
    .select()
    .single();
  if (error) throw error;
  return data as DbHelpdesk;
}

export async function updateHelpdeskStatus(
  id: string,
  status: DbHelpdesk["status"],
  approvedBy?: string,
  link?: string
) {
  const updates: Partial<DbHelpdesk> = { status };
  if (approvedBy) updates.approved_by = approvedBy;
  if (link) updates.link = link;
  const { data, error } = await client().from("helpdesks").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data as DbHelpdesk;
}

export async function deleteHelpdesk(id: string) {
  const { error } = await client().from("helpdesks").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Escala de sábado ----------

export interface EscalaSabadoItem {
  id: string;
  posicao: number;
  user_id: string;
  users?: { nome: string } | null;
}

export async function fetchMyHorario(userId: string) {
  const { data, error } = await client()
    .from("users")
    .select("horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMyHorario(
  userId: string,
  horario: {
    horario_entrada: string;
    horario_saida_almoco: string;
    horario_retorno_almoco: string;
    horario_saida: string;
  }
) {
  const { error } = await client().from("users").update(horario).eq("id", userId);
  if (error) throw error;
}

export async function fetchEscalaSabado(): Promise<EscalaSabadoItem[]> {
  const { data, error } = await client()
    .from("escala_sabado")
    .select("*, users(nome)")
    .order("posicao");
  if (error) throw error;
  return (data ?? []) as EscalaSabadoItem[];
}

export async function upsertEscalaSabadoItem(posicao: number, userId: string) {
  const { error } = await client()
    .from("escala_sabado")
    .upsert({ posicao, user_id: userId }, { onConflict: "posicao" });
  if (error) throw error;
}

export async function removeEscalaSabadoItem(id: string) {
  const { error } = await client().from("escala_sabado").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAtendenteEscaladoSabado(data: string): Promise<{ user_id: string; nome: string } | null> {
  const { data: rows, error } = await client().rpc("atendente_escalado_sabado", { p_data: data });
  if (error) throw error;
  return rows?.[0] ?? null;
}

// Data de referência do rodízio de sábado: define a partir de qual sábado a
// posição #1 da sequência começa a contar. Sem essa linha configurada, o
// cálculo do rodízio não tem base e nunca escala ninguém.
export async function fetchEscalaSabadoConfig(): Promise<string | null> {
  const { data, error } = await client().from("escala_sabado_config").select("data_referencia").maybeSingle();
  if (error) throw error;
  return data?.data_referencia ?? null;
}

export async function upsertEscalaSabadoConfig(dataReferencia: string) {
  const { error } = await client()
    .from("escala_sabado_config")
    .upsert({ id: true, data_referencia: dataReferencia }, { onConflict: "id" });
  if (error) throw error;
}

// ---------- Upload de imagem de ferramenta (Outros Links) ----------

export async function uploadToolImage(file: File): Promise<string> {
  const c = client();
  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await c.storage.from("tool-images").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = c.storage.from("tool-images").getPublicUrl(path);
  return data.publicUrl;
}

// ---------- Calendário ----------

export interface DbHoliday {
  id: string;
  data: string;
  nome: string;
}

export async function fetchHolidays(inicio: string, fim: string): Promise<DbHoliday[]> {
  const { data, error } = await client()
    .from("calendar_holidays")
    .select("*")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data");
  if (error) throw error;
  return (data ?? []) as DbHoliday[];
}

export async function fetchNextHoliday(fromDate: string): Promise<DbHoliday | null> {
  const { data, error } = await client()
    .from("calendar_holidays")
    .select("*")
    .gte("data", fromDate)
    .order("data")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}


export interface DbSaturdayOncall {
  id: string;
  data: string;
  user_id: string | null;
  horario_previsto: string | null;
  observacao: string | null;
  usuario?: { nome: string } | null;
}

export async function fetchSaturdayOncall(inicio: string, fim: string): Promise<DbSaturdayOncall[]> {
  const { data, error } = await client()
    .from("calendar_saturday_oncall")
    .select("*, usuario:users!calendar_saturday_oncall_user_id_fkey(nome)")
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw error;
  return (data ?? []) as DbSaturdayOncall[];
}

export async function upsertSaturdayOncall(payload: {
  data: string;
  user_id: string;
  horario_previsto?: string;
  observacao?: string;
  created_by: string;
}) {
  const { error } = await client()
    .from("calendar_saturday_oncall")
    .upsert(payload, { onConflict: "data" });
  if (error) throw error;
}

export async function deleteSaturdayOncall(id: string) {
  const { error } = await client().from("calendar_saturday_oncall").delete().eq("id", id);
  if (error) throw error;
}

export interface DbLeaveRequest {
  id: string;
  user_id: string;
  data: string;
  tipo: "folga" | "banco_horas" | "compensacao" | "outro";
  motivo: string | null;
  observacao: string | null;
  status: "pendente" | "aprovada" | "reprovada";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  usuario?: { nome: string } | null;
}

export async function fetchLeaveRequests(inicio: string, fim: string): Promise<DbLeaveRequest[]> {
  const { data, error } = await client()
    .from("calendar_leave_requests")
    .select("*, usuario:users!calendar_leave_requests_user_id_fkey(nome)")
    .gte("data", inicio)
    .lte("data", fim)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbLeaveRequest[];
}

export async function fetchPendingLeaveRequests(): Promise<DbLeaveRequest[]> {
  const { data, error } = await client()
    .from("calendar_leave_requests")
    .select("*, usuario:users!calendar_leave_requests_user_id_fkey(nome)")
    .eq("status", "pendente")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbLeaveRequest[];
}

export async function requestLeave(payload: {
  user_id: string;
  data: string;
  tipo: DbLeaveRequest["tipo"];
  motivo?: string;
  observacao?: string;
}) {
  const { error } = await client().from("calendar_leave_requests").insert(payload);
  if (error) throw error;
}

export async function decideLeaveRequest(id: string, status: "aprovada" | "reprovada", decidedBy: string) {
  const { error } = await client()
    .from("calendar_leave_requests")
    .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateLeaveRequest(id: string, payload: Partial<Pick<DbLeaveRequest, "tipo" | "motivo" | "observacao">>) {
  const { error } = await client().from("calendar_leave_requests").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteLeaveRequest(id: string) {
  const { error } = await client().from("calendar_leave_requests").delete().eq("id", id);
  if (error) throw error;
}

export interface DbOncall {
  id: string;
  data: string;
  user_id: string;
  horario_inicio: string;
  horario_fim: string;
  observacao: string | null;
  usuario?: { nome: string } | null;
}

export async function fetchOncall(inicio: string, fim: string): Promise<DbOncall[]> {
  const { data, error } = await client()
    .from("calendar_oncall")
    .select("*, usuario:users!calendar_oncall_user_id_fkey(nome)")
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw error;
  return (data ?? []) as DbOncall[];
}

export async function createOncall(payload: {
  data: string;
  user_id: string;
  horario_inicio: string;
  horario_fim: string;
  observacao?: string;
  created_by: string;
}) {
  const { error } = await client().from("calendar_oncall").insert(payload);
  if (error) throw error;
}

export async function updateOncall(id: string, payload: Partial<Pick<DbOncall, "user_id" | "horario_inicio" | "horario_fim" | "observacao">>) {
  const { error } = await client().from("calendar_oncall").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteOncall(id: string) {
  const { error } = await client().from("calendar_oncall").delete().eq("id", id);
  if (error) throw error;
}

export interface DbVacation {
  id: string;
  user_id: string;
  data_inicio: string;
  data_fim: string;
  observacao: string | null;
  usuario?: { nome: string } | null;
}

export async function fetchVacations(inicio: string, fim: string): Promise<DbVacation[]> {
  const { data, error } = await client()
    .from("calendar_vacations")
    .select("*, usuario:users!calendar_vacations_user_id_fkey(nome)")
    .lte("data_inicio", fim)
    .gte("data_fim", inicio);
  if (error) throw error;
  return (data ?? []) as DbVacation[];
}

export async function createVacation(payload: {
  user_id: string;
  data_inicio: string;
  data_fim: string;
  observacao?: string;
  created_by: string;
}) {
  const { error } = await client().from("calendar_vacations").insert(payload);
  if (error) throw error;
}

export async function updateVacation(id: string, payload: Partial<Pick<DbVacation, "user_id" | "data_inicio" | "data_fim" | "observacao">>) {
  const { error } = await client().from("calendar_vacations").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteVacation(id: string) {
  const { error } = await client().from("calendar_vacations").delete().eq("id", id);
  if (error) throw error;
}

export interface DbDayEntry {
  id: string;
  data: string;
  titulo: string;
  horas: number;
  observacao: string | null;
}

export async function fetchDayEntries(inicio: string, fim: string): Promise<DbDayEntry[]> {
  const { data, error } = await client()
    .from("calendar_day_entries")
    .select("*")
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw error;
  return (data ?? []) as DbDayEntry[];
}

export async function createDayEntry(payload: {
  data: string;
  titulo: string;
  horas: number;
  observacao?: string;
  created_by: string;
}) {
  const { error } = await client().from("calendar_day_entries").insert(payload);
  if (error) throw error;
}

export async function updateDayEntry(id: string, payload: Partial<Pick<DbDayEntry, "titulo" | "horas" | "observacao">>) {
  const { error } = await client().from("calendar_day_entries").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteDayEntry(id: string) {
  const { error } = await client().from("calendar_day_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function limparDia(data: string) {
  await Promise.all([
    client().from("calendar_saturday_oncall").delete().eq("data", data),
    client().from("calendar_oncall").delete().eq("data", data),
    client().from("calendar_day_entries").delete().eq("data", data),
    client().from("calendar_leave_requests").delete().eq("data", data),
  ]);
}

// ---------- Métricas de atendimento corrigidas (1ª resposta humana, sem bot) ----------

export interface AtendimentoComMetricas {
  id: string;
  crisp_id: string | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  operator_nome: string | null;
  operator_email: string | null;
  canal: string | null;
  tipo_cliente: string | null;
  status: string | null;
  current_started_at: string;
  primeira_resposta_humana_at: string | null;
  resolved_at: string | null;
  tempo_primeira_resposta_seg: number | null;
  tempo_resolucao_seg: number | null;
  // Só preenchido quando resolved_at é null (chamado ainda aberto) — tempo
  // decorrido até agora (mesmo cálculo que tempo_resolucao_seg usaria se
  // resolvesse neste instante). É um valor "ao vivo": muda a cada consulta,
  // nunca usar em agregado/média — tfr_ttr_percentis() nem lê esse campo,
  // continua exigindo resolved_at real.
  tempo_aberto_seg: number | null;
  tempo_primeira_resposta_geral_seg: number | null;
  invalido_resposta_antes_inicio: boolean;
  invalido_sem_resposta_humana: boolean;
  invalido_tempo_negativo: boolean;
  link_chamado: string | null;
  // Tempo que o atendente ATUAL (operator_nome) ficou de posse desse chamado
  // especificamente — soma os trechos dele em atendimento_timeline(). Não é
  // o mesmo que "tempo até 1ª resposta": alguém pode ficar horas com um
  // chamado sem nunca respondê-lo primeiro (handoff), ou responder rápido e
  // não ficar mais com ele depois.
  tempo_ativo_seg: number | null;
  // Quantas vezes esse chamado reabriu (0 = nunca) — mesmo campo de
  // crisp_conversations.reopened_count, só passthrough.
  reopened_count: number;
  // true só quando existe csat_results.crisp_id apontando pra esse chamado —
  // vínculo direto, sem aproximação por e-mail/horário. csat_results.crisp_id
  // só passou a ser preenchido pelo n8n a partir de 2026-08-26; avaliações
  // anteriores a isso (ou sem esse campo populado por algum motivo) aparecem
  // como false mesmo tendo nota real — é um falso-negativo conhecido, não
  // um bug: nunca dá falso-positivo.
  avaliado: boolean;
  // Nota (1-5) da avaliação vinculada via crisp_id, quando avaliado=true.
  // Mesma limitação do falso-negativo documentada acima em "avaliado".
  nota_avaliacao: number | null;
  total_count: number;
  // Soma de 1+reopened_count de todo o conjunto filtrado (não só a página
  // atual) — janela, igual total_count. "Conversas" (total_count) é 1 por
  // crisp_id; "Chamados" pondera reabertura — os dois podem divergir bastante
  // quando há muita reabertura no período/atendente filtrado.
  total_chamados: number;
}

export interface AtendimentoTimelineEntry {
  // "fila" = ainda sem roteamento pra um humano; "resolvido" = marcado
  // resolvido, aguardando reabertura (ou fim real) — nos dois casos
  // `atendente` vem null, ninguém está de posse nesse trecho.
  tipo: "atendente" | "fila" | "resolvido";
  atendente: string | null;
  atribuido_em: string;
  liberado_em: string;
  minutos_posse: number;
  ainda_ativo: boolean;
}

export async function fetchAtendimentoTimeline(crispId: string): Promise<AtendimentoTimelineEntry[]> {
  const { data, error } = await client().rpc("atendimento_timeline", { p_crisp_id: crispId });
  if (error) throw error;
  return (data ?? []) as AtendimentoTimelineEntry[];
}

export interface AtendimentosMetricasFilters {
  inicio: Date;
  fim: Date;
  canal?: string;
  tipoCliente?: string;
  /** Um ou mais atendentes — sem filtro (undefined/[]) mostra todo mundo. */
  atendenteNomes?: string[];
  busca?: string;
  page?: number;
  pageSize?: number;
  somenteRisco?: boolean;
  ordenarPor?: "recentes" | "tempo_aberto" | "tfr" | "tempo_resolucao";
  direcao?: "asc" | "desc";
  status?: string;
  modoTempo?: ModoTempo;
  motivo?: string;
}

export async function fetchAtendimentosComMetricas(
  f: AtendimentosMetricasFilters
): Promise<{ rows: AtendimentoComMetricas[]; count: number; totalChamados: number }> {
  const { page = 0, pageSize = 15 } = f;
  const { data, error } = await client().rpc("atendimentos_com_metricas", {
    data_inicio: f.inicio.toISOString(),
    data_fim: f.fim.toISOString(),
    p_canal: f.canal ?? null,
    p_tipo_cliente: f.tipoCliente ?? null,
    p_atendente_nomes: f.atendenteNomes && f.atendenteNomes.length > 0 ? f.atendenteNomes : null,
    p_busca: f.busca ?? null,
    p_limit: pageSize,
    p_offset: page * pageSize,
    p_somente_risco: f.somenteRisco ?? false,
    p_ordenar_por: f.ordenarPor ?? "recentes",
    p_status: f.status ?? null,
    p_direcao: f.direcao ?? null,
    p_modo_tempo: f.modoTempo ?? "uteis",
    p_motivo: f.motivo ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as AtendimentoComMetricas[];
  return { rows, count: rows[0]?.total_count ?? 0, totalChamados: rows[0]?.total_chamados ?? 0 };
}

// Busca todas as páginas (ignora f.page/f.pageSize) — usada só pra
// exportação em CSV, onde "com base nos filtros" precisa ser a lista
// inteira, não só a página visível na tabela. Pagina em blocos de 500 pra
// nunca esbarrar no limite de linhas por resposta do PostgREST (1000).
export async function fetchTodosAtendimentosComMetricas(
  f: Omit<AtendimentosMetricasFilters, "page" | "pageSize">
): Promise<AtendimentoComMetricas[]> {
  const BLOCO = 500;
  const todas: AtendimentoComMetricas[] = [];
  let page = 0;
  while (true) {
    const { rows, count } = await fetchAtendimentosComMetricas({ ...f, page, pageSize: BLOCO });
    todas.push(...rows);
    if (rows.length < BLOCO || todas.length >= count) break;
    page++;
  }
  return todas;
}

export interface MinhaConversaMetrica {
  crisp_id: string | null;
  current_started_at: string;
  primeira_resposta_humana_at: string | null;
  resolved_at: string | null;
  tempo_primeira_resposta_seg: number | null;
  tempo_resolucao_seg: number | null;
  status: string | null;
  // true quando a conversa está atualmente com o usuário (usar pra "Total de
  // chamados"/"Tempo de resolução"); tempo_primeira_resposta_seg é preenchido
  // sempre que o usuário respondeu primeiro, mesmo em linhas com minha_carteira
  // false (conversa repassada depois) — mesmo critério do ranking em Overview.
  minha_carteira: boolean;
  // 1 + isso = quantos "chamados" essa conversa representa (cada reabertura
  // conta como um ciclo novo) — usado no "Total de chamados" do Meu Painel.
  reopened_count: number;
}

export async function fetchMinhasConversasMetricas(inicio: Date, fim: Date): Promise<MinhaConversaMetrica[]> {
  const { data, error } = await client().rpc("minhas_conversas_metricas", {
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as MinhaConversaMetrica[];
}
