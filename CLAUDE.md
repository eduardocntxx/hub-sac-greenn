# CLAUDE.md — Hub SAC Greenn

> Documento de contexto para continuar o desenvolvimento deste projeto em
> qualquer conversa nova com o Claude. Mantenha-o atualizado sempre que uma
> funcionalidade importante for implementada ou alterada — veja a seção
> "Como manter este arquivo atualizado" no final.

## 1. Objetivo do sistema

O Hub SAC Greenn é a plataforma única do time de Suporte (SAC) da Greenn.
Centraliza em um só lugar: indicadores de desempenho individuais e do time
(CSAT, NPS, Reclame Aqui, Analytics de atendimento), gamificação (Missões),
comunicação interna (Atualizações/comunicados), gestão de escala e
calendário (plantões, folgas, férias, sobreaviso), solicitação de
ferramentas (Helpdesks), conteúdo (Cursos, Documentação, Outros Links) e
administração completa (usuários, perfis, permissões, módulos).

Público: colaboradores do time de SAC (perfil "Colaborador") e gestores
(perfil "Administrador"). Não é multi-tenant — é uma aplicação interna de
uso exclusivo da Greenn.

## 2. Arquitetura geral

- **SPA React** servida pelo Vite, sem SSR.
- **Backend as a Service**: todo o backend é Supabase (Postgres + Auth +
  Realtime + Storage). Não existe servidor Node/API própria — o frontend
  fala diretamente com o Supabase via `@supabase/supabase-js`, e toda a
  regra de negócio pesada (agregações, rankings, cálculos de tempo) vive em
  **funções SQL no Postgres** (`security definer`), não no frontend.
- **Segurança por RLS**: toda tabela tem Row Level Security. O frontend
  nunca é a única barreira — permissões granulares e regras de visibilidade
  são reforçadas no banco (`is_admin()`, `has_permission(slug)`,
  `current_app_user_id()`), então mesmo chamando a API do Supabase
  diretamente (bypassando a UI) as mesmas regras valem.
- **Camada única de acesso a dados**: `src/services/api.ts` (~1350 linhas,
  ~100 funções) é o único lugar que fala com `supabase.from(...)` ou
  `supabase.rpc(...)`. Páginas e hooks nunca chamam o client Supabase
  diretamente para dados de negócio (só os hooks `useRealtime*` acessam
  `supabase.channel(...)` para assinar mudanças).
- **Cache/estado assíncrono**: TanStack Query (`@tanstack/react-query`) para
  toda leitura; sem Redux/Zustand — estado de UI local fica em `useState`
  dentro do próprio componente/página.
- **Tempo real**: Supabase Realtime (`postgres_changes`) em vez de polling,
  via hooks dedicados que invalidam queries do TanStack Query quando uma
  tabela muda (ver seção 9).
- **Sem servidor de integração próprio**: dados de atendimento (Crisp) e
  qualquer integração externa chegam ao Postgres via **pipeline n8n
  externo**, que não faz parte deste repositório (ver seção 8).

Não há testes automatizados configurados no projeto até o momento.

## 3. Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| Build/dev server | Vite 5 |
| Linguagem | TypeScript 5 (strict mode) |
| UI | React 18 |
| Roteamento | React Router DOM v6 |
| Estilo | Tailwind CSS 3 (tema customizado, sem componentização externa tipo shadcn) |
| Ícones | lucide-react |
| Estado assíncrono/cache | TanStack Query v5 |
| Formulários | React Hook Form + `@hookform/resolvers` |
| Validação | Zod |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) |
| Utilitários de classe CSS | `clsx` + `tailwind-merge` (helper `cn`) |
| Exportação | `jspdf` (PDF), CSV nativo (`exportCsv.ts`) |
| Animação | `framer-motion` (disponível; uso pontual) |

Scripts (`package.json`): `npm run dev`, `npm run build` (`tsc -b && vite
build`), `npm run preview`, `npm run lint` (ESLint — mas não há arquivo de
config `.eslintrc` visível no repo raiz; conferir antes de assumir que
`lint` funciona sem setup adicional).

**Requisito de Node**: Vite 8 exige Node moderno (18+); Node 12 do sistema
(se for o caso do seu ambiente) faz o próprio `tsc` falhar ao carregar
(`SyntaxError` no operador `??`). Use `nvm install 20 && nvm use 20` antes
de rodar `npm install`/`npm run build` se encontrar esse erro.

**Conflito de peer dependency conhecido**: `package.json` tem `"vite":
"^8.2.1"` mas `"@vitejs/plugin-react": "^4.3.1"`, cujo peer range é `vite
^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0` — não cobre vite 8. `npm install`
puro falha com `ERESOLVE`; hoje só instala com `npm install
--legacy-peer-deps`. O build funciona assim na prática, mas vale decidir
conscientemente entre atualizar `@vitejs/plugin-react` para uma versão que
suporte vite 8, ou fixar vite em uma major anterior — não foi uma decisão
tomada, é um estado encontrado.

## 4. Estrutura das pastas

```
src/
  components/
    ui/                 → componentes de design system reutilizáveis
    layout/              → Sidebar, Header (chrome fixo do app)
    GlobalSearch.tsx      → busca global no Header
    CollaboratorsOnline.tsx → seção "Colaboradores Online" da Home
  contexts/               → AuthContext, NotificationsContext, ToastContext
  hooks/
    usePermissions.ts      → RBAC granular no front
    useRealtime*.ts        → assinaturas Supabase Realtime por domínio
  integrations/
    supabase/client.ts     → client Supabase + flag isSupabaseConfigured
  layouts/
    AppLayout.tsx           → sidebar + header + <Outlet /> + providers de layout
  lib/                      → utilitários puros (ver seção 12)
  pages/                    → uma página por rota/módulo da sidebar
  pages/admin/               → páginas do painel /admin (CRUD administrativo)
  routes/                    → guards de rota (RequireAuth, AdminOnlyRoute, RequirePermission)
  services/api.ts             → ÚNICA camada de acesso a dados (Supabase)
  types/
    index.ts                  → tipos de UI (parcialmente obsoletos — ver ROADMAP.md)
    database.ts                → tipos que espelham as tabelas reais do Postgres
  App.tsx                      → definição de rotas
  main.tsx                      → bootstrap React
  index.css                     → Tailwind + poucos overrides globais
```

O schema (tabelas, RLS, funções `security definer`) continua gerenciado
diretamente no projeto Supabase ("Hub SAC", project-ref
`riiwphsvqlatqtaqaemd` desde 2026-09-01 — projeto anterior "Centralização
- SAC"/`cqcjfirnwpvisicdiuaf` migrado nessa data, ver `docs/HISTORICO.md`), **sem**
migrations versionadas — risco documentado (seção 20). Desde 2026-09-08
existe `supabase/functions/` neste repositório (baixado via `supabase
functions download`, CLI autenticada com `supabase login` — ver `docs/HISTORICO.md`),
com o código-fonte real de `invite-user`/`self-signup`/`complete-oauth-
signup`, mantido em sincronia manualmente (editar aqui e rodar `supabase
functions deploy <nome> --project-ref riiwphsvqlatqtaqaemd` até esse fluxo
virar CI). `supabase/.temp/` (cache local da CLI, criado por `supabase
link`) está no `.gitignore` — nunca commitar.

## 5. Fluxo de autenticação

1. `src/integrations/supabase/client.ts` cria o client Supabase a partir de
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`.env`). Se as duas
   variáveis não estiverem definidas, `supabase` é `null` e
   `isSupabaseConfigured` é `false` — o app foi desenhado para também rodar
   sem Supabase configurado (fase mockData, hoje já não usada de fato).
2. `AuthProvider` (`src/contexts/AuthContext.tsx`) escuta
   `supabase.auth.onAuthStateChange` e, a cada sessão, busca o perfil
   correspondente em `public.users` via `fetchCurrentProfile(authId)`
   (join com `roles`).
