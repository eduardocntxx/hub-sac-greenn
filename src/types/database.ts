// Estes tipos espelham exatamente as tabelas existentes no projeto Supabase
// "Centralização - SAC" (schema public). Mantidos separados de src/types/index.ts
// (tipos de UI) para deixar explícito o que vem do banco vs. o que é forma de exibição.

export interface DbRole {
  id: string;
  nome: string;
  descricao: string | null;
  created_at: string;
}

export interface DbUser {
  id: string;
  auth_id: string | null;
  role_id: string | null;
  nome: string;
  email: string;
  cargo: string | null;
  equipe: string | null;
  avatar: string | null;
  ativo: boolean;
  horario_entrada: string | null;
  horario_saida_almoco: string | null;
  horario_retorno_almoco: string | null;
  horario_saida: string | null;
  created_at: string;
  updated_at: string;
  roles?: DbRole | null; // populado via join (select("*, roles(*)"))
}

export interface DbAnnouncement {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  fixado: boolean;
  ativo: boolean;
  data_publicacao: string;
  created_by: string | null;
  created_at: string;
}

export interface DbTool {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  icone: string | null;
  // Ícone customizado (upload); tem prioridade sobre `icone` (nome lucide-react)
  // quando preenchido — ver DynamicIcon nos pontos de renderização.
  icone_url: string | null;
  imagem_url: string | null;
  url: string | null;
  abrir_nova_guia: boolean;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

export interface DbCourse {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  thumbnail: string | null;
  link: string | null;
  publicado: boolean;
  ordem: number;
  created_at: string;
}

export interface DbDocumentation {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  link: string | null;
  publicado: boolean;
  ordem: number;
  created_at: string;
}

export interface DbMission {
  id: string;
  titulo: string;
  descricao: string | null;
  meta: number;
  unidade: string | null;
  prazo: string | null;
  ativo: boolean;
  categoria: string | null;
  dificuldade: "facil" | "media" | "dificil" | null;
  xp: number;
  moedas: number;
  responsavel_id: string | null;
  status: "rascunho" | "ativa" | "pausada" | "concluida" | "expirada";
  created_at: string;
  responsavel?: DbUser | null;
}

export interface DbMissionProgress {
  id: string;
  mission_id: string;
  user_id: string;
  atual: number;
  updated_at: string;
  missions?: DbMission;
}

export interface DbCsatResult {
  id: string;
  user_id: string | null;
  data_hora: string;
  atendente: string;
  email_atendente: string | null;
  cliente: string | null;
  telefone: string | null;
  email: string | null;
  numero_whatsapp: string | null;
  nota: number | null;
  comentario: string | null;
  canal: string | null;
  topico: string | null;
  categoria_cliente: "Consumidor" | "Produtor" | "Não identificado" | null;
  tags_cliente: string | null;
  estado: string | null;
  link_chamado: string | null;
  tempo_primeira_resposta_seg: number | null;
  tempo_encerramento_seg: number | null;
  tempo_primeira_resposta_minutos: number | null;
  primeira_mensagem_cliente: string | null;
  primeira_resposta_humana: string | null;
  primeira_resposta_origem: string | null;
  teve_interacao_humana: boolean | null;
  classificacao_csat: "Promotor" | "Neutro" | "Detrator" | null;
  crisp_id: string | null;
  conversation_id: string | null;
  resolved_operator_crisp_id: string | null;
  created_at: string;
  users?: DbUser | null;
}

export interface DbCourseProgress {
  id: string;
  user_id: string;
  course_id: string;
  progresso: number;
  concluido: boolean;
  concluded_at: string | null;
  updated_at: string;
  courses?: DbCourse;
}

export type CollaboratorStatus =
  | "online"
  | "almoco"
  | "offline"
  | "folga"
  | "ferias"
  | "plantao";

export interface DbUserStatus {
  id: string;
  user_id: string;
  status: CollaboratorStatus;
  horario_inicio: string | null;
  horario_fim: string | null;
  updated_at: string;
  users?: DbUser;
}

export interface DbReclameAquiCase {
  id: string;
  consumidor: string;
  assunto: string;
  status: "aberta" | "em_andamento" | "respondida" | "resolvida";
  responsavel_id: string | null;
  link_hugme: string | null;
  data_abertura: string;
  data_resposta: string | null;
  data_resolucao: string | null;
  nota: number | null;
  created_at: string;
  responsavel?: DbUser | null;
}

export interface DbReclameAquiMetric {
  id: string;
  data: string;
  nota_reputacao: number;
  total_reclamacoes: number;
  created_at: string;
}

export interface DbNpsResponse {
  id: string;
  respondente: string | null;
  email: string | null;
  nota: number;
  comentario: string | null;
  fonte: string | null;
  external_id: string | null;
  data_resposta: string;
  classificacao: "Promotor" | "Neutro" | "Detrator";
  notas_internas: string | null;
  created_at: string;
}

export interface DbCrispConversation {
  id: string;
  crisp_id: string | null;
  operator_id: string | null;
  operator_crisp_id: string | null;
  operator_nome: string | null;
  operator_email: string | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  canal: string | null;
  tipo_cliente: string | null;
  status: string | null;
  started_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  first_response_time: number | null;
  first_response_time_minutes: number | null;
  resolution_time: number | null;
  resolution_time_minutes: number | null;
  topico: string | null;
  link_chamado: string | null;
  created_at: string;
}

export interface DbHelpdesk {
  id: string;
  nome: string;
  descricao: string;
  link: string | null;
  status: "solicitando" | "pendente" | "finalizado";
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  solicitante?: DbUser | null;
  aprovador?: DbUser | null;
}

export interface DbModule {
  id: string;
  nome: string;
  rota: string | null;
  slug: string | null;
  categoria: string | null;
  ordem: number;
  mostrar_sidebar: boolean;
  mostrar_home: boolean;
}

export interface DbUserPermission {
  id: string;
  user_id: string;
  module_id: string;
  pode_gerenciar: boolean;
  granted_by: string | null;
  created_at: string;
  modules?: DbModule;
}

export interface DbRRHistory {
  id: string;
  user_id: string;
  periodo: string;
  csat: number | null;
  csat_variacao: number | null;
  atendimentos: number | null;
  atendimentos_variacao: number | null;
  tempo_medio: string | null;
  tempo_medio_variacao: number | null;
  meta_batida: boolean | null;
  aprendizados: string | null;
  dificuldades: string | null;
  plano_de_acao: string | null;
  objetivos: string | null;
  created_at: string;
}