3. **Vínculo crítico**: um usuário só "existe" no Hub se `public.users.auth_id`
   apontar para o `id` do Supabase Auth. Login autenticado sem esse vínculo
   resulta em erro explícito ("nenhum registro em public.users está
   vinculado a este auth_id") — isso já derrubou o app duas vezes em
   produção (Mateus na Fase 0, Eduardo Nicolau depois) e é o primeiro lugar
   a checar se um usuário novo "não consegue entrar".
4. `mapDbUserToAppUser` converte `DbUser` (schema do banco) em `AppUser`
   (tipo de UI) e decide `perfil` (`administrador`/`colaborador`) a partir
   de `roles.nome` (case-insensitive, só reconhece exatamente
   `"Administrador"`; qualquer outro valor vira `"colaborador"`).
5. `RequireAuth` (`src/routes/RequireAuth.tsx`) é o guard de topo: sem
   `user`, redireciona para `/login`; com `user` mas `!user.aprovado`,
   renderiza `AguardandoAprovacao` no lugar do `<Outlet />` (ver item 8).
6. `Login.tsx` chama `auth.login(email, senha)` →
   `supabase.auth.signInWithPassword`. Desde 2026-08-31 (ver `docs/HISTORICO.md`)
   também existe autocadastro público (aba "Criar conta", restrito a
   `@greenn.com.br`, validado no servidor pela Edge Function
   `self-signup`), "esqueci minha senha"
   (`resetPasswordForEmail` → reaproveita `/definir-senha`) e login via
   Google (`signInWithOAuth`, precisa do provider habilitado no painel
   do Supabase — configuração externa pendente do usuário). Contas
   continuam podendo ser criadas manualmente também (Supabase Auth +
   registro em `public.users` via Admin → Usuários, Edge Function
   `invite-user`) — as duas formas coexistem.
7. Logout: `auth.logout()` → `supabase.auth.signOut()`.
8. **Aprovação de acesso**: `public.users.aprovado` (novo, `default
   true`) — contas criadas por convite de admin já nascem aprovadas;
   autocadastro e primeiro login via Google nascem com `aprovado =
   false`, sem acesso a nada além da tela "Aguardando aprovação" até um
   admin aprovar em Administração → Usuários. Trigger
   `prevent_self_privilege_escalation` impede um usuário não-admin de
   mudar a própria coluna `aprovado`/`role_id`/`auth_id` via API direta.

## 6. Sistema de permissões (RBAC)

Dois níveis, compostos:

**Nível 1 — Perfil (role)**: `Administrador` tem acesso irrestrito a tudo
(front e banco, via `is_admin()` no Postgres). `Colaborador` é o padrão.
Perfis são administráveis em **Administração → Perfis**
(`AdminPerfis.tsx` + `upsertRole`/`fetchRoles`), mas o front só trata dois
valores especiais: qualquer `roles.nome !== "Administrador"` cai em
`"colaborador"` — criar um terceiro perfil hoje não muda comportamento a
menos que o código de `mapDbUserToAppUser` seja estendido.

**Nível 2 — Permissão granular por módulo**: tabela
`public.user_permissions` (`user_id` + `module_id` + `pode_gerenciar`),
decidida no banco por `has_permission(slug)` dentro do próprio RLS. Um
colaborador sem a permissão de um módulo não consegue escrever nessa
tabela mesmo manipulando a API do Supabase diretamente — a UI é só
conveniência, não a barreira real.

- `src/hooks/usePermissions.ts` expõe `hasPermission(slug)`: sempre `true`
  para admin; para os demais, busca `fetchMyPermissions(userId)` (lista de
  slugs) via TanStack Query.
- `src/routes/RequirePermission.tsx` é o guard de rota
  (`<Route element={<RequirePermission slug="csat" />}>`), usado hoje em
  `/csat`, `/reclame-aqui`, `/nps`.
- `src/routes/ProtectedRoute.tsx` exporta `AdminOnlyRoute`, usado em
  todo `/admin/*` — **estrito**, sem bypass por permissão granular.
  O Overview (`/performance`) é aberto a todo colaborador ativo e aprovado
  desde 2026-09-24, mas só a aba Dashboard; abas e listas de
  conversa/cliente seguem admin-only (no banco: `pode_ver_overview()` para
  agregados, `is_admin()` para listas).
- **Administração → Permissões** (`AdminPermissoes.tsx`) é a matriz
  colaborador × módulo para conceder/revogar com um clique
  (`grantPermission`/`revokePermission`).
- Slugs de módulo conhecidos hoje: `missoes`, `csat`, `reclame_aqui`, `nps`,
  `cursos`, `documentacao`, `atualizacoes`, `links`, `helpdesks` (slugs
  reservados desde a Fase 1 mesmo antes do módulo existir — ver
  `public.modules`).

**Padrão para adicionar uma nova permissão**: ver seção 15.

## 7. Estrutura do banco de dados e principais tabelas

Os tipos em `src/types/database.ts` são a referência mais confiável do
schema real (mantidos manualmente em sincronia com o Postgres — não há
geração automática de tipos configurada). Tabelas principais, por domínio:

**Identidade e RBAC**
- `roles` (`DbRole`) — perfis (Administrador, Colaborador, ...).
- `users` (`DbUser`) — perfil de cada colaborador; `auth_id` vincula ao
  Supabase Auth; carrega jornada de trabalho (`horario_entrada`,
  `horario_saida_almoco`, `horario_retorno_almoco`, `horario_saida`).
  `aprovado` (novo, 2026-08-31, `default true`) — `false` só pra contas
  vindas de autocadastro/Google ainda não revisadas por um admin; ver
  seção 5, item 8.
- `user_permissions` (`DbUserPermission`) — permissão granular por módulo.
- `modules` (`DbModule`) — catálogo de módulos (nome, rota, slug,
  categoria, se aparece na sidebar/Home).

**Atendimento / dados do Crisp (via n8n)**
- `csat_results` (`DbCsatResult`) — **fonte de verdade de satisfação**.
  Vínculo confiável com o colaborador é `email_atendente`, **nunca**
  `user_id` (está sempre `NULL` nos dados reais — ver seção 20). Contém
  `cliente`, `telefone`, `email`, `numero_whatsapp`, `categoria_cliente`
  (`Consumidor`/`Produtor`/`Não identificado`), `classificacao_csat`
  (texto cru do n8n, vocabulário inconsistente — nunca usar; classificar
  pela `nota`, ver seção 10), `link_chamado`,
  `tags_cliente`, `estado`. Campos `tempo_primeira_resposta_seg` /
  `tempo_encerramento_seg` existem mas **nunca são preenchidos pelo n8n**
  — não usar como fonte de tempo (usar `crisp_conversations`).
- `crisp_conversations` (`DbCrispConversation`) — **fonte de verdade de
  tempo/atendimento**. Vínculo confiável é `operator_email`. Tem
  `first_response_time_minutes`, `resolution_time_minutes`, `status`,
  `tipo_cliente` (⚠️ é uma **lista separada por vírgula**, tratar com
  `ILIKE %tag%`, nunca igualdade exata), `link_chamado`.
- `crisp_messages` — mensagem a mensagem (`origin`, `operator_crisp_id`);
  base real para calcular a primeira resposta **humana** (excluindo bot).
- `atendente_aliases` — normaliza atendentes que são o mesmo (ex: "IA
  Greenn" e "Mateus Lansa") para estatísticas/ranking, chaveado por
  **e-mail** (usado no dashboard de CSAT).
- `operator_id_aliases` — mesma ideia, mas chaveado pelo `operator_crisp_id`
  (ID interno do operador no Crisp, não texto) — usado por
  `atendimentos_com_metricas`/`atendente_performance`/`distinct_atendentes_
  canonico()` pra reconciliar `crisp_conversations.operator_nome`. Existe
  porque nome sozinho não é confiável pra identidade: "Ana" no Crisp é
  **duas pessoas diferentes** (Ana Paula Maximiano de Souza e Ana Franca,
  `operator_crisp_id` distintos) — ver `docs/HISTORICO.md`, fix de 2026-08-17.
- `crisp_ratings`, `nps_followups`, view `analytics_sac` — **schema
  paralelo, reservado, com 0 linhas** (ver decisão arquitetural na seção
  14). Não usar como fonte de dado hoje.

**Missões / gamificação**
- `missions` (`DbMission`) — categoria, dificuldade, meta/unidade,
  responsável opcional, status de workflow (`rascunho`/`ativa`/
  `pausada`/`concluida`/`expirada`). Campo `xp`/`moedas` existem no schema
  mas **XP foi removido da UI** (ver ROADMAP.md).
- `mission_progress` (`DbMissionProgress`) — progresso por usuário; trigger
  `ensure_mission_progress` garante a linha ao definir responsável.

**Conteúdo administrável**
- `announcements` (`DbAnnouncement`) — comunicados/Atualizações (categoria,
  prioridade, fixado). Missões e Helpdesks geram announcements
  automaticamente via trigger.
- `tools` (`DbTool`) — "Outros Links" (ícone dinâmico via lucide-react,
  imagem opcional via bucket Storage `tool-images`).
- `courses` (`DbCourse`) / `course_progress` (`DbCourseProgress`).
- `documentation` (`DbDocumentation`).

**Módulos de indicadores próprios**
- `reclame_aqui_cases` (`DbReclameAquiCase`) / `reclame_aqui_metrics`
  (`DbReclameAquiMetric`) — dados de exemplo hoje, sem integração real.
- `nps_responses` (`DbNpsResponse`) — idem; ver `nps_followups` acima
  (decisão pendente sobre qual é a fonte definitiva).
- `helpdesks` (`DbHelpdesk`) — fluxo `fila → pendente → em_progresso →
  criado`/`rejeitado`, imposto no banco; link validado por check
  constraint (`https://greenn.crisp.help/pt-br/...`).
- `rr_history` (`DbRRHistory`) — Reunião de Resultados, campos qualitativos
  preenchidos manualmente.
- `user_status` (`DbUserStatus`) — Colaboradores Online (status +
  horário), um registro por usuário.

**Calendário** (6 tabelas dedicadas): `calendar_holidays`,
`calendar_week_responsibles`, `calendar_saturday_oncall`,
`calendar_leave_requests`, `calendar_oncall`, `calendar_vacations`,
`calendar_day_entries`.

**Rodízio de sábado** (Administração → Escalas, `AdminEscalas.tsx`):
- `escala_sabado` — sequência ordenada (`posicao`) de quem entra no
  rodízio de plantão de sábado.
- `escala_sabado_config` — tabela singleton (1 linha fixa, `id boolean`
  sempre `true`) com `data_referencia`: o sábado a partir do qual a
  `posicao` #1 começa a contar. A função SQL `atendente_escalado_sabado(p_data)`
  calcula `((p_data - data_referencia) / 7) mod count(escala_sabado)` para
  achar quem está escalado numa data. **Sem uma linha em
  `escala_sabado_config` essa função sempre retorna vazio** — ficou sem
  nenhuma linha desde a criação da tabela até 2026-08-14 (ver `docs/HISTORICO.md`),
  o que fazia o rodízio parecer "quebrado" mesmo com gente cadastrada em
  `escala_sabado`. Editável agora em Administração → Escalas.

**Aliases de atendente**: `atendente_aliases` (usado só via
`fetchAtendenteAliases()` no dashboard de CSAT, pra juntar e-mails
variantes do mesmo atendente). Teve uma tela própria de CRUD
(Administração → Aliases de Atendente) criada em 2026-08-14, **removida
em 2026-08-18** por decisão de produto (ver `docs/HISTORICO.md`) — edição hoje é só
via SQL direto no Supabase.

## 8. Relação entre as tabelas

- `users.role_id → roles.id` (perfil).
- `users.auth_id → auth.users.id` (Supabase Auth, fora do schema `public`).
- `user_permissions.user_id → users.id`, `user_permissions.module_id →
  modules.id`.
- `missions.responsavel_id → users.id` (opcional); `mission_progress.mission_id
  → missions.id`, `mission_progress.user_id → users.id`.
- `course_progress.user_id → users.id`, `course_progress.course_id →
  courses.id`.
- `csat_results.user_id → users.id`, mas **sempre NULL na prática** — o
  join real que funciona é por e-mail: `csat_results.email_atendente =
  users.email`. Mesma lógica para `crisp_conversations.operator_email`.
- `csat_results.crisp_id` e `csat_results.conversation_id` deveriam
  correlacionar com uma conversa do Crisp — por muito tempo os dois
  ficaram **100% nulos** no pipeline, e `conversas_nota_baixa()` foi
  **corrigida em 2026-08-16** pra não depender mais desse vínculo:
  `csat_results` já carrega `cliente`/`atendente`/`canal`/`topico`/
  `comentario`/`link_chamado` próprios, então a função passou a ler
  direto da tabela em vez de fazer `join` com `crisp_conversations` por
  `crisp_id` (que na época nunca casava nenhuma linha). **Atualização
  2026-09-01**: `conversation_id` continua 100% nulo, mas `crisp_id`
  passou a vir preenchido pelo n8n em parte do dado — 103 de 255
  avaliações no projeto novo (40%, tudo a partir de 2026-08-26), sempre
  batendo 1:1 com uma `crisp_conversations.crisp_id` real (validado
  103/103). Não documentado quando exatamente o n8n passou a gravar isso.
  Usado pela primeira vez no badge "Avaliado"/"Não avaliado" do popup de
  detalhe do chamado (`docs/HISTORICO.md`) — mas só cobre dado recente, então
  qualquer nova função que dependa desse vínculo tem que aceitar
  falso-negativo pra avaliação anterior a 26/08 (nunca falso-positivo). O
  vínculo primário por e-mail (linha acima) continua sendo a base de tudo
  que já existia antes dessa mudança (agregados por atendente,
  dashboards) — não foi revisitado nesta correção.
- `reclame_aqui_cases.responsavel_id → users.id`.
- `helpdesks.created_by → users.id`, `helpdesks.approved_by → users.id`.
- `user_status.user_id → users.id` (1:1).
- `rr_history.user_id → users.id`.

Não há uma tabela de "chamados" separada — `csat_results` representa
interações já avaliadas; `crisp_conversations` é a lista mais ampla de
conversas (avaliadas ou não).

## 9. Como funciona a integração com o Supabase

- **Client único**: `src/integrations/supabase/client.ts`. Nunca instanciar
  outro client em outro lugar do código.
- **Toda leitura/escrita de negócio passa por `src/services/api.ts`** —
  funções nomeadas `fetchX`/`upsertX`/`deleteX`/`createX` que encapsulam
  `.from("tabela").select(...)` ou `.rpc("funcao_sql", params)`. Cálculos
  pesados (médias, agregações, rankings) são feitos por funções SQL
  `security definer` no Postgres, chamadas via `.rpc(...)` — nunca
  recalculados no cliente.
- **RLS é a barreira real de segurança**, não o frontend. Qualquer nova
  função em `api.ts` deve assumir que a política de RLS da tabela já
  decide quem lê/escreve o quê; o frontend só evita mostrar UI que o
  usuário não conseguiria usar de qualquer forma.
- **Realtime**: cada domínio que precisa atualizar sozinho tem um hook
  dedicado em `src/hooks/useRealtime*.ts`. Padrão:
  ```ts
  const channel = supabase
    .channel("nome-do-canal")
    .on("postgres_changes", { event: "*", schema: "public", table: "..." },
        () => queryClient.invalidateQueries({ queryKey: [...] }))
    .subscribe();
  // cleanup: supabase.removeChannel(channel)
  ```
  Hooks existentes: `useRealtimeUserStatus`, `useRealtimeCsat`,
  `useRealtimeConversas`, `useRealtimeHelpdesks`, `useRealtimeCalendario`,
  `useRealtimeAnnouncementsNotifier` (este último toca som via
  `notificationSound.ts` e atualiza o contador do sino no Header). A
  tabela precisa estar na publicação `supabase_realtime` no Postgres para
  o canal funcionar — isso é configurado no banco, não no frontend.
- **Storage**: bucket `tool-images` (leitura pública, escrita só admin),
  usado por `uploadToolImage()` para imagens de "Outros Links".
- **Nenhuma migration está neste repositório** — mudanças de schema são
  aplicadas diretamente no projeto Supabase. Ver risco na seção 20.

## 10. Como funciona a integração com o Crisp

> O histórico completo de bugs, fixes, auditorias e decisões (agosto em
> diante, com datas, números de validação e rollbacks) está em
> **`docs/HISTORICO.md`**. Aqui fica só o que vale hoje. Consulte o
> histórico antes de mexer numa função SQL que já tem entrada lá.

### Pipeline (tudo externo a este repo)

- **Não há chamada à API do Crisp no código.** Um n8n externo
  (`n8n.sac.greenn.com.br`) grava no Postgres; o frontend só lê.
- Workflow **"Crisp → Hub"**: recebe o Plugin Hook do Crisp (plugin
  "Conversation N8N", instalado no workspace; o Website Hook antigo foi
  excluído) com `message:send`, `message:received`, `session:set_state` e
  `session:set_routing`. Grava `crisp_conversations`, `crisp_messages`,
  `operator_routing_history` (a cada atribuição) e
  `crisp_conversation_state_history` (a cada mudança de estado).
- Workflow **"Widget CSAT | Edu DEF"**: envia a pesquisa ao resolver e grava
  `csat_results`/`csat_pending`. Ele resolve a conversa várias vezes durante
  a pesquisa, o que gera "reaberturas" falsas (ver definições abaixo).
- Cron **"Request de users no Crisp"** (7h): lista operadores do Crisp e
  chama `upsert_operator_alias()` (só preenche campo vazio, nunca
  sobrescreve alias corrigido à mão).
- Webhook `crisp-removidos` → `registrar_remocao_crisp()`: remoção de
  conversa/mensagem no Crisp, com log em `crisp_remocoes_log`.
- n8n usa só `service_role`. Ao corrigir um workflow a partir do JSON
  exportado, conferir também o node HTTP que monta o corpo: um campo novo
  num node `Code` não chega ao banco se o HTTP Request não o referencia.

### Identidade de atendente

- **Conversas**: identidade por `operator_crisp_id`, nome via
  `nome_canonico_por_operator_id(id, nome)` + `operator_id_aliases`
  (colunas `nome_canonico`, `email`, `equipe_sac`). Nome solto não é
  identidade ("Ana" são duas pessoas). `crisp_conversations.operator_email`
  é **sempre NULL**, não usar.
- **CSAT**: identidade por e-mail (`csat_results.email_atendente`,
  `atendente_aliases`, `normalizar_email_atendente`). São dois sistemas de
  reconciliação paralelos; alias num não reflete no outro.
- **Bot**: detectar por `operator_nome ilike 'Atendente IA%'` **ou**
  `origin ilike '%crisp.im:bot%'` **ou** `origin ilike '%allan.godoy%'`.
  Nunca `ilike '%IA%'` (casa "Nathalia", "Maximiano").
- Contas especiais: `ia_greenn` (marcador sintético do n8n para mensagem
  automática); `b8b993a0-dd61-487a-b89b-7503756d8eb2` (conta real "IA
  Greenn" do bot, recebe roteamento); `ecdf38cc-f17d-4994-9129-8f8d8bf57570`
  ("Mr. Greenn", conta de distribuição, excluída de transferências e posse).
- `operator_id_aliases.equipe_sac = false` marca operador de fora do SAC
  (Comercial Greenn, Ana Clara Zanchett, Paula Pimentel, Jaine Martins,
  Matheus Vaz). **Toda função de métrica** filtra
  `not cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not
  operador_fora_sac(cc.operator_crisp_id)` (CSAT:
  `csat_atendente_fora_sac(email)`). Resumo e lista de casos precisam do
  mesmo filtro, senão o card e o drill-down divergem.

### Definições das métricas

- **Conversa** = 1 por `crisp_id`, no período do `started_at` (nunca muda).
  **Chamado** = abertura (`started_at`) + cada reabertura real, cada um no
  período em que foi aberto. Fonte única: `chamados_periodo_base(inicio,
  fim)` (2026-10-01), usada por `contagem_periodo`,
  `_dashboard_atendimento_summary_base`, `velocidade_por_tipo_cliente` e
  `atendente_performance` (chamados no dono atual). As outras funções com
  `sum(1 + reopened_count…)` (evolução diária, `operador_ranking`,
  `volume_dia_hora`, `metricas_por_tipo_cliente`, `motivo_contato_resumo`,
  `transferencias_resumo`, `atendimentos_com_metricas`) ainda contam pelo
  `current_started_at` — migrar quando forem tocadas. Antes de 08/09 (sem
  mensagens) reabertura = intervalo > 10 min desde a resolução (estimativa).
- **Reabertura real**: transição resolved → pending/unresolved seguida de
  mensagem do **cliente** que não seja resposta à pesquisa de CSAT, datada
  pelo evento. `reabertura_resumo` (desde 2026-10-01) usa
  `chamados_periodo_base`: eventos = chamados − conversas da
  `contagem_periodo`; taxa = conversas com reabertura no período ÷
  conversas resolvidas no período (evento `resolved` em state_history **ou**
  `first_resolved_at`/`resolved_at` — ~1 mil/mês não têm evento).
  `reabertura_casos` e `reabertura_por_tipo_cliente` usam a mesma base (soma
  dos casos = eventos do card). `reopened_count_real_periodo` (regra antiga)
  segue só nas funções de tempo/ranking ainda não migradas.
  Eventos de reabertura/transferência são contados por conversa, nunca
  ponderados.
- **Backlog** = conversas abertas agora (sem filtro de período; conversa
  aberta = 1 chamado). `backlog_por_idade` tem `com_humano`.
- **FCR/Recontato**: por conversa (mesmo `people_id` + `topico` idêntico em
  7 dias, `crisp_id` diferente). Bot resolvendo conta.
- **TFR**: `_primeiras_respostas_humanas()` é a fonte de todo TFR. Prioriza
  `crisp_conversations.first_human_response_at` (se `>= current_started_at`
  e não bot), cai para `crisp_messages`. Exclui a macro de encerramento
  "não recebemos novas mensagens neste chamado". TFR = quem de fato
  respondeu primeiro, independente de quem está com a conversa agora.
- **TTR** usa `resolved_at` (resolução mais recente); `first_resolved_at` é a
  1ª resolução (card à parte). Conversa aberta mostra `tempo_aberto_seg`
  (coluna separada, nunca misturada ao TTR).
- **Horas úteis vs. corridas**: `minutos_entre(inicio, fim, p_modo)`;
  "úteis" = união das jornadas de todos os usuários ativos em
  `public.users` (cache `cobertura_semanal`, trigger em `users`) + sábado
  08h–12h. Pessoa sem jornada cadastrada não conta na cobertura. Posse e
  espera do cliente são sempre tempo corrido.
- **Posse** (`relogio_posse_periodo`, wrapper de
  `_relogio_posse_periodo_base`) e `atendimento_timeline(crisp_id)`: Tier A
  (roteamento + estado), B (só roteamento), C (só mensagens, só
  resolvidas). Usam `piso_ciclo` (ignora evento de ciclo anterior do mesmo
  `crisp_id` só se houver `resolved` antes) e gap-and-island. A timeline
  devolve trechos `tipo` = `atendente`/`fila`/`resolvido`.
- **Espera do cliente**: da mensagem do cliente até a 1ª mensagem humana
  seguinte, pulando mensagens do bot.
- **Transferências**: só handoff humano ↔ humano; ignorar
  `previous_operator_crisp_id = ''` (1ª atribuição) e as contas de bot.
- **CSAT**: classificar sempre pela `nota` (4–5 boa/Promotor, 1–3
  ruim/Detrator, não existe neutro) via `classificacaoPorNota()`. Nunca
  confiar em `classificacao_csat` (texto cru, vocabulário inconsistente).
  `csat_results.crisp_id` existe para dado a partir de 2026-08-26 (~40%);
  `conversation_id` é sempre NULL. Campos vazios chegam como `''`: usar
  `||`, não `??`. `tempo_primeira_resposta_seg`/`tempo_encerramento_seg`
  nunca são preenchidos; usar `csat_tempo_real(crisp_id)`.
- **Canal**: WhatsApp em `crisp_conversations.canal` é o URN
  `urn:crisp.im:whatsapp:0`; sempre `canal_normalizado(canal)`.
- **Tipo de cliente**: lista separada por vírgula; filtrar com
  `chamado_tem_tipo_cliente(coluna, filtro)` (bucket sintético "Sem tipo").
  CSAT não é filtrável por tipo (vocabulário diferente em
  `categoria_cliente`).
- `crisp_conversations.status` só tem `pending`/`resolved`.
  `current_started_at` = início do chamado atual; desde 2026-10-01 só avança
  quando o **cliente** escreve depois de uma resolução (gatilho
  `trg_redatar_ciclo_na_msg_cliente` em `crisp_messages`; o n8n não grava
  mais esse campo em reabertura). É a âncora dos tempos (TFR/TTR) e dos
  filtros de período das métricas por chamado; contagem de conversas e
  chamados usa `chamados_periodo_base`.
- Agrupar por dia sempre em `America/Sao_Paulo`.

### Regras de trabalho no banco

- Mudou tipo/nome de parâmetro ou colunas de retorno: `DROP FUNCTION` da
  assinatura antiga antes do `CREATE`, e conferir que sobrou 1 overload.
- Função com filtro opcional opaco (ex. `p_tipo_cliente`) em query pesada:
  `plpgsql` com `if p_x is null then <query sem o filtro> else ... end if`
  (o planner erra a estimativa e estoura timeout). Em `plpgsql` com
  `RETURNS TABLE`, qualificar colunas (ambiguidade com variáveis).
- Não chamar `minutos_entre()` por linha em agregação grande: usar o join
  direto com `cobertura_semanal` (ver `atendente_performance`).
- RPC que pode passar de 1000 linhas: `p_limit`/`p_offset` +
  `count(*) over() as total_count` + desempate único no `order by`; o
  `api.ts` pagina em blocos de 500.
- Testar como usuário real: conexão de serviço/MCP ignora RLS e
  `is_admin()` dá falso. Usar a sessão do navegador ou JWT simulado
  (`set_config('request.jwt.claims', ...)` numa transação com rollback).
- Benchmark: 3+ execuções, usar o mínimo (compute Micro oscila muito).
- RPC nova: conferir `has_function_privilege('anon', oid, 'execute')`
  (funções criadas por `supabase_admin` nascem executáveis por anon).
- Função `security definer` que devolve dado de conversa/cliente: replicar
  a checagem de acesso dentro dela. Agregados do Overview usam
  `pode_ver_overview()`; listas de conversa/cliente usam `is_admin()`.
- Ao migrar de projeto Supabase: conferir também a publicação
  `supabase_realtime` (`pg_publication_tables`) e `pg_roles.rolconfig`
  (`authenticated` tem `statement_timeout = 25s`).
- Script manual de escrita: `set local app.origem = '<motivo>'` (fica em
  `auditoria_log`).

### Pendências conhecidas (detalhes em `docs/HISTORICO.md`)

- 01/10/2026 09:14–09:46: n8n fora do ar (fluxo duplicado "Crisp → Hub
  debug" com webhooks em caminho aleatório); mensagens, estados e
  roteamentos desse intervalo não foram gravados e não são recuperáveis.
- `crisp_messages` de 01–07/09 foi apagada à mão: métricas que dependem de
  mensagens (espera, bot, posse Tier C, IA genérica, total de mensagens)
  ficam sub-amostradas nesse período.
- n8n: o webhook `crisp-removidos` não grava em `crisp_remocoes_log`
  (PATCH/DELETE direto, sem `registrar_remocao_crisp()`). A reconciliação
  de backlog (`Reconciliar_Backlog_Crisp_Hub.json`) não aparece no MCP e
  não se sabe se está agendada.
- A volta do Mr. Greenn pra IA depois de 24h parada é regra da Crisp. O
  Mr. Greenn é uma fila que não distribui sozinha: mediana de 26,6h
  esperando, e no e-mail só 32% chegam a um humano (2026-09-30).
- "Atendido e não resolvido" usa como dono quem mandou a última mensagem,
  não o último roteamento (não alterado).
- `escala_sabado` não filtra usuário inativo; FCR com 0 recontato na semana
  17–23/09 é suspeito.
- Auth: signup direto não valida domínio, `aprovado` não está no RLS, sem
  SMTP próprio (limite de 2 e-mails/h). Desde 2026-09-30, `site_url` =
  `https://hub-sac-greenn.vercel.app` e a senha mínima do servidor é 8.
- Upgrade de compute (Micro) adiado por decisão do usuário.
- Código morto tolerado: `horario_por_nome`, `duracao_dentro_expediente`,
  `csat_tempo_resposta_correlacao`, `fetchConversasFiltered`,
  `p_somente_risco`.

## 11. Componentes de UI reutilizáveis

Todos em `src/components/ui/`:

- **`Button`** — variantes `primary`/`secondary`/`ghost`/`danger`, tamanhos
  `sm`/`md`. `forwardRef`, aceita todas as props nativas de `<button>`.
- **`Card` / `CardHeader` / `CardTitle` / `CardDescription` /
  `CardContent`** — bloco base de praticamente toda a UI (`rounded-2xl
  border border-sand-line bg-sand-surface`).
- **`Badge`** — tons `neutral`/`success`/`warning`/`danger`/`info`/
  `ausencia`/`brand`, usado para status/categorias em toda a aplicação
  (componente mais reutilizado do projeto, 28+ usos).
- **`Kpi`** — card de indicador com label, valor, delta vs. período
  anterior (seta + cor automática) e ícone opcional;
  `invertDeltaColor` para métricas onde "menor é melhor" (ex: tempo médio).
- **`EmptyState`** — estado vazio padrão (ícone + título + descrição +
  ação opcional), usado em toda listagem sem resultado.
- **`Skeleton` / `CardSkeleton`** — loading state padrão (`animate-pulse`).
- **`Avatar`** — iniciais + cor determinística por hash do nome (paleta
  fixa de 5 cores), tamanhos `sm`/`md`/`lg`, aceita `statusDot`.
- **`DateRangePopover`** — único componente de filtro de período da
  plataforma (presets de `dateRanges.ts` + intervalo personalizado); usar
  este em vez de reinventar um seletor de data em página nova.
- **`SegmentedControl<T>`** — grupo compacto de opções (ex: granularidade
  diária/semanal/mensal, abas internas de página). Em uso em Analytics,
  CSAT, Atualizações e Reclame Aqui.
- **`Dialog`** — wrapper padrão para modais (`onClose` + conteúdo livre),
  substitui o markup `fixed inset-0 ... bg-ink/40` + `<Card>` que era
  replicado manualmente em ~11 páginas. Fecha com Escape ou clique no
  backdrop, e expõe `role="dialog"`/`aria-modal`. Usar sempre este
  componente para novos modais — não recriar o markup manual.

Fora de `ui/`: `components/layout/Sidebar.tsx` e `Header.tsx` (chrome fixo,
ver seção 6 para a lógica de seções por permissão),
`components/GlobalSearch.tsx` (busca no Header) e
`components/CollaboratorsOnline.tsx` (seção da Home, Realtime).

**Bug estrutural grave corrigido em 2026-09-02 — Ranking de operadores e
as 3 distribuições (Por canal/status/tópico) do Analytics usavam
## 12. Convenções de código

- **Nomenclatura de dados em português, código em inglês**: nomes de
  variável/função seguem o domínio (ex: `usuarios`, `busca`, `salvando`,
  `abrirEdicao`, `remover`) em português — é o padrão do projeto, manter
  consistência em vez de inglês.
- **`services/api.ts`** é a única porta de entrada para dados. Padrão de
  nomes: `fetchX` (leitura), `fetchAllX` (leitura irrestrita p/ admin,
  quando existe uma versão filtrada por RLS para uso comum), `upsertX`
  (criação/edição — um único registro, decide insert vs. update pela
  presença de `id`), `deleteX`, `createX`/`requestX` para fluxos específicos
  (ex: `requestHelpdesk`, `requestLeave`).
- **Tipos**: `types/database.ts` = espelho literal das tabelas (prefixo
  `Db`, ex: `DbUser`); `types/index.ts` = tipos de UI (hoje majoritariamente
  obsoletos, ver ROADMAP.md — só `AppUser`/`UserRole` estão de fato em
  uso). Ao criar uma tabela nova, o tipo `Db*` vai em `database.ts`; só
  criar um tipo em `index.ts` se realmente precisar de uma forma de
  exibição diferente do formato do banco.
- **Formulários**: sempre React Hook Form + Zod. Padrão:
  ```ts
  const schema = z.object({ campo: z.string().min(1, "mensagem") });
  type FormType = z.infer<typeof schema>;
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<FormType>({ resolver: zodResolver(schema) });
  ```
- **CRUD em página administrativa**: padrão replicado em todo `pages/admin/*`
  e em módulos com gestão própria (ex: Missões) — busca com `useState` +
  filtro `useMemo`, modal controlado por `dialogAberto`/`editando`, `onSubmit`
  chama `upsertX` seguido de `queryClient.invalidateQueries`, erro em
  `useState<string | null>` exibido inline. Ver `AdminUsuarios.tsx` como
  referência completa.
- **Datas/período**: usar `src/lib/dateRanges.ts`
  (`resolvePeriodo`/`periodoAnterior`/`PeriodoPreset`) para qualquer filtro
  de período — não reimplementar cálculo de intervalo de data numa página
  nova.
- **Duração/tempo**: usar `src/lib/formatDuration.ts`
  (`formatDuration`/`formatDurationFromMinutes`) para qualquer exibição de
  segundos/minutos como texto — não recriar `formatSegundos` local (isso já
  foi um problema resolvido, ver README).
- **Classe CSS condicional**: sempre via `cn(...)` (`src/lib/utils.ts`,
  `clsx` + `tailwind-merge`), nunca concatenação manual de string.
- **Erros de mutação**: padrão local é `try/catch` com `setErro(mensagem)`
  em vez de um sistema global — `ToastContext.mostrarErro` existe e é usado
  em alguns fluxos, mas não é universal; ao adicionar uma mutação nova,
  seguir o padrão já presente na página (a maioria usa erro inline no
  próprio card/modal).
- **`security definer` no Postgres**: qualquer agregação/ranking/cálculo
  que cruze dados de mais de um usuário deve ser uma função SQL, nunca
  buscar tudo e agregar no cliente (motivo: performance e RLS — uma query
  agregada pode expor menos dado bruto do que buscar linha a linha).
- **Embed do PostgREST em tabela com mais de uma FK pra `users`**: nunca
  usar `select("*, usuario:users(nome)")` solto — se a tabela tem mais de
  uma foreign key pra `users` (ex: `user_id` + `created_by`), o embed
  implícito falha com "Could not embed because more than one relationship
  was found", e o erro fica **silencioso** (a tela só mostra "Não
  definido"/vazio, sem indicação de que a query quebrou). Sempre usar a
  forma explícita `usuario:users!nome_da_constraint(nome)` (conferir o
  nome real com `information_schema.table_constraints` antes de assumir);
  já corrigido nas tabelas de calendário (`docs/HISTORICO.md`, 2026-09-01) e em
  `missions`/`reclame_aqui_cases`/`helpdesks` (anteriormente).
- **Função nova de métrica sobre conversas**: sempre `and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)` na base (`docs/HISTORICO.md`, 2026-09-24).
- **`crisp_conversations.canal` para WhatsApp é sempre o URN cru
  `urn:crisp.im:whatsapp:0`, nunca `"WhatsApp"`** (só `csat_results.canal`
  grava a versão formatada — pipeline n8n diferente). Qualquer função nova
  que filtre ou exiba `canal` vindo de `crisp_conversations` deve usar
  `public.canal_normalizado(canal)` — comparar/exibir a coluna crua faz o
  filtro "WhatsApp" ficar silenciosamente quebrado (zero resultados, sem
  erro), bug real que afetou 22 funções até ser corrigido em 2026-09-02
  (`docs/HISTORICO.md`).

## 13. Convenções de UI/UX

- **Paleta**: `forest` (verde, cor de marca — ações primárias, destaque de
  sucesso), `sand` (fundo/superfície neutros — redesign 2026-09-05: escala
  fria/neutra, família "zinc", não mais um cinza levemente quente), `amber`
  (alerta/atenção), `rust` (erro/perigo), `sky` (informação), `violet`
  (ausência/férias/folga). **`teal` foi removida** no redesign de
  2026-09-05 (era o acento secundário adicionado em 2026-09-04) — não
  reintroduzir sem decisão explícita; "selecionado/ativo" é sempre
  semântica do forest em toda a plataforma. Definidas em
  `tailwind.config.ts`, nunca usar cores hex soltas no JSX — sempre pelas
  classes do tema. **Preferir cor sólida a gradiente** (redesign 2026-09-05,
  tom minimalista/refinado) — gradientes decorativos (barra de destaque de
  `Card accent`, semáforo de `corPorFaixa`, nav ativo da Sidebar, fundo do
  Login) foram todos trocados por cor sólida; o único gradiente que
  sobrou é funcional (sweep do `Skeleton`/shimmer), não decorativo.
- **Modo escuro** (desde 2026-08-31, ver `docs/HISTORICO.md` para o histórico
  completo): `ink`/`sand` são variáveis CSS (`.dark` em `<html>` troca o
  valor), então `bg-sand-surface`/`text-ink`/`border-sand-line` já
  funcionam nos dois temas de graça — nunca use `bg-white` cru (vira
  branco sólido preso, mesmo no escuro). Cores de acento (`forest-500`
  etc.) não trocam de valor entre temas, mas os tons **"50"** (fundo
  bem claro + texto "700", usado em badge/chip/ícone-circular) precisam
  de um par manual `dark:bg-{cor}-500/15 dark:text-{cor}-400` toda vez
  que forem usados — não existe atalho automático pra esse padrão
  específico (ver `Badge.tsx`/`Avatar.tsx` como referência).
- **Tipografia**: `Sora` como única família (`font-display` e `font-body`
  apontam pra ela — redesign 2026-09-05, substituiu o par Poppins/Inter),
  pesos 400/500/600/700/800, diferenciação entre display/body é só
  peso/tamanho, não fonte diferente. IBM Plex Mono (`font-mono`) continua
  não usado em nenhuma tela identificada. Tamanhos semânticos custom:
  `text-display`, `text-card-title`, `text-legenda`, `text-kpi-lg`,
  `text-micro`. O relatório exportável (PPTX/PDF da Reunião de Resultados,
  `exportPptx.ts`/`RelatorioResultadosSac.tsx`) continua **de propósito**
  na identidade anterior (Poppins, teal `#2FE0C8`) — é um artefato de
  impressão com identidade própria já aprovada, fora do escopo do redesign
  do app ao vivo (ver `docs/HISTORICO.md`, 2026-09-05).
- **Raio de borda**: `rounded-xl`/`rounded-2xl` em praticamente todo
  elemento (cards, inputs, botões, modais) — nunca `rounded-none`/`rounded-sm`
  sem motivo.
- **Sombras**: `shadow-card` (base), `shadow-soft`, `shadow-float` (modais,
  sidebar expandida) — valores mais rasos/neutros desde o redesign de
  2026-09-05 (antes tinham tinta verde forte). `shadow-glow` foi **removida**
  junto com o teal — não usar `shadow-lg`/`shadow-xl` padrão do Tailwind.
- **Motion**: `framer-motion` já é dependência instalada — usar em vez de
  CSS `@keyframes` sempre que a animação depende de estado React (entrada/
  saída condicional, `layoutId` pra elemento que desliza entre posições).
  `@keyframes` em `index.css` (hoje só `shimmer`, do Skeleton — os blobs
  decorativos do Login foram removidos no redesign de 2026-09-05) só faz
  sentido pra animação puramente decorativa e sempre-ativa, sem estado.
  Toda animação nova (própria ou herdada de `prefers-reduced-motion`)
  precisa continuar funcionando com `prefers-reduced-motion: reduce` — ver
  o bloco já existente em `index.css`.
- **Layout de página**: container global `max-w-[1600px]` centralizado
  (`AppLayout.tsx`), sidebar fixa recolhível (72px colapsada, 240px
  expandida, expande no hover ou fixada por clique).
- **Modais**: usar `<Dialog onClose={...}>` (`src/components/ui/Dialog.tsx`)
  envolvido pelo `{condicao && <Dialog>...}` do estado local — não recriar o
  markup `fixed inset-0 ... bg-black/50` manualmente. Já tem animação de
  entrada (`framer-motion`, fade + scale) e `max-h-[90vh] overflow-y-auto`
  embutidos; fechamento continua instantâneo (ver `docs/HISTORICO.md`, 2026-09-04) —
  não é um bug esquecido, é limitação conhecida de escopo. Passe
  `className` para ajustar `max-w-*`/altura quando o formulário for maior
  que o padrão (`max-w-xl`).
- **Empty state, loading e erro**: sempre `EmptyState`, `Skeleton`/
  `CardSkeleton`, e mensagem de erro inline em `text-rust-500` — não usar
  `alert()`/spinners genéricos.
- **Cards de indicador**: sempre via `Kpi`, nunca recriar a marcação de
  card com número grande + seta de variação manualmente.
- **Tabelas administrativas**: `<table>` HTML simples dentro de `<Card>`,
  cabeçalho `bg-sand-bg` + `text-xs uppercase`, linhas com `border-t
  border-sand-line`, ações (editar/excluir) alinhadas à direita como
  ícone-botão `h-8 w-8 rounded-lg`.
- **Densidade**: preferir componentes compactos (`SegmentedControl` foi
  criado exatamente para substituir "botões-pill grandes e espaçados" —
  ver comentário no próprio arquivo).

## 14. Padrões de nomenclatura

- **Rotas**: kebab-case em português (`/meu-painel`, `/reuniao-resultados`,
  `/outros-links`, `/reclame-aqui`).
- **Componentes/páginas**: PascalCase, um arquivo por componente
  (`Home.tsx`, `AdminUsuarios.tsx`).
- **Hooks**: `useAlgumaCoisa.ts` (camelCase com prefixo `use`), Realtime
  sempre `useRealtime<Dominio>.ts`.
- **Tabelas do banco**: snake_case em português/inglês misto conforme o
  domínio original (`csat_results`, `mission_progress`,
  `calendar_leave_requests`) — seguir o padrão já usado no domínio ao
  criar uma tabela nova (calendário usa prefixo `calendar_`, por exemplo).
- **Tipos `Db*`**: sempre prefixo `Db` + nome da entidade em PascalCase
  singular (`DbUser`, `DbCsatResult`), espelhando 1:1 os campos da tabela
  (snake_case do Postgres viram propriedades também snake_case no tipo —
  não há conversão para camelCase).
- **Funções em `api.ts`**: verbo + entidade, ver seção 12
  (`fetchX`/`upsertX`/`deleteX`). Filtros complexos recebem um objeto
  `XFilters` tipado (ex: `AnalyticsFilters`, `OperadorFilters`,
  `NpsFilters`), não uma lista longa de parâmetros posicionais.
- **Slugs de permissão**: snake_case, mesmo valor usado em
  `modules.slug`, no argumento de `RequirePermission` e em
  `has_permission()` no banco (`csat`, `reclame_aqui`, `nps`, `links`...).

## 15. Fluxo para adicionar novas páginas

1. Criar o componente em `src/pages/NomeDaPagina.tsx` (ou
   `src/pages/admin/AdminNomeDaPagina.tsx` se for administrativa).
2. Registrar a rota em `src/App.tsx`, dentro do bloco `<Route
   element={<AppLayout />}>` (autenticado). Importar a página com
   `lazyWithRetry(() => import("@/pages/..."))` — **não** com `import`
   estático: só `Login` e `Home` ficam no bundle inicial (era um JS único de
   2,3 MB / 669 kB gzip; hoje ~415 kB / 127 kB o entry e ~207 kB gzip no
   carregamento inicial). `AppLayout` e `App.tsx` já envolvem as rotas em
   `RouteBoundary` (Suspense com esqueleto + tela de erro com "Recarregar");
   `lazyWithRetry` recarrega a página uma vez se o chunk sumiu após um deploy.
   Libs pesadas (`jspdf`, `pptxgenjs`) só via `await import()` dentro do
   handler do clique, nunca no topo do arquivo. Se for admin-only, envolver em
   `<Route element={<AdminOnlyRoute />}>`; se depender de permissão
   granular, em `<Route element={<RequirePermission slug="..." />}>`.
3. Se a página deve aparecer na sidebar, adicionar em
   `src/components/layout/Sidebar.tsx` — na seção certa (`sacItems` para
   área comum, bloco condicional `hasPermission(...)` para módulo com
   permissão granular, ou bloco `isAdmin` para área de administradores).
4. Buscar dados só via funções novas/existentes de `src/services/api.ts`
   (nunca `supabase.from` direto na página) — criar as funções necessárias
   lá primeiro, seguindo a convenção `fetchX`.
5. Reaproveitar `Card`, `Kpi`, `Badge`, `EmptyState`, `Skeleton`,
   `DateRangePopover` antes de criar marcação nova.
6. Se a página precisa atualizar sozinha quando o dado muda no banco,
   verificar se já existe um `useRealtime*` para a tabela envolvida; se
   não existir, criar um novo hook seguindo o padrão da seção 9 **e**
   confirmar que a tabela está na publicação `supabase_realtime` no banco.

## 16. Fluxo para adicionar novas tabelas

1. Definir e aplicar o schema diretamente no projeto Supabase ("Hub SAC",
   `riiwphsvqlatqtaqaemd`) — colunas, constraints, RLS. **Isto acontece
   fora deste repositório**; documentar aqui (seção 7) o que foi criado.
2. Adicionar o tipo espelho em `src/types/database.ts`, prefixo `Db`,
   campos snake_case idênticos aos do Postgres. Incluir relações opcionais
   populadas via join (`?: DbOutraTabela`) quando a query fizer
   `select("*, outra_tabela(*)")`.
3. Adicionar as funções de acesso em `src/services/api.ts`
   (`fetchX`/`upsertX`/`deleteX`), sempre delegando qualquer agregação
   pesada para uma função SQL (`security definer`) em vez de trazer todas
   as linhas para o cliente.
4. Se a tabela precisa ser lida em tempo real por mais de um usuário,
   habilitar na publicação `supabase_realtime` do Postgres e criar/estender
   um hook `useRealtime*`.
5. Se a tabela representa um módulo novo (rota própria, ícone na sidebar),
   considerar reservar o slug em `public.modules` mesmo antes de a tela
   existir (padrão já usado — vários slugs foram reservados na Fase 1
   antes do módulo ser implementado).
6. Atualizar este `CLAUDE.md` (seções 7 e 8) com a tabela nova e suas
   relações.

## 17. Fluxo para adicionar novas permissões

1. Garantir que existe uma linha em `public.modules` com o `slug` desejado
   — criar direto no Supabase via SQL (não existe mais tela de CRUD pra
   isso, removida em 2026-08-18, ver `docs/HISTORICO.md`).
2. Proteger a rota com `<Route element={<RequirePermission
   slug="meu_slug" />}>` em `App.tsx`.
3. Na Sidebar, mostrar o item condicionado a `hasPermission("meu_slug")`
   (seguir o padrão do bloco "Módulos com permissão" em `Sidebar.tsx`).
4. No banco, qualquer política de RLS que precise liberar escrita para
   quem tem essa permissão deve chamar `has_permission('meu_slug')` — não
   confiar só no bloqueio de rota do frontend.
5. A concessão/revogação por usuário já funciona automaticamente pela
   tela **Administração → Permissões** assim que o módulo existir em
   `public.modules` — não é necessário código novo para isso.

## 18. Lista dos módulos existentes

| Módulo | Rota | Acesso |
|---|---|---|
| Home | `/` | Todo autenticado |
| Meu Painel | `/meu-painel` | Todo autenticado |
| Missões | `/missoes` | Todo autenticado (gestão completa é admin-only) |
| Reunião de Resultados | `/reuniao-resultados` | Todo autenticado |
| Cursos | `/cursos` | Todo autenticado |
| Documentação | `/documentacao` | Todo autenticado |
| Atualizações | `/atualizacoes` | Todo autenticado |
| Helpdesks | `/helpdesks` | Todo autenticado (gestão de todas as solicitações é admin/permissão `helpdesks`) |
| Calendário | `/calendario` | Todo autenticado (escrita administrativa é admin-only) |
| Outros Links | `/outros-links` | Todo autenticado |
| Perfil | `/perfil` | Todo autenticado (próprio usuário) |
| CSAT | `/csat` | Permissão granular `csat` ou admin |
| Reclame Aqui | `/reclame-aqui` | Permissão granular `reclame_aqui` ou admin |
| NPS | `/nps` | Permissão granular `nps` ou admin |
| Overview (ex-Performance) | `/performance` | Todo colaborador ativo e aprovado vê a aba Dashboard (indicadores de saúde, "Precisa de atenção", sub-abas Pessoas/Velocidade/Qualidade/Fluxo); abas Atendimentos e IA genérica, pop-ups e listas de conversas são admin-only. `/analytics` redireciona pra cá (página Analytics excluída em 2026-09-24); `/em-risco` foi removida em 2026-08-31 |
| Administração (Usuários, Perfis, Permissões, Escalas, Metas, Cursos, Documentação, Atualizações, Outros Links) | `/admin/*` | Admin-only estrito |


## 19. Funcionalidades concluídas

- Autenticação via Supabase Auth + perfil vinculado (`public.users`).
- RBAC de dois níveis: perfil (Admin/Colaborador) + permissão granular por
  módulo, reforçada por RLS.
- Colaboradores Online em tempo real (status, sem polling).
- Outros Links com CRUD completo, ícone dinâmico, upload de imagem.
- Missões com criação via modal, claim por colaborador sem responsável,
  gestão admin-only.
- Meu Painel com filtro de período e indicadores pessoais (CSAT, missões,
  cursos, evolução vs. período anterior).
- CSAT como módulo próprio: planilha filtrável + dashboard por
  colaborador + exportação CSV/PDF.
- Analytics avançado: resumo do período, evolução (diária/semanal/
  mensal), ranking de operadores, distribuição por canal/status/tópico,
  tudo com Realtime.
- Reclame Aqui: dashboard, listagem/CRUD, simulador de meta de nota
  (dados de exemplo, sem integração real ainda).
- NPS: score automático, classificação gerada pelo Postgres, evolução
  mensal, CRUD (dados de exemplo, sem integração real ainda).
- Painel Administrativo unificado: CRUD completo (incluindo exclusão) para
  Usuários, Perfis, Permissões, Módulos, Cursos, Documentação,
  Atualizações, Outros Links.
- Atendimentos e Performance (admin-only) sobre `crisp_conversations`
  real, com filtros e Realtime.
- Correção de métricas de 1ª resposta para considerar só resposta humana
  (excluindo bot da Crisp).
- Calendário completo: feriados nacionais automáticos (inclusive móveis),
  grade mensal, plantões, escala de sábado com rodízio, folgas/férias/
  sobreaviso, aprovação de folga por admin, Realtime.
- Horário de trabalho configurável por usuário, descontado automaticamente
  dos indicadores de tempo (Dashboard/Performance).
- Helpdesks com fluxo de status imposto pelo banco, Kanban arrastável para
  admin, geração automática de Atualização ao concluir.
- Notificação sonora + badge de não lidas em tempo real (sino do Header).
- Exportação CSV (CSAT) e PDF (dashboard CSAT).
- Dashboard de atendimento na Home (5 cards + evolução diária, admin-only),
  usando `fetchDashboardAtendimentoSummary`/`fetchConversasEvolucao` que
  antes existiam em `api.ts` sem nenhuma tela consumindo.
- Exclusão (delete) wired na UI de Administração → Módulos, → Perfis e em
  Helpdesks (funções já existiam em `api.ts`, sem botão correspondente).
- Reunião de Resultados usando tempo médio de resolução real
  (`crisp_conversations`, via `fetchMinhasConversasMetricas`), substituindo
  o aviso de "tempo não registrado".
- Componente `Dialog` (`src/components/ui/Dialog.tsx`) extraído e adotado
  em todos os modais da aplicação (Escape, clique no backdrop,
  `aria-modal`).
- Build de produção (`npm run build`) verificado ponta a ponta pela
  primeira vez neste projeto — corrigidos os erros de tipo que o `tsc -b`
  nunca tinha rodado a tempo de pegar (closures de `supabase` possivelmente
  nulo nos hooks `useRealtime*`, campo `email` faltante em `DbCsatResult`,
  imports não usados, inferência de tipo em `fetchMyPermissions`).
- Status "online" automático no login (`ensureOnlineStatus`), sem o que a
  seção Colaboradores Online da Home nunca tinha dado nenhuma pra mostrar —
  ninguém tinha motivo pra abrir o popover manual de status.
- Alerta no Calendário quando a semana atual está sem responsável definido
  (banner + KPI destacado, admin-only).
- Tela própria para gerenciar `atendente_aliases` (Administração → Aliases
  de Atendente), CRUD completo — antes só existia leitura, sem UI.
- Exportação CSV da lista "Em Risco" (respeita os filtros ativos).
- Rodízio de sábado corrigido (`escala_sabado_config` populada + bug de
  `useMemo` em `AdminEscalas.tsx`) e ganhou campo para editar a data de
  referência — ver `docs/HISTORICO.md` para o diagnóstico completo.
- Reunião de Resultados corrigida (fonte errada de dados: CSAT/atendimentos
  zerados pra admin) e Analytics corrigido (KPI "Total de chamados" que
  sempre repetia "Total de avaliações", gráfico de evolução sempre vazio
  por `JOIN` num campo sempre nulo) — ver `docs/HISTORICO.md`.
- RR ganhou edição, exclusão admin-only, campos opcionais (plano de
  ação/objetivos), exportação em PDF (histórico ou RR única), dialog de
  visualização por card, e detalhamento por atendente (chamados/avaliações
  x período anterior, mensal ou semanal) — ver `docs/HISTORICO.md`.

## 20. Funcionalidades pendentes

Ver **`ROADMAP.md`** para o levantamento detalhado e priorizado (TODOs,
funcionalidades parcialmente implementadas, código morto). Resumo do que é
sabidamente incompleto por decisão de escopo (não é bug):

- Integração real com Crisp/HugMe para Reclame Aqui e NPS (hoje só dados
  de exemplo).
- Reunião de Resultados avançada (comparação semana×semana, exportar PDF,
  copiar relatório).
- Sistema de Tags em Documentação.
- Cache de analytics (`analytics_cache`) e comparativos adicionais.
- Decisão sobre migrar `csat_results`/`crisp_conversations` para o schema
  `crisp_ratings` + `analytics_sac` (hoje vazio e reservado).
- Decisão sobre qual fonte é definitiva para NPS: `nps_responses` (em uso)
  vs. `nps_followups` (schema real, vazia).

## 21. Decisões arquiteturais importantes

- **`csat_results` é a fonte de verdade de satisfação; `crisp_conversations`
  é a fonte de verdade de tempo.** Ambas compartilham e-mail como chave —
  nunca `user_id`. Decisão confirmada e documentada no README após
  investigação; não reverter sem entender por que (ver seção 20 do
  README completo, seção "Decisão de arquitetura: duas modelagens de
  Crisp coexistindo no banco").
- **RBAC de rota estrito para Atendimentos/Performance/Admin**: mesmo tendo
  sistema de permissão granular, essas rotas exigem `is_admin()` puro, por
  decisão explícita de produto — não trocar por `RequirePermission` sem
  confirmar com o time.
- **Cálculos pesados sempre em SQL** (`security definer`), nunca agregados
  no cliente — motivo: performance e menor exposição de dado bruto via
  RLS.
- **RLS é a camada de segurança real**, o frontend é conveniência de UX.
  Qualquer nova tela deve assumir que um usuário mal-intencionado pode
  chamar a API do Supabase diretamente, ignorando a UI.
- **`crisp_conversations`, `crisp_ratings`, `nps_followups`,
  `analytics_sac`**: tabelas/view "paralelas" identificadas pelo advisor de
  segurança do Supabase, deliberadamente deixadas intocadas — reservadas
  para quando existir integração direta com a API do Crisp. Não apagar,
  não migrar sem decisão explícita.
- **Sem servidor próprio**: toda a lógica de backend vive no Postgres
  (funções `security definer`) ou no frontend puro — não introduzir uma
  API Node/Express paralela sem alinhar antes, é uma mudança de
  arquitetura.
- **RBAC do frontend desenhado para crescer**: `AuthContext` e
  `ProtectedRoute` já suportam adicionar novos perfis além de
  Admin/Colaborador sem refatoração estrutural (mas `mapDbUserToAppUser`
  hoje só reconhece dois valores — extensão real exigiria tratar isso).
- **Triggers do Postgres disparam pra service role também — RLS bypass não
  é trigger bypass.** `prevent_self_privilege_escalation()` (seção 5, item
  8) reconhece `auth.role() = 'service_role'` como confiável (mesmo nível
  de `is_admin()`) desde 2026-09-08 (ver `docs/HISTORICO.md`), porque uma Edge
  Function usando a service role key pra dar `UPDATE` em `public.users`
  ainda dispara esse trigger — só ignora RLS, não os triggers da tabela.
  Qualquer trigger novo em `users` que dependa de `is_admin()`/
  `current_app_user_id()` precisa do mesmo tratamento explícito, senão
  quebra silenciosamente (sem erro) qualquer Edge Function que precise
  escrever nessas colunas.

## 22. Boas práticas que devem ser seguidas neste projeto

- Nunca hardcodar credenciais — sempre via `.env` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`).
- Nunca acessar `supabase.from(...)`/`supabase.rpc(...)` fora de
  `src/services/api.ts` (exceção: hooks `useRealtime*`, que só assinam
  canais, não leem/escrevem dado de negócio).
- Nunca confiar só na UI para proteger dado sensível — toda regra de
  acesso precisa existir (ou já existir) em RLS/função SQL.
- Nunca usar `csat_results.user_id` para vincular a um colaborador — usar
  e-mail.
- Nunca tratar `crisp_conversations.tipo_cliente` como valor único — é uma
  lista separada por vírgula.
- Nunca reimplementar formatação de duração ou cálculo de período — usar
  `formatDuration.ts`/`dateRanges.ts`.
- Nunca fazer `new Date(stringSóData)` com uma string tipo `"2026-08-31"`
  (vinda de `<input type="date">` ou de coluna `date` do Postgres) — por
  spec, string só-data é sempre parseada como UTC, não horário local;
  em qualquer fuso atrás de UTC (Brasil, UTC-3) isso volta um dia. Sempre
  `new Date(str + "T00:00:00")` (bug real corrigido em 2026-09-03 no
  filtro "Personalizado" de período, ver `docs/HISTORICO.md` — afetava dado de
  verdade, não só o rótulo).
- Sempre validar formulário com Zod + React Hook Form, nunca validação
  manual solta.
- Sempre reaproveitar os componentes de `components/ui/` antes de criar
  marcação nova equivalente.
- Sempre que uma tela nova buscar dado de mais de um usuário (ranking,
  agregação, dashboard geral), preferir criar/reusar uma função SQL em vez
  de buscar tudo e agregar no cliente.
- Sempre atualizar este `CLAUDE.md` (e o `README.md`, que mantém o
  histórico cronológico de fases) ao concluir uma funcionalidade
  relevante — ver seção 23.
- Nunca inserir dado fictício/de teste diretamente nas tabelas que
  recebem dado real do n8n (`csat_results`, `crisp_conversations`,
  `crisp_messages`) — isso já causou um incidente de dados fictícios em
  produção (ver README). Para demonstração, usar tabelas isoladas ou dado
  claramente marcável.

## 23. O que nunca deve ser alterado sem análise prévia

- **RLS e funções `security definer` no banco** — qualquer alteração pode
  abrir um buraco de segurança silencioso (o frontend não vai acusar erro
  imediatamente).
- **`csat_results` e `crisp_conversations`** — são alimentadas por um
  pipeline n8n externo e ativo, com dados reais de cliente (nome,
  telefone, e-mail). Nunca escrever dado de teste/demonstração ali (ver
  incidente documentado no README). Qualquer alteração de schema precisa
  considerar o pipeline externo que já escreve nessas tabelas.
- **`crisp_conversations`, `crisp_ratings`, `nps_followups`,
  `analytics_sac`** — schema paralelo reservado, deliberadamente intocado.
  Não apagar, não popular com dado fictício, não migrar sem decisão
  explícita do time.
- **Vínculo `users.auth_id`** — já causou dois incidentes de "usuário não
  consegue entrar" quando ficou dessincronizado do Supabase Auth. Ao criar
  um usuário novo, sempre confirmar que o `auth_id` foi vinculado.
- **Guards admin-only de `/admin/*` e das abas/listas do Overview** —
  decisão de produto explícita, não trocar por permissão granular sem
  confirmar.
- **`helpdesks` — validação de link (`https://greenn.crisp.help/pt-br/`)**
  — existe em duas camadas (Zod + check constraint); alterar uma sem a
  outra quebra a garantia de "não dá pra burlar via API direta".
- **Migrations/schema do Supabase** — não há versionamento local; qualquer
  alteração de schema deve ser cuidadosamente documentada aqui (seções 7
  e 8) já que não há histórico em código para consultar depois.
- **`.env`** — nunca commitar (já está no `.gitignore`); contém as chaves
  do projeto Supabase de produção.

## Como manter este arquivo atualizado

Sempre que uma funcionalidade importante for implementada, alterada ou
removida:
1. Atualizar a seção relevante deste arquivo (módulos, tabelas, decisões,
   pendências) — não só o `README.md`. **Manter este arquivo enxuto**
   (limite do Claude Code: 150 mil caracteres, carregado em toda sessão):
   aqui entra só a regra/fato que vale hoje, em poucas linhas. O relato
   completo (diagnóstico, números de validação, rollback) vai em
   `docs/HISTORICO.md`, como nova entrada no fim.
2. Se uma tabela nova foi criada ou uma existente mudou de propósito,
   atualizar as seções 7 e 8.
3. Se uma decisão de arquitetura foi tomada (ex: qual tabela é fonte de
   verdade, o que ficou de fora por decisão de produto), registrar na
   seção 21 com o motivo — não só o "o quê".
4. Mover itens da seção 20 (pendentes) para a seção 19 (concluídas) quando
   entregues.
5. Reconsultar `ROADMAP.md` periodicamente: itens resolvidos devem sair de
   lá; achados novos (dead code, TODO, funcionalidade parcial) devem
   entrar.
