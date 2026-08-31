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

Não existe pasta `supabase/` com migrations neste repositório — o schema é
gerenciado diretamente no projeto Supabase ("Centralização - SAC"), fora do
controle de versão do frontend. Isso é um risco documentado (seção 20).

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
   `supabase.auth.signInWithPassword`. Desde 2026-08-31 (ver seção 10)
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
  `/atendimentos`, `/performance` e todo `/admin/*` — **estrito**, sem
  bypass por permissão granular (decisão explícita registrada no README).
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
  (coluna gerada pelo Postgres a partir da nota), `link_chamado`,
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
  `operator_crisp_id` distintos) — ver seção 10, fix de 2026-08-17.
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
  nenhuma linha desde a criação da tabela até 2026-08-14 (ver seção 10),
  o que fazia o rodízio parecer "quebrado" mesmo com gente cadastrada em
  `escala_sabado`. Editável agora em Administração → Escalas.

**Aliases de atendente**: `atendente_aliases` (usado só via
`fetchAtendenteAliases()` no dashboard de CSAT, pra juntar e-mails
variantes do mesmo atendente). Teve uma tela própria de CRUD
(Administração → Aliases de Atendente) criada em 2026-08-14, **removida
em 2026-08-18** por decisão de produto (ver seção 10) — edição hoje é só
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
  correlacionar com uma conversa do Crisp, mas os dois estão **100% nulos**
  no pipeline atual — `csat_tempo_resposta_correlacao` ainda depende disso
  e fica vazia. `conversas_nota_baixa()` foi **corrigida em 2026-08-16**
  pra não depender mais desse vínculo: `csat_results` já carrega
  `cliente`/`atendente`/`canal`/`topico`/`comentario`/`link_chamado`
  próprios, então a função passou a ler direto da tabela em vez de fazer
  `join` com `crisp_conversations` por `crisp_id` (que nunca casava
  nenhuma linha). Continua podendo aparecer vazia — mas agora por não
  haver avaliação com nota baixa no período, não por falha de vínculo.
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

**Não há integração direta com a API do Crisp neste código.** O Crisp é a
ferramenta de chat/atendimento ao cliente da Greenn; um **pipeline externo
via n8n** (fora deste repositório) lê o Crisp e escreve periodicamente nas
tabelas `csat_results`, `crisp_conversations` e `crisp_messages` do
Postgres. O frontend só lê essas tabelas — nunca chama a API do Crisp.

Pontos relevantes para quem for mexer nessa integração:
- `csat_results` = avaliações de satisfação (nota, comentário do cliente).
- `crisp_conversations` = conversas/atendimentos, com tempos.
- `crisp_messages` = granularidade de mensagem, usada só para calcular a
  primeira resposta humana (função interna
  `_primeiras_respostas_humanas()`, não exposta via API).
- O vínculo confiável com o colaborador é sempre por **e-mail**
  (`email_atendente` / `operator_email`), nunca por `user_id`.
- `tipo_cliente` em `crisp_conversations` é uma lista de tags separada por
  vírgula — sempre filtrar com `ILIKE %tag%`.
- Botão "Ver chamado" (Atendimentos) abre `crisp_conversations.link_chamado`,
  coluna nova ainda não populada pelo n8n hoje — só aparece se o link
  existir.
- `crisp_ratings` e a view `analytics_sac` são um schema **alternativo**,
  aparentemente preparado para uma futura integração direta com a API do
  Crisp (sem n8n no meio) — está vazio e **intocado**; não migrar para lá
  sem decisão explícita (ver seção 14).
- Helpdesks aceita apenas links iniciados em
  `https://greenn.crisp.help/pt-br/` (validado em Zod e por check
  constraint no banco) — é o link da central de ajuda do Crisp, não a API.

**Bug diagnosticado em 2026-08-13 (tempo de 1ª resposta inconsistente):**
`_primeiras_respostas_humanas()` exclui o bot filtrando
`operator_nome not ilike '%IA%'`/`'%bot%'` e `origin not ilike
'%crisp.im:bot%'` em `crisp_messages`. No fluxo n8n `Crisp → Hub`, só o
node `Code - Received` (evento `message:received`) normaliza mensagem
automática pra `operator_nome = "Atendente IA Greenn"` quando
`data.automated === true`. O node `Code - Send` (evento `message:send`,
responsável por criar a conversa e gravar a 1ª mensagem quando é
conversa nova) **não faz essa normalização** — grava o nome cru do bot no
Crisp. Resultado: quando a IA manda a primeira mensagem de uma conversa
nova, ela pode ser contada como "primeira resposta humana", zerando o
tempo de resposta daquela conversa. Fix é no `Code - Send` do n8n (fora
deste repositório): aplicar a mesma normalização `automated === true →
operator_crisp_id = "ia_greenn"`, `operator_nome = "Atendente IA Greenn"`
que já existe no `Code - Received`. Só corrige dado novo — conversas já
gravadas erradas em `crisp_messages` precisam de backfill manual à parte
se necessário. Status: **fix aplicado no `Code - Send` do n8n e validado**
em teste real (2026-08-13). Achado empírico ao checar as 1410 conversas
históricas: a primeira mensagem de **toda** conversa real é sempre do
cliente (`from_type = 'user'`), nunca do bot — nos canais em uso (chat,
email, WhatsApp) o cliente sempre fala primeiro, então esse bug
provavelmente nunca chegou a disparar na prática. O fix foi mantido por
correção/consistência mesmo assim.

**Fix aplicado em 2026-08-13 — `atendente_performance()` contava conversa
sem atendente:** a função agrupava por `crisp_conversations.operator_nome`,
e conversas recém-criadas que ainda não foram tocadas por ninguém (nem bot,
nem humano) têm esse campo `NULL` — aparecia como uma linha "sem nome" no
ranking da tela Performance. Adicionado `and cc.operator_nome is not null`
no filtro da função (aplicado direto via `execute_sql`, sem migration
versionada — ver risco documentado na seção 20/23).

**Fix aplicado em 2026-08-13 — `calendar_holidays` estava vazia:** mesmo
padrão de dano do TRUNCATE, achada ao investigar por que o card "Próximo
feriado" do Calendário não mostrava nada. Repovoada com feriados nacionais
reais do Brasil 2025–2027 (fixos + móveis; Páscoa/Carnaval/Sexta-feira
Santa/Corpus Christi calculados via algoritmo de Gauss/Meeus, não
chutados). `src/pages/Calendario.tsx` também ganhou cores diferentes por
tipo de dia no grid (sábado/domingo/feriado) e emoji temático por feriado
(`emojiFeriado()`).

**Fix aplicado em 2026-08-14 — rodízio de sábado nunca escalava ninguém,
por dois bugs empilhados:** ao auditar a plataforma inteira por dado
faltando, `escala_sabado_config` apareceu com 0 linhas e 0 referências no
frontend, parecendo tabela morta. Na real é uma dependência obrigatória
da função SQL `atendente_escalado_sabado()` (ver seção 7) — sem essa
linha, `data_referencia` é `NULL` e a função sempre retorna vazio,
mascarado atrás do mesmo texto "Sem escala definida" que apareceria se a
sequência estivesse genuinamente vazia. Populada com o default do próprio
schema (`data_referencia = 2026-01-03`) e Administração → Escalas ganhou
um campo para editar essa data (`fetchEscalaSabadoConfig`/
`upsertEscalaSabadoConfig`). Ao verificar no navegador, um **segundo bug
independente** apareceu: o card "Próximos sábados" continuava vazio mesmo
com a config corrigida — `src/pages/admin/AdminEscalas.tsx` recalculava
`proximosSabados(4)` a cada render sem `useMemo`, e como a chave da query
do TanStack Query (`["escalados-sabados", sabados.map(s => s.toISOString())]`)
incluía o horário exato (`toISOString()` carrega milissegundos), a chave
mudava a cada render — a query nunca chegava a `success`, ficava
reiniciando (`fetchStatus: "fetching"` para sempre). Corrigido com
`useMemo` nos sábados e na chave (só as datas ISO, sem hora). Os dois bugs
juntos faziam a tela parecer "sem função de definir atendente de sábado"
mesmo já existindo (o dropdown "Definir plantão de sábado" no
`Calendario.tsx`, por data específica, sempre funcionou — o que estava
quebrado era só a *projeção automática* baseada no rodízio).

**Fix aplicado em 2026-08-15 — Analytics "Total de chamados" mentia (sempre
igual a "Total de avaliações") e o gráfico de evolução vinha sempre vazio:**
achado ao investigar reclamação de que "os dados não estão batendo" entre
Analytics e as outras telas (Performance/Em Risco/Home, que já usavam
`crisp_conversations`). Dois problemas:
1. `src/pages/Analytics.tsx` calculava "Total de chamados" a partir do mesmo
   `analytics_summary()` (que lê só `csat_results`, hoje 8 linhas) usado por
   "Total de avaliações" — por isso os dois KPIs sempre mostravam o mesmo
   número, e o texto da própria tela já admitia isso como limitação
   conhecida. Corrigido: "Total de chamados" agora vem de
   `dashboard_atendimento_summary()` (fonte `crisp_conversations`, hoje
   396 no mês — a mesma função já usada no dashboard da Home), que ganhou
   um parâmetro opcional `p_canal` pra respeitar o filtro de canal da tela.
   Ver decisão arquitetural da seção 21 (as duas tabelas medem populações
   diferentes: todas as conversas vs. só as avaliadas — números diferentes
   são esperados, não um bug em si).
2. `analytics_evolucao()` (gráfico "Evolução de chamados e CSAT") fazia
   `join public.users u on u.id = c.user_id` — e `csat_results.user_id` é
   **sempre `NULL`** na prática (mesmo problema já corrigido em
   `atendente_performance()` em 2026-08-13, que voltou a aparecer aqui
   porque é uma função irmã que nunca recebeu o mesmo fix). O `JOIN` nunca
   casava nenhuma linha, então o gráfico sempre renderizava "Sem dados.",
   mesmo com avaliações reais no período. Corrigido removendo o `JOIN`
   (o parâmetro `p_equipe` que dependia dele nunca era passado pelo
   frontend mesmo, igual já acontecia em `analytics_summary()`).

**Feature nova em 2026-08-15 — Reunião de Resultados mostra dado do time
pra admin:** `ReuniaoResultados.tsx` calculava CSAT/atendimentos/tempo
médio sempre a partir do e-mail do usuário logado — pra um admin (que
normalmente não atende ticket em nome próprio) isso sempre mostrava zero,
inutilizável pra levar pro Meet do time. Agora, quando `isAdmin`, os 3 KPIs
e o registro salvo em `rr_history` usam `dashboard_atendimento_summary()`
(resultado agregado do time inteiro no período) em vez das funções
pessoais (`fetchCsatForUser`/`fetchMinhasConversasMetricas`); colaboradores
sem permissão de admin continuam vendo só o próprio resultado (self-review
continua fazendo sentido pra esse público).

RR ganhou um conjunto de recursos no mesmo dia: edição (`updateRRHistory`,
só corrige o texto qualitativo, não os números recalculados no momento do
save), exclusão **admin-only** (`deleteRRHistory` + policy nova
`rr_history_delete_admin` — decisão revertida ainda no mesmo dia: a policy
de `DELETE` foi adicionada de propósito, colaborador comum continua sem
poder apagar o próprio histórico, só admin), campos "Plano de ação" e
"Objetivos" viraram opcionais no formulário (só "Aprendizados" e
"Dificuldades" continuam obrigatórios), exportação em PDF (histórico
inteiro ou uma RR específica, `exportRRHistoricoToPdf`/`exportRRUnicaToPdf`
em `src/lib/exportPdf.ts`), um dialog de visualização ao clicar num card do
histórico (mostra tudo, com botões Editar/Excluir/Baixar PDF), e uma nova
seção "Detalhamento por atendente" (admin-only) com chamados/avaliações/
CSAT por atendente comparado ao período anterior — mensal ou semanal via
`SegmentedControl`, reaproveitando `fetchAtendentePerformance` (já usada em
Performance.tsx) em vez de criar função SQL nova.

**Colunas ordenáveis em 2026-08-15/16 — clique no cabeçalho, `SortableHeader`:**
adicionado `src/components/ui/SortableHeader.tsx` (ícone de seta, alterna
asc/desc no clique, reseta pra direção padrão do campo ao trocar de coluna).
Substituiu o antigo seletor "Ordenar por" dentro do popover de Filtros em
Em Risco. `atendimentos_com_metricas()` ganhou parâmetro `p_direcao` (antes
cada modo de ordenação tinha uma direção fixa no SQL). Aplicado em: Em Risco
(Aberto desde, Tempo até 1ª resposta), Performance → aba Atendimentos
(Início, Tempo até 1ª resposta, Resolução) e nas duas tabelas de ranking
(Performance → Ranking, Analytics → Ranking de operadores) — essas duas
últimas ordenam **no cliente** (`Array.sort` num `useMemo`), sem mudança de
SQL, porque já carregam a lista inteira de uma vez (sem paginação).

**Fix arquitetural em 2026-08-16 — tempo útil passou a ser "cobertura do
time", não "jornada de quem respondeu":** `minutos_uteis_entre(p_inicio,
p_fim, p_entrada, p_almoco_saida, p_almoco_volta, p_saida)` calculava tempo
descontando fora-de-expediente usando a jornada cadastrada de UM atendente
específico (`horario_por_nome(atendente)`, geralmente quem respondeu
primeiro) — quebrava exatamente no caso de handoff de plantão: se o
chamado chegava às 18h e só era respondido depois por alguém cuja jornada
cadastrada termina às 17h, o sistema contava 18h–20h como "fora de
expediente" mesmo com outro atendente de plantão nesse horário (ex:
Brenda tem jornada até 20h cadastrada). Substituído por
`minutos_uteis_entre_time(p_inicio, p_fim)`: calcula a **união das jornadas
de todos os usuários ativos** (`range_agg`/multirange do Postgres 14+) —
qualquer momento em que PELO MENOS UM atendente cadastrado está de plantão
conta como "útil", refletindo o rodízio real do time em vez da jornada
individual de quem por acaso atendeu. Sábado continua com janela fixa
08h–12h (plantão à parte, não depende de `horario_*` de ninguém — ver
seção 7). Também eliminou o fallback problemático de 08h–17h que era usado
pra atendentes sem conta no Hub (ex: "Ana", só existe como texto livre no
Crisp) — agora eles simplesmente não contribuem pra união, e o horário
depende só de quem *tem* conta e jornada cadastrada (hoje: Eduardo
08h–17h, Brenda 10h–20h — union resulta numa cobertura contínua 08h–20h
nos dias úteis, sem buraco, porque os almoços são escalonados).
`atendimentos_com_metricas`, `dashboard_atendimento_summary`,
`atendente_performance` e `minhas_conversas_metricas` foram atualizadas
pra chamar a nova função (removido o `left join lateral
horario_por_nome(...)` de todas elas). Verificado manualmente com o caso
real "Rodrigo De Oliveira Borges" (chamado sexta 20:04, resposta sábado
10:20 → 2h20min27s corretos nos dois modelos, coincidência de a resposta
cair fora até da jornada mais longa) e um caso sintético 18h–19h de sexta
(sob o modelo antigo daria 0min se o responder não tivesse jornada até
lá; no modelo novo dá 60min corretos, cobertos pela jornada da Brenda).
Limpeza: junto com essa mudança, foram removidas ~5 sobrecargas (overloads)
mortas de `atendimentos_com_metricas`/`dashboard_atendimento_summary` que
tinham se acumulado de assinaturas antigas ao longo da sessão (o Postgres
identifica função por nome+tipos de parâmetro, então mudar a assinatura via
`CREATE OR REPLACE` várias vezes cria uma nova sobrecarga a cada vez em vez
de substituir, se os tipos mudarem).

**Fix arquitetural em 2026-08-17 — reconciliação de atendente por nome
trocada por ID (o "Comercial" duplicado de novo escancarou um problema
maior):** a heurística de juntar variações de nome do Crisp (curto vs.
completo) por `ILIKE`/substring — usada em `atendimentos_com_metricas`,
`atendente_performance` e no dedup client-side de
`fetchDistinctAtendentesConversas` — parecia funcionar, mas dependia de
comparar strings sem nenhuma garantia de que duas pessoas não
compartilhassem apelido curto. Investigando o caso "Comercial"/"Comercial
Greenn" (que voltou a aparecer separado), cruzei `operator_nome` com
`operator_crisp_id` (o ID real do operador no Crisp, disponível em
`crisp_conversations` mas nunca usado pra isso) e achei um caso pior:
**"Ana" não é uma pessoa, são duas** — Ana Paula Maximiano de Souza
(`operator_crisp_id` `441dcca0-...`, 83 atendimentos) e Ana Franca
(`4be15ad4-...`, 24 atendimentos) — a heurística por substring corria o
risco real de somar os atendimentos/CSAT de uma na conta da outra.
Substituído por `operator_id_aliases` (chave = `operator_crisp_id`) +
`nome_canonico_por_operator_id()`, populada manualmente checando qual ID
corresponde a qual nome completo (Brenda/Nathalia/Vittor/Comercial: um
ID só, seguro de unificar; Ana: dois IDs, mantidos separados). Um nome
curto — "Paula" (2 atendimentos) — não bateu com nenhum ID já visto com
nome completo, então **ficou intencionalmente sem alias** em vez de
adivinhar de quem é; se for a mesma Ana Paula ou outra pessoa, precisa
de confirmação humana antes de unificar. `fetchDistinctAtendentesConversas`
trocou o dedup no cliente por `distinct_atendentes_canonico()` no banco,
mesma fonte de verdade.

**Pendência descoberta em 2026-08-17 — posse/reabertura deveriam vir de
evento do Crisp, não de aproximação:** ao reestruturar Analytics (pedido
de reestruturação de métricas de atendimento), implementei
`relogio_posse_periodo()` reconstruindo posse por timestamp de
`crisp_messages` (quem mandou mensagem por último) — funciona, mas é
aproximação, e por isso ficou restrito a chamados **já resolvidos**
(senão um chamado pendente sem retomada acumula posse indefinidamente).
Investigando a API do Crisp (`docs.crisp.chat`), achei que existe o jeito
certo de fazer isso:
- Evento RTM `session:set_routing` — disparado quando um operador é
  atribuído/desatribuído de uma conversa. Payload: `session_id`,
  `routing_id` (operador atribuído, pode ser null), `previous_routing_id`.
  **O n8n não escuta esse evento hoje.**
- Evento RTM `session:set_state` — disparado quando o estado muda
  (`pending`/`unresolved`/`resolved`). Payload: `session_id`, `state`.
  Se o n8n comparar o estado novo com o anterior e detectar uma conversa
  que já foi `resolved` voltando pra `pending`/`unresolved`, isso é a
  reabertura de verdade — hoje `reopened_count` existe na tabela mas
  **nunca é incrementado** porque nada escuta essa transição.

Preparei o lado do Supabase pra quando o n8n for ajustado:
- `operator_routing_history` (`session_id`, `operator_crisp_id`,
  `previous_operator_crisp_id`, `event_at`) — tabela nova, vazia até o
  n8n escrever nela. Quando populada, `relogio_posse_periodo()` deve ser
  reescrita pra ler daqui em vez de reconstruir por mensagem — aí dá pra
  incluir pendentes com segurança também, porque a janela é fechada por
  um evento real de desatribuição, não por uma mensagem que talvez nunca
  chegue.
- `crisp_conversations.first_resolved_at` — coluna nova, pra manter
  "primeira resolução" separada de `resolved_at` (resolução mais recente)
  quando `reopened_count` passar a ser real.

**Mudança de n8n necessária** (fora deste repositório, não implementada
por mim): assinar `session:set_routing` → `insert` em
`operator_routing_history`; assinar `session:set_state` → se
`state = 'resolved'`, atualizar `resolved_at`/`first_resolved_at`
(coalesce, nunca sobrescrever); se `state` voltar pra
`pending`/`unresolved` COM `status` anterior já `resolved`, incrementar
`reopened_count`.

**Fix aplicado em 2026-08-18 — pipeline de posse ativado via evento real do
Crisp:** a pendência acima foi resolvida do lado da captura. O evento
`session:set_routing` só é entregue por **Plugin Hook** (Marketplace), não
por Website Hook (configurado direto no site) — são dois mecanismos
diferentes de webhook do Crisp, com suporte a eventos distinto (ver matriz
completa em `docs.crisp.chat/references/web-hooks/v1/`). O plugin
"Conversation N8N" já existia no Marketplace mas **nunca tinha sido
instalado no workspace da Greenn** (só existia em modo dev) — instalado via
link `app.crisp.chat/initiate/plugin/<id>/`, com scopes de leitura
`sessions`/`messages`/`states`/`routing`/`operators`, e um Production Web
Hook criado nele (Settings → Events) apontando pra
`https://n8n.sac.greenn.com.br/webhook/crisp-conversations`, assinando os 4
eventos (`message:send`, `message:received`, `session:set_state`,
`session:set_routing`). O Website Hook antigo (que cobria só
send/received/set_state) foi **excluído** depois de confirmar que o plugin
sozinho já entrega tudo (payload real inspecionado tem o header
`x-crisp-hook-origin: plugin/rtm ... production`, confirmando a origem).
`operator_routing_history` já recebe linhas reais (`operator_crisp_id`,
`previous_operator_crisp_id`, `event_at`) a cada troca de atribuição.

Com dado real fluindo, `relogio_posse_periodo()` foi reescrita: agora lê
**prioritariamente** de `operator_routing_history` — cada evento marca o
início de uma posse, e o fim é o próximo evento da mesma conversa (ou
`resolved_at`, ou `now()` se ainda estiver aberta). Deixou de exigir
conversa resolvida nesse caminho, porque o início da janela já é um evento
real (não uma aproximação), então não tem mais o risco de posse inflada por
chamado abandonado que existia na versão por mensagem. A reconstrução por
`crisp_messages` (como antes) virou só **fallback**, usada apenas pra
conversas que ainda não têm nenhum evento de roteamento capturado (dado
anterior à instalação do plugin) — e continua restrita a resolvidas, porque
nesse caminho não existe um fim de posse confiável para conversa aberta. As
duas fontes nunca se misturam para a mesma conversa. Validado com dado real:
duas conversas abertas (`pending`) do dia 2026-08-18 já aparecem com posse
calculada corretamente até `now()`.

**Validado em 2026-08-18 com teste real ponta a ponta**: reabriu-se um
chamado de teste (cliente respondendo depois de resolvido) e um segundo
atendente assumiu no meio — `reopened_count` incrementou pra 1,
`first_resolved_at` permaneceu intocado, `resolved_at` voltou a `null`, e
`operator_routing_history` registrou os 3 eventos de roteamento (Eduardo →
Ana Paula → Eduardo) com os tempos certos. Pipeline confirmado funcionando
só com o Plugin Hook, sem o Website Hook antigo.

**Gap descoberto nesse mesmo teste**: `relogio_posse_periodo()` fecha cada
janela de posse só no próximo evento de roteamento — ela **não corta a
janela na resolução/reabertura**. Resultado: se um chamado fica parado
(resolvido) por um tempo antes de reabrir, esse tempo parado é somado à
posse de quem tinha o chamado antes de resolver, como se fosse trabalho
ativo. Causa raiz: só guardamos `resolved_at`/`first_resolved_at`/
`reopened_count` como campos escalares (valor atual), sem histórico
carimbado de cada mudança de estado — diferente do roteamento, que agora
tem `operator_routing_history` evento a evento. Correção proposta e ainda
não implementada: criar uma tabela de histórico de estado (`session_id`,
`state`, `event_at`) populada a cada `session:set_state`, e fazer
`relogio_posse_periodo()` cortar cada run tanto no próximo roteamento
quanto na resolução/reabertura, o que vier primeiro.

**`operator_id_aliases` populada para todo o time em 2026-08-18**: puxada
a lista completa de operadores via API REST do Crisp
(`GET /v1/website/{website_id}/operators/list`, autenticação por Plugin
Token — `Authorization: Basic BASE64(identifier:key)` + header
`X-Crisp-Tier: plugin`, obrigatório pra tokens de plugin, senão dá
`invalid_session`) — 21 operadores cadastrados de uma vez, incluindo nomes
que antes só apareciam via fallback de mensagem ou ficavam com ID cru.
Resolveu também uma pendência de 17/08: o atendente "Paula" (2
atendimentos, sem alias por precaução) é **Paula Pimentel**
(`e4dbb36f-53a3-4bb7-836f-0975cdc6f9e7`), pessoa diferente da Ana Paula
Maximiano de Souza — confirmado pela API, não por suposição.

**Dado de teste limpo em 2026-08-18**: como o app ainda não está em
produção (só local), `crisp_conversations`, `crisp_messages`,
`csat_results`, `nps_responses` e `operator_routing_history` foram
zeradas por decisão consciente do usuário, pra não misturar o histórico
acumulado antes do pipeline de eventos reais estar completo com dado novo
e confiável daqui pra frente. `operator_id_aliases` foi mantida (não é
dado do pipeline, é configuração).

**Fix aplicado em 2026-08-18 (mesmo dia) — corte de posse na resolução
implementado:** criada `crisp_conversation_state_history` (`session_id`,
`state`, `event_at`), populada pelo n8n a cada `session:set_state` (branch
Set_state ganhou um `HTTP Request14` em paralelo ao `HTTP Request4`
existente, gravando o evento cru — mesmo padrão do `HTTP Request13` que já
gravava roteamento). `relogio_posse_periodo()` foi reescrita de novo,
agora em 3 níveis:
- **Tier A** (melhor, quando a sessão tem roteamento E histórico de estado
  reais): cruza as duas linhas do tempo — em cada intervalo entre
  eventos, sabe quem tava atribuído e se a conversa tava resolvida nesse
  instante, via subquery correlacionada buscando o último valor de cada
  tipo até aquele ponto (Postgres não suporta `IGNORE NULLS` em funções de
  janela, por isso não deu pra usar `last_value` direto). Só soma posse
  nos trechos em que o estado vigente **não** é `resolved` (nulo antes do
  1º evento de estado é tratado como "não resolvido", já que toda conversa
  nasce pending/aberta).
- **Tier B**: sessão tem roteamento mas ainda não tem nenhum evento de
  estado capturado (dado anterior a essa mudança) — mantém o
  comportamento anterior (sem cortar por resolução).
- **Tier C**: sessão sem nenhum evento de roteamento — aproximação por
  mensagem de sempre, restrita a resolvidas.

Validado com o mesmo chamado de teste: dois trechos marcados como
`resolved` (14 e ~100+ segundos, um deles ainda crescendo por estar
resolvido no momento do teste) ficaram corretamente de fora da posse do
Eduardo, enquanto um trecho de ~86min genuinamente `pending` (aberto, sem
retomada) continuou contando normalmente — confirma que o corte é por
estado real, não por tempo parado em geral.

**Fix aplicado em 2026-08-18 (mais tarde) — `relogio_espera_cliente()`
ganhou o mesmo tratamento por evento que a posse:** mesma estrutura em 2
níveis — Tier A (sessão com `crisp_conversation_state_history` real) já
não exige mais `status = 'resolved'` pra contar espera, e corta cada gap
de espera na 1ª resolução real que acontecer dentro dele (em vez de só
aceitar ou rejeitar o gap inteiro); Tier B (sem histórico de estado ainda)
mantém o comportamento antigo. Efeito prático validado: amostras do dia
foram de 7 pra 11 janelas de espera — passou a contar chamados ainda
abertos/pendentes, que antes ficavam de fora só por não estarem
resolvidos ainda.

**Reorganização em 2026-08-18 — Performance virou Overview, Analytics
ficou leve:** por pedido explícito do usuário, Analytics (`/analytics`)
passou a ser o painel leve pra qualquer colaborador (indicadores básicos,
evolução, distribuição por canal/status/tópico, ranking de operadores) —
todo o conteúdo pesado que tinha sido adicionado ali na Fase 1 (Velocidade
com percentis TFR/TTR, Backlog por idade, Relógios do atendimento, QA)
foi movido pra `/performance`, renomeada de "Performance" pra **"Overview"**
(título, sidebar, busca global, `public.modules.nome` — rota e slug
técnico continuam `/performance`/`performance` por decisão consciente,
só o nome de exibição mudou). Overview é agora a página principal pro
admin bater o olho e entender como o time está — a sub-aba "Ranking" virou
"Dashboard" e concentra tudo isso mais o ranking de atendentes; a aba
"Atendimentos" ficou só com a lista crua de chamados (filtros + tabela),
sem os blocos agregados.

Nessa mesma leva: card "Destaque em volume" e lista "Conversas com nota
baixa" foram removidos do Dashboard, substituídos por 3 cards de
distribuição de nota (`csat_distribuicao_notas()`, boas 4-5/neutras
3/ruins 1-2). Nova seção **"Motivo de contato"** (usa `topico`, ver seção
anterior) ficou como último bloco da aba Dashboard — agrupa por tópico com
volume + TFR/TTR médio via `motivo_contato_resumo()`; ainda fragmentado
(tópico é resumo livre por conversa, não categoria fixa), reavaliar
agrupamento quando tiver mais volume real. Clique num atendente na tabela
de Relógio de posse abre um popup com os chamados dele no período
(reaproveita `fetchAtendimentosComMetricas` filtrado por atendente). Os
cards de Velocidade ganharam um botão "ver mais" com popup explicando
P50/P90/P95/SLA/média. Cores: CSAT médio, SLA cumprido e faixas de backlog
seguem verde/amarelo/vermelho em negrito, mesma lógica de faixa usada no
CSAT (`corPorFaixa`).

**Achado em 2026-08-18 — existem duas "IA Greenn" diferentes no Crisp,
não confundir:** ao investigar por que a posse da "IA Greenn" aparecia
muito alta (150h+), achei que são duas identidades distintas: (1) o
marcador sintético `operator_crisp_id = "ia_greenn"` (string literal,
não é UUID) que o n8n atribui em `Code - Send`/`Code - Received` quando
`data.automated === true` — esse é **excluído de propósito** do cálculo
de posse (`relogio_posse_periodo`) e da 1ª resposta humana, nunca aparece
em `operator_routing_history` porque não é um operador real da Crisp; e
(2) uma **conta de operador de verdade** na Crisp, também chamada "IA
Greenn" (`operator_crisp_id = "b8b993a0-dd61-487a-b89b-7503756d8eb2"`,
e-mail `allan@gdigital.com.br`, role `owner`), que recebe roteamento real
(`session:set_routing`) e portanto conta normalmente na posse — é essa
conta que gera as 150h+, somando muitas conversas ainda `pending`. Não é
bug de cálculo, é uma segunda identidade real que só coincide no nome de
exibição. **Confirmado pelo usuário em 2026-08-18**: `b8b993a0-...`
(`allan@gdigital.com.br`) é mesmo a conta usada pra criação/configuração
do bot — é o bot legítimo, não confusão de nome. Alias mantido como está.

**Bug crítico corrigido em 2026-08-18 — detecção de bot por
`operator_nome ilike '%IA%'` excluía/incluía gente errada:** ao investigar
por que "Nathalia Cavalcanti" e "Ana Paula Maximiano de Souza" apareciam
com TFR "—" (nenhuma amostra) mesmo tendo respondido chamados de verdade,
achei que o padrão usado em **4 funções** pra identificar bot por nome —
`operator_nome ilike '%IA%'` — também casa com qualquer nome que contenha
"ia" como substring em qualquer posição: "Nathal**ia**", "Max**ia**no"
(dentro de "Maximiano"). Resultado: 32 mensagens reais dessas duas
pessoas eram tratadas como se fossem do bot e excluídas de
`_primeiras_respostas_humanas()` — o que também explicava a inflação de
`tempo_resposta_bot()` (mensagens humanas rápidas sendo contadas como se
fossem do bot) e outros números estranhos: `relogio_espera_cliente()` e
o Tier C de `relogio_posse_periodo()` tinham o mesmo problema.

Verificação com dado real: toda mensagem genuína do bot tem
`operator_nome` exatamente `"Atendente IA Greenn"` (nunca variação) e
`origin` em `urn:crisp.im:bot:0` ou `urn:allan.godoy:greenn:0` (integração
própria do bot, mensagens que não passam pelo canal `crisp.im:bot`
padrão). As 32 mensagens humanas mal-classificadas tinham `origin = "chat"`
e nome exatamente "Nathalia"/"Nathalia Cavalcanti"/"Ana Paula Maximiano de
Souza" — nunca `origin` de bot.

Corrigido nas 4 funções (`_primeiras_respostas_humanas`,
`relogio_espera_cliente`, `relogio_posse_periodo`, `tempo_resposta_bot`)
trocando o padrão solto por um ancorado: `operator_nome ilike 'Atendente
IA%'` (prefixo, não substring solta) **or** `origin ilike '%crisp.im:bot%'`
**or** `origin ilike '%allan.godoy%'`. Como `atendente_performance`,
`tfr_ttr_percentis`, `atendimentos_com_metricas` e `motivo_contato_resumo`
só consomem `_primeiras_respostas_humanas()` (não reimplementam a
detecção), corrigir na fonte já resolveu pra todas — nenhuma delas
precisou de alteração própria. Validado: `tempo_resposta_bot()` caiu de
195,7s de média (com outlier de 4h de uma mensagem tardia da Nathalia) pra
14,7s (mediana real do bot); Nathalia passou a mostrar TFR real (2h14min,
não mais "—").

Nesse mesmo lote: card dedicado "Bot (IA Greenn)" no Overview, separado
da tabela de Ranking humano e do gráfico de posse — ficava estranho
comparar volume/CSAT do bot lado a lado com atendentes reais, e clicar no
card abre o mesmo popup de chamados usado nas linhas de posse.

**Auditoria em 2026-08-18 — TFR do Meu Painel divergia do Overview:**
usuário notou que "tempo de primeira resposta" no Meu Painel batia
diferente do Ranking no Overview. Causa: `minhas_conversas_metricas()`
(usada só pelo Meu Painel) calculava `tempo_primeira_resposta_seg` a
partir de `primeira_resposta_humana_at` **sem checar se o usuário logado
foi de fato quem respondeu primeiro** — só filtrava "conversas onde eu
sou o operador atual" e pegava o tempo de resposta bruto da conversa,
igual o bug já corrigido em `atendente_performance()` mais cedo, só que
essa função irmã nunca recebeu a mesma correção. Confirmado com dado
real: 2 de 11 chamados do Eduardo tinham resposta de fato da Ana/Vittor,
inflando a média (9,7min vs 8,4min real). Corrigido: agora só conta
`tempo_primeira_resposta_seg` quando
`nome_canonico_por_operator_id(primeiro_atendente_humano_crisp_id,
primeiro_atendente_humano)` bate com o nome do usuário logado — mesmo
critério do Overview. Também trocado o filtro de "minhas conversas"
(que usava `ilike` solto comparando `users.nome` com `operator_nome`
cru) pelo mesmo `nome_canonico_por_operator_id()` canônico usado em toda
parte, em vez de substring frágil.

Varredura no banco por padrões parecidos (feita na mesma auditoria):
- Nenhuma outra função ainda tinha o bug de detecção de bot por
  substring solto (`ilike '%IA%'`/`'%bot%'`) — as 4 corrigidas mais cedo
  continuam sendo as únicas com esse padrão, já usando o ancorado.
- `atendimentos_com_metricas()` já filtra atendente por
  `nome_canonico_por_operator_id()` (canônico) — sem problema.
- `horario_por_nome(p_nome)` é **código morto**: usa o mesmo padrão de
  `ilike` solto pra achar usuário por nome, mas nada mais no banco chama
  essa função desde o fix arquitetural de 2026-08-16 (documentado acima
  nesta seção) — inofensiva, mas candidata a limpeza futura.
- CSAT (`atendente_aliases`, chaveado por e-mail via
  `normalizar_email_atendente`/`normalizar_nome_atendente`) usa um
  mecanismo de identidade **intencionalmente separado** de
  `operator_id_aliases`/`nome_canonico_por_operator_id` (chaveado por
  `operator_crisp_id`, usado em tudo que vem de `crisp_conversations`) —
  isso é a decisão arquitetural já documentada (seção 21: CSAT e
  conversas são fontes de verdade diferentes, ligadas por e-mail, nunca
  por id). Não é bug, mas vale lembrar que são dois sistemas de
  reconciliação de nome paralelos — uma mudança de alias num não reflete
  automaticamente no outro.

**Feature nova em 2026-08-18 — pop-up de detalhe em dado truncado (CSAT):**
por pedido do usuário ("onde os dados não ficam completos como o
comentário nessa aba"), criado `src/components/CsatDetalheDialog.tsx`
(compartilhado): mostra todos os campos de uma avaliação de CSAT sem
cortar (cliente, telefone, e-mail, tags, comentário inteiro, link do
chamado), acionado clicando na linha da tabela — aplicado em CSAT →
Planilha e em Meu Painel (histórico pessoal de avaliações), único lugar
onde o padrão fazia sentido depois de varrer a plataforma por
`truncate`/`title=` cortado. Nesse mesmo lote, o gráfico "CSAT por
colaborador" (Csat.tsx) ganhou quantidade de avaliações e média por
atendente, e o helper `nomesCurtosDisambiguados()` (desambigua nomes
duplicados tipo as duas "Ana" com inicial do sobrenome) saiu de dentro de
`Performance.tsx` pra `src/lib/utils.ts`, compartilhado entre Overview e
CSAT.

**Fix aplicado em 2026-08-18 (mais tarde) — campos vazios do CSAT
apareciam em branco em vez de "—":** usuário notou "E-mail do cliente" e
"Telefone" sem o placeholder padrão no popup novo. Causa: o n8n grava
string vazia (`''`) em campos sem dado, não `null` — e o componente usava
`?? "—"` (só cobre `null`/`undefined`, não string vazia). Confirmado no
banco: 2 registros com `email = ''`, 13 com `telefone = ''`, 15 com
`numero_whatsapp = ''`, de 20 totais — não é exclusivo de um registro.
Corrigido trocando `??` por `||` nesses dois campos em
`CsatDetalheDialog.tsx`. Os campos "Tempo até 1ª resposta"/"Tempo até
encerramento" continuam mostrando "—" corretamente — isso não é bug (ver
seção 7/8: `tempo_primeira_resposta_seg`/`tempo_encerramento_seg` nunca
são preenchidos pelo n8n pro CSAT, e `crisp_id`/`conversation_id` — o
vínculo que permitiria buscar o tempo em `crisp_conversations` — está
100% nulo). Investigado se dava pra recuperar por aproximação (atendente +
horário próximo): não há nenhuma `crisp_conversations` correspondente
nem no dia inteiro pro caso investigado, e mesmo quando houvesse seria
arriscado — `csat_results.data_hora` é o momento em que o **cliente
respondeu a pesquisa**, não o do atendimento, podem ser horas de
diferença.

**Achado na mesma auditoria — `crisp_conversations.operator_email` está
sempre `NULL` no dado atual (268/268 linhas), apesar de seções deste
documento (7, 8, 10) descreverem esse campo como "vínculo confiável" —
essa descrição ficou desatualizada** desde que a reconciliação migrou pra
`operator_crisp_id`/`operator_id_aliases` (fix de 2026-08-17, ver acima
nesta seção). Nenhuma função SQL em uso depende de `operator_email` hoje
(`atendente_performance`/`minhas_conversas_metricas` já usam
`nome_canonico_por_operator_id()`); o único lugar do frontend que ainda
filtra por ele é `fetchConversasFiltered()`
(`src/services/api.ts:1087`, `query.eq("operator_email", atendenteEmail)`)
— mas essa função **não é chamada por nenhuma página** (código morto,
mesma categoria de `horario_por_nome`), então o filtro quebrado nunca
chegou a afetar usuário real. Continua valendo por e-mail apenas pro CSAT
(`csat_results.email_atendente`, mecanismo separado, confirmado populado).
Não corrigido agora por não ter impacto ativo; candidato à mesma limpeza
futura de `horario_por_nome`.

**Fix aplicado em 2026-08-18 (mais tarde) — TFR do Meu Painel unificado
com o de Overview:** usuário questionou por que "tempo de primeira
resposta" deveria variar por tela ("o tempo de primeira resposta sempre
vai ser padrão") depois da auditoria acima — no dado real do período
01/08–18/08, Overview mostrava 16,7min pro Eduardo (base: 15 conversas
onde ele foi quem respondeu primeiro, não importa quem ficou com a
conversa depois) enquanto Meu Painel mostrava 20,9min (base: 11
conversas, a interseção entre "está comigo agora" e "fui eu quem
respondeu"). As duas contas estavam corretas pro que cada uma calculava,
mas representavam populações diferentes sob o mesmo nome de métrica.
Decisão: TFR passa a ser sempre o critério de Overview (quem de fato deu
a 1ª resposta, independente de posse atual) em toda a plataforma;
"Total de chamados"/"Tempo de resolução" continuam baseados na carteira
atual (mesmo critério das colunas irmãs em `atendente_performance`).
`minhas_conversas_metricas()` foi reescrita: em vez de filtrar a base só
por "conversa está comigo agora", passou a incluir também conversas onde
fui eu quem respondeu primeiro mas que já foram repassadas — cada linha
ganhou uma flag `minha_carteira` (true = posse atual) pro frontend separar
o que conta pra "Total de chamados"/"Tempo de resolução" (`filter(c =>
c.minha_carteira)`) do que conta pra "Tempo de primeira resposta" (lista
inteira, sem esse filtro). Validado: Meu Painel do Eduardo passou a
mostrar 16min 43s (bate com Overview) mantendo "Total de chamados: 13"
intocado.

**Decisão de produto em 2026-08-18 — removidas as telas Administração →
Aliases de Atendente e Administração → Módulos:** por pedido do usuário
("se não tiver migration ou SLA não vai funcionar pra nada"). Raciocínio:
sem migrations versionadas neste repo, essas telas de CRUD davam a
impressão de "configuração self-service seguro", quando na prática (a)
criar um módulo novo pela UI não produz uma funcionalidade real sozinho —
ainda precisa de página/rota/código feito por um dev, então o formulário
podia enganar um admin achando que "criar módulo" cria uma feature; e
(b) mudanças nessas tabelas não passam por nenhum processo de revisão
(SLA) como o resto do schema, que já é aplicado direto no Supabase sem
migration mesmo, mas pelo menos as telas de dado de negócio (cursos,
anúncios etc.) não implicam alterar comportamento estrutural da
plataforma. Removido: `src/pages/admin/AdminAtendenteAliases.tsx`,
`src/pages/admin/AdminModulos.tsx`, rotas `/admin/aliases`/`/admin/modulos`
em `App.tsx`, abas em `AdminLayout.tsx`, card "Módulos" em
`AdminOverview.tsx`, e as funções `upsertAtendenteAlias`/
`deleteAtendenteAlias`/`upsertModule`/`deleteModule` de `api.ts` (só eram
usadas por essas telas). **Mantido**: `fetchAtendenteAliases()` (ainda
usada pelo dashboard de CSAT pra reconciliar e-mail) e `fetchModules()`
(ainda usada por Administração → Permissões). Editar aliases/módulos daqui
pra frente é via SQL direto no Supabase, igual o resto do schema.

**Feature nova em 2026-08-18 — botão "Novo curso" direto em Cursos e
upload de ícone em Outros Links:** `src/pages/Cursos.tsx` ganhou um botão
"Novo curso" (visível só pra `isAdmin`) que abre o mesmo formulário de
`AdminCursos.tsx` sem sair da tela; pra admin, a lista passou a usar
`fetchAllCourses()` (inclui rascunho, com badge "Rascunho") em vez de
`fetchCourses()` (só publicado), senão um curso recém-criado como
rascunho sumiria da própria tela de quem acabou de criar. Também
adicionado upload de ícone (não só do banner) em Outros Links: nova coluna
`tools.icone_url` (aplicada direto no Supabase, sem migration), toggle
"Biblioteca"/"Upload" no formulário de `AdminOutrosLinks.tsx` (mesmo
padrão UX do toggle URL/Upload que já existia pro banner, reaproveitando
`uploadToolImage()`/bucket `tool-images`) — quando `icone_url` está
preenchido, ele tem prioridade sobre o nome do ícone lucide-react
(`icone`) em todo lugar que renderiza o ícone do link (`OutrosLinks.tsx`,
tabela de `AdminOutrosLinks.tsx`).

**Feature nova em 2026-08-19 — gráficos "escadinha" (barra horizontal) pra
rótulo de tamanho variável:** usuário notou que os gráficos de barra
vertical ficavam "tortos" quando os rótulos (nomes de pessoas, tópicos)
tinham tamanhos bem diferentes — o rótulo quebra linha só naquela coluna
estreita (~36px), empurrando aquela barra pra uma altura visual diferente
das vizinhas. Adicionado `HorizontalBarChart` em
`src/components/ui/BarChart.tsx` — cada linha tem sua própria altura fixa
(rótulo à esquerda com `truncate`+`title` pro nome completo no hover,
barra horizontal preenchendo proporcionalmente, valor à direita), imune a
esse problema porque rótulos não competem por altura entre si. Aplicado
em "CSAT por colaborador" (Csat.tsx), "Volume de atendimentos por
pessoa", "Posse por atendente humano" e "Top 8 tópicos por volume"
(Performance.tsx) — todos ordenados por valor decrescente pra dar o
efeito de escada. O `BarChart` vertical original continua em uso pra
séries temporais (evolução por dia/mês), onde os rótulos (datas) já têm
tamanho uniforme e o problema não existe.

**Fix aplicado em 2026-08-19 — card "Relógio do cliente" não mostrava
nenhum número:** só tinha um texto explicando que o valor era "o mesmo
TTR de Velocidade", sem de fato exibir o valor — parecia um card quebrado
do lado dos outros dois (Espera do cliente, Trabalho ativo) que mostram
número real. `percentis.ttr_media` já estava carregado na página (usado
em Velocidade) — só precisava ser renderizado aqui também. "Relógio de
trabalho ativo" continua genuinamente sem dado (limitação permanente da
API do Crisp, não expõe status ativo/ausente do operador) — mantido como
está, é a informação honesta, não um placeholder esquecido.

**Feature nova em 2026-08-19 — toggle Horas úteis/Horas corridas no
Overview, e filtro de canal/status removido do Dashboard:** por pedido
explícito do usuário. Criado `public.minutos_entre(inicio, fim, p_modo)`
— substituto de `minutos_uteis_entre_time()` que aceita `p_modo =
'corridas'` pra retornar tempo de relógio cru
(`extract(epoch from (fim-inicio))/60`) em vez de descontar expediente.
Aplicado (parâmetro novo `p_modo_tempo text default 'uteis'`, mesma
assinatura old-behavior por padrão) nas 4 únicas funções que usavam
`minutos_uteis_entre_time`: `tfr_ttr_percentis`, `atendente_performance`,
`atendimentos_com_metricas`, `motivo_contato_resumo`. **Posse
(`relogio_posse_periodo`) e Espera do cliente (`relogio_espera_cliente`)
ficaram de fora de propósito** — já usam `extract(epoch from (...))`
puro, nunca descontaram expediente, porque tempo de espera/posse real do
cliente não faz sentido "ficar mais curto" só porque caiu fora do
horário comercial. Cada `CREATE OR REPLACE FUNCTION` com parâmetro novo
no fim criou uma sobrecarga extra em vez de substituir a antiga (mesmo
problema de sempre — Postgres identifica função por nome+tipos, ver seção
10) — as 4 assinaturas antigas foram derrubadas explicitamente com `DROP
FUNCTION` logo em seguida, confirmado 1 versão de cada no fim.

Na mesma leva, a Card com filtro de canal/status que aparecia só na aba
Dashboard foi removida (usuário: "esses filtros em cima" — decisão
confirmada via pergunta direta, escopo do toggle = página inteira,
filtro removido = só o do Dashboard). Estado `status` foi eliminado por
completo (só existia pra esse filtro). `canal` continua existindo, mas
agora é exclusivo da aba Atendimentos (seu próprio seletor + a lista de
chamados) — as 9 queries do Dashboard (percentis, backlog, posse, espera,
motivos, csatDist, contagem, tempoRespostaBot, ranking) pararam de
receber `canal`, sempre mostram o agregado de todos os canais. O toggle
em si fica visível perto do seletor Dashboard/Atendimentos, com um texto
pequeno abaixo explicando o modo ativo; persistido via `usePersistedState`
como o resto dos filtros da página. Validado com dado real: uma linha na
aba Atendimentos foi de "0s" (fora do expediente de todo mundo) pra
"8min 19s" (tempo de relógio cru) ao trocar o modo; TFR médio de Vittor
no Ranking foi de 4min 6s (útil) pra 3h 21min 12s (corrida) e voltou.

**Feature nova em 2026-08-19 — popup de detalhe nos atendimentos:**
mesmo padrão do `CsatDetalheDialog` (ver acima), agora pra chamados —
`src/components/AtendimentoDetalheDialog.tsx`, acionado clicando numa
linha da tabela (aba Atendimentos e também no popup "Chamados de
{atendente}" aberto a partir da Posse no Dashboard, mesmo estado
`detalhe` compartilhado — os dois pontos de clique ficam em ramos
mutuamente exclusivos do JSX, nunca montam os dois ao mesmo tempo).
Mostra cliente/atendente completos (sem truncar), canal, tipo de
cliente, todos os timestamps (início/1ª resposta/resolução), os 3 tempos
calculados (1ª resposta, resolução, 1ª resposta geral com bot) e aviso de
dado inválido quando aplicável. O botão "Ver chamado" ganhou
`stopPropagation` nos dois lugares pra não abrir o popup de detalhe ao
mesmo tempo que navega pro link externo.

**Removido em 2026-08-19 — seção "Qualidade (QA)" tirada do Dashboard do
Overview, por enquanto:** pedido direto do usuário. Era só o placeholder
honesto adicionado em 2026-08-18 (nunca teve dado real — a estrutura de
critérios com pesos precisa de tabela nova e processo de avaliação
definidos antes de fazer sentido mostrar algo aqui). Nenhuma tabela ou
função SQL foi criada pra isso ainda, então não há nada pra reverter no
banco — só a `<div>` da seção e o import não usado de `Star`
(`lucide-react`) foram removidos de `Performance.tsx`. Reavaliar quando
existir um processo real de avaliação de qualidade.

**Auditoria em 2026-08-19 — documento externo de spec de métricas cruzado
com a plataforma real:** usuário trouxe um PDF ("Prompt — Implementação de
métricas de atendimento no Hub SAC") com 22 itens de requisito. Cruzei
cada um com o schema/código atual antes de mexer em qualquer coisa (regra
explícita do próprio documento). Achado principal: os campos que o doc
pede pra reaproveitar (`first_response_at`, `first_human_response_at`,
`first_human_response_time`, `first_human_operator_crisp_id`,
`first_human_operator_nome`, `reopened_count`) **já existem com esses
nomes exatos** em `crisp_conversations` — TFR/TTR/SLA/Backlog/Relógios já
cobriam a maior parte do doc. Ficou faltando por completo: FCR, Recontato,
Reabertura (dado existia, zero UI), Transferências (dado bruto existia via
`operator_routing_history`, zero UI), CES, Produtividade, reorganização do
Analytics em blocos. Implementado nesta sessão, em ordem de urgência
(dado pronto → dado que precisa virar UI → o que falta decisão de escopo):

- **Reabertura**: `reabertura_resumo()`/`reabertura_casos()` (novas) — taxa
  (reabertos/resolvidos), quantidade de chamados reabertos vs. total de
  eventos (um chamado pode reabrir mais de uma vez — 20 chamados reabriram
  gerando 26 eventos no dado real da época), principais motivos (`topico`),
  por atendente, tabela de casos com link pro chamado. Nova seção
  "Reabertura" no Dashboard do Overview, entre Backlog e Relógios.
- **TTR: 1ª resolução vs. resolução final**: confirmado no banco que
  `marcar_conversa_resolvida()` já grava `resolved_at = now()` (sempre
  sobrescrito — resolução mais recente) e `first_resolved_at =
  coalesce(first_resolved_at, now())` (setado uma vez só) — os dois
  conceitos já existiam certos no schema, só `first_resolved_at` nunca
  era lido por nenhuma função. `tfr_ttr_percentis()` ganhou
  `ttr_primeira_resolucao_amostras`/`ttr_primeira_resolucao_media`,
  mostrado como linha extra no card de TTR em Velocidade.
- **Relógio de trabalho ativo**: deixou de ser "Sem dado" — usa
  `minutos_uteis_entre_time(inicio, fim)` direto (mesma função que já
  desconta expediente em TFR/TTR, só que aplicada ao período inteiro, não
  a um chamado). Mostra "horas de expediente cadastrado (cobertura)", com
  aviso explícito de que é capacidade nominal, não presença real (Crisp
  não expõe isso). **Não** foi adicionada uma razão posse÷cobertura como
  cogitado a princípio — os dois números não são comparáveis (posse é
  somado por pessoa, cobertura é união do time no tempo, não soma), a
  razão dava >100% sempre que mais de 1 pessoa estava de plantão ao mesmo
  tempo — descartado por estar matematicamente errado, não por escolha de
  design.
- **Transferências**: `transferencias_resumo()`/`transferencias_casos()`
  (novas), lendo `operator_routing_history` (mesma tabela já usada pra
  posse). Só conta handoff entre dois atendentes **humanos de verdade**
  — exclui o marcador sintético do bot (`ia_greenn`) e a conta real "IA
  Greenn"/`b8b993a0-...` (passar do bot pro humano é fluxo normal, não
  fricção operacional). Taxa, quantidade de chamados transferidos vs.
  eventos, tempo médio até transferir, origem/destino, tabela de casos.
  **Motivo da transferência não está disponível** — Crisp não envia essa
  informação, documentado explicitamente na tela em vez de fabricar.
- **Filtro de Motivo**: campo de texto com `datalist` (não dropdown fixo —
  `topico` é texto livre da Crisp, ~300+ valores distintos, um select
  ficaria inutilizável) na aba Atendimentos, reaproveitando os tópicos já
  carregados por `motivo_contato_resumo()` sem query nova. Parâmetro
  `p_motivo` novo em `atendimentos_com_metricas` (`ilike` parcial).

Todas as 4 funções que ganharam parâmetro novo (`tfr_ttr_percentis`,
`atendimentos_com_metricas`) tiveram a assinatura antiga derrubada com
`DROP FUNCTION` explícito logo depois do `CREATE OR REPLACE`, mesmo
problema de sobrecarga-fantasma de sempre (ver seção 10) — confirmado 1
versão de cada no fim.

**Itens do mesmo documento que ficaram pra trás, cada um por um motivo
específico (não esquecimento):**
- **FCR e Recontato**: dependem de definir "mesmo motivo" — `topico` é
  texto livre classificado pela própria Crisp, não uma categoria fixa
  reutilizável (mesma limitação já documentada na seção "Motivo de
  contato"), então "o cliente voltou pelo mesmo motivo" não tem uma
  comparação óbvia e segura sem decisão explícita de critério (match
  exato de texto? similaridade? janela de dias?). Recontato também
  dependeria de `people_id` (existe em `crisp_conversations`, nunca usado)
  pra identificar o mesmo cliente entre conversas diferentes. **Resolvido
  no mesmo dia — ver entrada abaixo.**
- **CES**: não existe nenhum dado de esforço do cliente hoje, em nenhuma
  tabela — exigiria uma pergunta nova na pesquisa de satisfação (mudança
  no lado Crisp/n8n, fora do escopo de frontend/SQL). Não fabricado.
- **SLA por canal/prioridade/motivo com UI própria**: `sla_config` já tem
  as colunas certas, mas só a regra global é usada — bloqueado na prática
  porque `crisp_conversations` não tem campo de **prioridade** próprio
  (só existe em `sla_config`, como parte da regra, não do chamado), então
  não daria pra aplicar mesmo com a UI pronta.
- **Produtividade, Performance individual expandida, Analytics em
  blocos**: dependiam de Reabertura/Transferências existirem primeiro
  (agora existem) — ainda não implementados, ficam pra próxima leva.

**Feature nova em 2026-08-19 (mesmo dia, mais tarde) — FCR e Recontato
implementados:** as duas dependiam da mesma decisão (o que conta como
"mesmo motivo") — confirmada com o usuário: **texto de `topico` idêntico**
(não similaridade/agrupamento) e **janela de 7 dias**. `fcr_recontato_resumo()`/
`recontato_casos()` (novas): "elegível" = chamado resolvido no período, com
`people_id` e `topico` preenchidos (sem os dois não dá pra saber se o
mesmo cliente voltou pelo mesmo motivo — checado antes: 326/453 têm
`people_id`, 355/453 têm `topico`, 13-16 elegíveis no dado real da época,
volume pequeno mas real). FCR = elegíveis sem retorno pelo mesmo motivo em
7 dias; Recontato = o complemento exato do mesmo cálculo (mesmo
denominador, faces opostas do mesmo sinal — por isso as duas saem da
mesma função). Nova seção "FCR e Recontato" no Dashboard, entre
Transferências e Relógios. Explicitamente **separado de Reabertura**
(mesmo texto do doc): reabertura é o cliente voltando na *mesma* conversa
depois de resolvida; recontato é abrir uma conversa *nova* pelo mesmo
motivo — não se sobrepõem na consulta (`outro.crisp_id <> e.crisp_id`).

**Feature nova em 2026-08-19 (mesmo dia, mais tarde) — Performance
individual no Meu Painel:** SLA/FCR/Reabertura/Transferências pessoais
via as mesmas funções do Overview, com `p_atendente_nome` novo em
`reabertura_resumo()`/`transferencias_resumo()`/`fcr_recontato_resumo()`
(`tfr_ttr_percentis()` já tinha). Para Transferências pessoal, decisão
consciente: **não mostrar a taxa%**, só a contagem bruta
(`total_eventos`) — o filtro por atendente muda o significado do
denominador (`total_atendidos` passa a ser "chamados que estão comigo
agora", enquanto o numerador de transferência filtra por "quem
originou", populações diferentes), então uma taxa aqui seria enganosa;
melhor mostrar só o número certo do que uma % com semântica quebrada.
Produtividade pessoal (atendimentos/hora) usa a posse já buscada via
`fetchRelogioPosse()`, sem RPC nova. Adicionado `MINIMO_AMOSTRAS_CSAT = 5`
— abaixo disso, o texto do card avisa que a amostra é pequena, em vez de
só mostrar o percentual pelado.

**Auditoria em 2026-08-19 (mesmo dia, a pedido do usuário) — varredura
completa por toggle/filtro não respeitado + achados no banco:**

1. **Bug real encontrado e corrigido**: `transferencias_resumo()` e
   `transferencias_casos()` nunca respeitavam o toggle Horas úteis/Horas
   corridas — sempre calculavam `event_at - current_started_at` em tempo
   de relógio cru, mesmo com "Horas úteis" selecionado (diferente de
   TFR/TTR/Reabertura/Ranking, que já respeitavam desde que o toggle foi
   criado). Motivo do usuário notar: comparou o card "Tempo médio até
   transferir" com o resto da tela e o número não batia com a promessa
   ("tempo já desconta fora de expediente"). Corrigido com
   `p_modo_tempo`/`minutos_entre()`, igual às outras 4 funções — as duas
   tiveram a assinatura antiga derrubada (mesmo padrão de sobrecarga
   fantasma). Validado com dado real do dia: "hoje" foi de 1h 6min
   (corrida, cálculo cru) pra 13min (útil, descontando fora de
   expediente) — diferença grande porque boa parte das transferências do
   dia caiu fora do expediente cadastrado.
2. **Verificação de que os outros 6 pontos que usam o toggle passam o
   parâmetro certo**: `tfr_ttr_percentis`, `atendente_performance`,
   `atendimentos_com_metricas` (× 2 call sites), `motivo_contato_resumo`
   — todos conferidos um a um no código, todos corretos.
3. **Achado sem impacto atual, corrigido por consistência**: o bot (IA
   Greenn) não era explicitamente excluído da divisão "por atendente" de
   Reabertura no frontend (só era excluído nas contagens agregadas de
   Ranking/Volume/Posse, que já tinham esse filtro desde antes). Hoje
   isso não muda nenhum número visível — o único chamado reaberto que o
   bot possuía não está resolvido ainda, então já ficava fora do cálculo
   por outro motivo — mas era uma inconsistência latente. Corrigido nos
   dois `useMemo` (`reaberturaPorAtendenteMap`/`reaberturaPorAtendente`)
   pra ficar igual ao resto da plataforma.
4. **Decisão de design confirmada, não é bug**: FCR/Recontato **não**
   filtram por identidade do atendente — um chamado resolvido pelo bot
   entra no cálculo normalmente (achado real no banco: 1 conversa
   resolvida pela "Atendente IA Greenn" está nos elegíveis). Isso é
   proposital — FCR mede "o problema do cliente ficou resolvido sem
   voltar", não "um humano específico resolveu bem"; do ponto de vista do
   cliente, resolução pelo bot conta igual. Documentado aqui pra não
   parecer esquecimento numa auditoria futura.
5. **Achado — código morto pré-existente, não criado nesta sessão**:
   `duracao_dentro_expediente()` tem 2 sobrecargas no banco (assinaturas
   com 4 e 6 parâmetros), nenhuma delas chamada por qualquer outra função
   SQL nem pelo frontend — parece ter sido uma versão anterior da lógica
   que hoje vive em `minutos_uteis_entre_time()`. Mesma categoria de
   `horario_por_nome` (seção 10): inofensivo, candidato à mesma limpeza
   futura, não removido agora por não ter sido pedido.
6. **Confirmado**: nenhum outro função no banco usa mais o padrão antigo
   de detecção de bot por substring solto (`ilike '%IA%'`/`'%bot%'`) —
   as 6 funções novas desta sessão (`reabertura_*`, `transferencias_*`,
   `fcr_recontato_resumo`) usam exclusão por ID (`ia_greenn`,
   `b8b993a0-...`) ou simplesmente não precisam excluir bot (FCR, por
   decisão documentada no item 4 acima).
7. **Bug real encontrado e corrigido — filtro "Tipo de cliente" zerava
   sempre pro único valor que tem dado real**: `fetchDistinctTiposCliente()`
   devolvia uma lista fixa de 6 opções no frontend (Final/Consumidor/
   Seller/Produtor/SDR/Bluee), nunca consultada do banco. Conferido com
   dado real: `crisp_conversations.tipo_cliente` só tem **um** valor
   populado hoje — `"Produtor"` (100 de 464 linhas; as outras 364 são
   `NULL`; nenhuma das 5 tags restantes aparece nem uma vez). Pior: a
   opção hardcoded pra "Produtor" apontava `tag: "vendedor"` — o filtro
   fazia `ilike '%vendedor%'`, que **nunca** batia com o valor real
   `"Produtor"`, então selecionar a única opção com dado de verdade
   sempre devolvia zero resultados, silenciosamente. Corrigido criando
   `distinct_tipos_cliente()` (separa `tipo_cliente` por vírgula via
   `unnest(string_to_array(...))`, já preparado pro caso de o campo vir a
   ter múltiplas tags por linha no futuro — hoje não tem nenhuma) e
   trocando `fetchDistinctTiposCliente()` pra consultar essa função em vez
   de usar a lista fixa. Validado: dropdown passou a mostrar só "Produtor"
   (a única tag real), e selecioná-lo agora retorna resultados de verdade
   em vez de lista vazia.
8. **Varredura por mais dado hardcoded, a pedido do usuário ("temos mais
   dados hardcoded? precisamos apenas de dados vindos do crisp")**:
   conferidas as 75 funções `fetch*` de `api.ts` uma a uma — as 4
   `fetchDistinct*` (canais, operadores, atendentes, tipos de cliente)
   todas consultam o banco de verdade agora; nenhum arquivo de mock
   sobrou em `src/` (`find -iname "*mock*"` vazio). Achado um **segundo
   bug real, também de dado vs. realidade** nesse processo: `statusTone`/
   `statusLabel` (`Performance.tsx`, `AtendimentoDetalheDialog.tsx`,
   `Analytics.tsx`) mapeavam a chave `"unresolved"`, mas o valor real de
   `crisp_conversations.status` é `"pending"` (conferido no banco: só
   `pending`/`resolved` existem, nunca `unresolved`) — badge de chamado
   pendente caía no fallback e mostrava o texto cru em inglês "pending"
   em cinza neutro, em vez de "Pendente" em âmbar. Bug visível desde
   antes desta sessão (não introduzido agora), só não tinha sido notado.
   Corrigido nos 3 arquivos. `EmRisco.tsx` já usava a chave certa
   (`STATUS_OPTIONS` com `"pending"`), não precisou de fix.
   Opções fixas que **não** são bug (revisadas e descartadas): `CLASSIFICACAO_OPTIONS`
   (Csat.tsx, domínio fixo Promotor/Neutro/Detrator gerado pelo Postgres
   a partir da nota — "Neutro" com 0 linhas hoje é só falta de volume, a
   opção continua válida), `CAMPOS_RR` (ReuniaoResultados.tsx, são campos
   de formulário, não dado do Crisp), `CATEGORIAS`/`ICONES_SUGERIDOS`
   (Outros Links, opções de cadastro administrativo, não dado de
   atendimento). Reclame Aqui/NPS continuam com dado de exemplo
   conhecido e documentado (seção 20) — decisão de escopo já confirmada
   pelo usuário, não uma falha escondida.

**Pendência descoberta em 2026-08-19 — `crisp_conversations.tipo_cliente`
não captura as tags de segmento do Crisp (ex: "consumidor", "ia",
"seller"), diferente de `csat_results.tags_cliente` que já captura
certinho:** usuário reparou no painel do Crisp ("Segmentos da conversa")
tags como "consumidor"/"ia" e perguntou se o Hub tá pegando isso.
Confirmado no banco: `csat_results.tags_cliente` tem exatamente esse
padrão (`"consumidor, ia"` × 2, `"seller, ia"` × 9, combinações mais
ricas como `"adm-site, greenn, adm, seller, ia, consumidor"`) — o n8n já
sabe extrair. Mas `crisp_conversations.tipo_cliente` (a coluna que
alimenta o filtro "Tipo de cliente" em Overview/Atendimentos, ver item 7
desta seção) está quase vazia: 370 de 470 linhas `NULL`, as outras 100
sempre só `"Produtor"` — nunca a riqueza de tags que `tags_cliente` tem.
**Gap real de pipeline, não bug de frontend/SQL**: o node do n8n que
grava `crisp_conversations` não está extraindo `segments`/tags da sessão
Crisp pro `tipo_cliente`, mesmo o node do CSAT já fazendo isso
corretamente pro `tags_cliente`. Não dá pra corrigir daqui — não existe
vínculo confiável entre uma linha de `csat_results` e a
`crisp_conversations` correspondente pra "copiar" retroativamente (mesma
limitação de `crisp_id`/`conversation_id` sempre nulos, seção 8), e
mesmo que desse, só resolveria os 100 registros já existentes, não os
novos. **Mudança de n8n necessária** (fora deste repositório): o node que
grava `crisp_conversations` precisa extrair `segments`/tags da sessão
Crisp pro campo `tipo_cliente`, no mesmo formato lista-separada-por-vírgula
que `tags_cliente` já usa.

**Feature nova em 2026-08-19 (mesmo dia, mais tarde) — cards "Por tipo de
cliente" no Overview:** pedido do usuário logo depois do achado acima
("Produtor: TFR TTR Qntd de chamado" / "Cliente Final: ..."). Construído
de propósito como **lista dinâmica**, não um par fixo Produtor/Cliente
Final — `metricas_por_tipo_cliente()` (nova, mesmo padrão de
`motivo_contato_resumo()`, separando `tipo_cliente` por vírgula via
`unnest(string_to_array(...))`) só devolve o que existir de verdade no
período. Decisão explícita: **não** criar um card fixo pra "Cliente
Final" mostrando "0 chamados" — isso pareceria dado real ("não temos
cliente final") quando na verdade é ausência de captura (achado da seção
10). Validado com dado real: só o card "Produtor" aparece hoje (93
chamados no período testado, TFR/TTR reais); quando o n8n for ajustado
pra capturar as outras tags, novos cards aparecem sozinhos, sem mudança
de código.

**Diagnóstico em 2026-08-19 (mesmo dia) — causa raiz do gap de
`tipo_cliente` encontrada, root cause é um bug de idioma no n8n, não
falta de dado:** usuário compartilhou o JSON do workflow n8n
("Crisp Conversation") e rodou um teste real abrindo um chamado como
"cliente final". A lógica de mapear `segments` → `tipo_cliente` **já
existe** nos nodes `Code - Dados Cliente`/`Code - Dados Cliente1`
(idênticos, um pro fluxo `message:send` outro pro `message:received`):

```js
if (segments.includes("seller")) tipo_cliente = "Produtor";
if (segments.includes("consumer")) tipo_cliente = "Final";  // nunca bate
if (segments.includes("sdr")) tipo_cliente = "SDR";
if (segments.includes("bluee")) tipo_cliente = "Bluee";
```

O teste real mostrou `"meta": { "segments": ["consumidor"] }` — a tag na
Crisp está em **português** ("consumidor"), mas o código confere
`"consumer"` (inglês). `"seller"` bateu certinho (prova: os 100 registros
reais de "Produtor" já existentes), mas `"consumidor"`/"consumer" nunca
bate — por isso só "Produtor" jamais apareceu. **Fix identificado, não
aplicado por mim** (n8n é externo a este repo, sem ferramenta de acesso
nesta sessão): trocar `"consumer"` por `"consumidor"` nos dois nodes.
`"sdr"`/`"bluee"` não foram testados ainda — podem ter o mesmo problema
de idioma, sem confirmação. Usuário optou por conferir e ajustar
diretamente no n8n.

Descartado no mesmo teste — **não é bug**: `people_id` veio ausente
nessa sessão de teste (WhatsApp anônimo, `meta.email` vazio). Confirmado
via doc da Crisp que `people_id` fica no nível raiz de `data`
(exatamente onde o código já lê) — só não existe quando a Crisp ainda
não vinculou um perfil de People à sessão (geralmente depende de
e-mail/merge). 326 de 453 conversas reais (72%) já têm `people_id`
preenchido hoje, então não é um problema sistêmico — só essa sessão de
teste específica não tinha People vinculado.

**Achado grave em 2026-08-19 (mesmo dia) — quase todo o time não tem
conta em `public.users`, então quase ninguém contava pro modelo de
"horas úteis":** investigando por que um chamado real mostrava "7h33min"
de TFR útil (cliente escreveu 23:07, resposta humana só às 15:33 do dia
seguinte), cheguei em `minutos_uteis_entre_time()` — que só enxerga quem
está em `public.users` com `horario_entrada`/`horario_saida`
preenchidos. Antes desse fix, **só Eduardo e Brenda tinham conta** —
Vittor, Ana Paula, Nathalia, Ketlin e Ana Franca aparecem em toda a
plataforma (Ranking, Posse, CSAT) só porque `operator_id_aliases`
reconcilia o nome deles a partir da Crisp, sem precisar de conta no Hub
— mas por isso o horário real deles nunca entrava na união de cobertura,
subestimando "horas úteis" em todo lugar que usa esse cálculo (TFR/TTR/
Reabertura/Transferências).

Usuário tinha outro fluxo n8n (bot de notificação de horário no Google
Chat, lendo uma planilha "Horários" + um hardcode direto no código pra
Ana Franca) e mandou o log de notificações de um dia inteiro, permitindo
reconstruir o horário real de cada um. Aplicado em `public.users`:

| Nome | Entrada | Almoço saída | Almoço volta | Saída | E-mail |
|---|---|---|---|---|---|
| Vittor Fernandes | 07:00 | 10:30 | 11:30 | 16:00 | vittor.lucas@greenn.com.br |
| Eduardo Nicolau (corrigido) | 08:00 | 11:30 | 13:30 | 18:00 | eduardo.nicolau@greenn.com.br |
| Ana Paula Maximiano de Souza | 08:00 | 11:30 | 13:30 | 18:00 | anapaula@greenn.com.br |
| Ana Franca | 09:00 | 12:30 | 14:30 | 19:00 | ana.franca@greenn.com.br |
| Brenda Coutinho (já estava certo) | 10:00 | 14:00 | 16:00 | 20:00 | brenda.meireles@greenn.com.br |

O horário do Eduardo já cadastrado estava **errado** (08–12/13–17, real é
08–11:30/13:30–18) — confirmado com o usuário antes de sobrescrever.
Todas as contas novas foram criadas **sem `auth_id`** (não geram login,
só existem pro modelo de cobertura enxergar o horário — nome/e-mail reais,
`role_id` = Colaborador pra consistência com Brenda). Validado: o chamado
da Stephanie usado como caso de teste foi recalculado de 7h33min para
8h33min de horas úteis, batendo exatamente com a entrada 1h mais cedo do
Vittor (07:00) estendendo a cobertura da manhã.

**Pendências**: faltam e-mails de **Nathalia Cavalcanti** e **Ketlin
Reis** pra completar os cadastros (não achados em nenhuma tabela do
banco — `csat_results.email_atendente` só tinha volume suficiente pra
Ana Franca/Ana Paula/Brenda/Eduardo/Vittor). **Achado paralelo, não
resolvido ainda**: a notificadora de horário também rastreia "Aline", que
o usuário confirmou ser do time de **Reclame Aqui, não SAC/Crisp** —
não foi adicionada ao Hub por decisão consciente. Isso expôs um risco
maior: `minutos_uteis_entre_time()` filtra só `ativo = true`, sem
distinguir equipe/função — se pessoas de outras áreas (Reclame Aqui,
etc.) forem cadastradas no Hub no futuro com horário preenchido, elas
passariam a contar erroneamente na cobertura do SAC. Usuário confirmou
que isso é conhecido e será resolvido depois (não é urgente agora,
porque hoje ninguém fora do SAC tem horário cadastrado) — mas fica
registrado como candidato a um filtro futuro (ex: `equipe = 'SAC'` ou um
flag dedicado) antes que a tabela `users` cresça com gente de outras
áreas.

**Confirmado em 2026-08-24 — fix do n8n "consumer"→"consumidor" já está em
produção:** `crisp_conversations.tipo_cliente` passou a trazer "Final"
junto com "Produtor"/"Bluee"/"SDR" sem nenhuma mudança de código deste
lado — exatamente o comportamento esperado da arquitetura dinâmica
(`distinct_tipos_cliente()`/`metricas_por_tipo_cliente()`, seção 10 acima):
os cards "Por tipo de cliente" no Overview passaram a mostrar 4 segmentos
reais assim que o dado começou a chegar certo, sem precisar de deploy.

**Feature nova em 2026-08-24 — pacote de 4 pedidos no Overview (filtro
consolidado, cor do Backlog, tempo ativo por atendente, backlog
clicável):**

1. **Botão "Filtros" consolidado**: o `SegmentedControl` Horas
   úteis/Horas corridas, antes sempre visível no topo, foi movido para
   dentro de um popover acionado por um botão "Filtros" (`SlidersHorizontal`,
   mesmo padrão visual/estrutural do `DateRangePopover` — backdrop
   `fixed inset-0 z-10` fecha ao clicar fora). Dentro do popover também
   entrou um novo `<select>` "Tipo de cliente" (populado pela mesma query
   `distinct_tipos_cliente()` já usada pelo filtro da aba Atendimentos),
   que passou a filtrar as seções agregadas do Dashboard (ex: cards "Por
   tipo de cliente" mostram só o tipo selecionado, ou todos se "Todos os
   tipos de cliente"). Estado persistido via `usePersistedState`
   (`tipoClienteFiltro`), igual todo outro filtro da página.
2. **Cor branca no gráfico de Backlog corrigida**: a barra "4-7 dias"
   usava `bg-rust-400`, mas a paleta `rust` em `tailwind.config.ts` só
   tinha as shades 50/500/600/700 — `400` (e `100`) compilavam pra
   `rgba(0,0,0,0)` (transparente, aparecia branco sobre o fundo claro do
   card). Confirmado via `getComputedStyle` antes e depois do fix.
   Corrigido na origem (adicionadas as shades `rust-100`/`rust-400`),
   não só no call site reportado — havia mais 4 usos do mesmo problema
   (`border-rust-400` em Performance.tsx/Calendario.tsx, `bg-rust-100`
   em Calendario.tsx) que também foram corrigidos de graça.
3. **Coluna "Tempo ativo" + histórico de atendentes por chamado**: pedido
   do usuário pra distinguir "quem respondeu primeiro" de "quem ficou
   com o chamado depois" sem duplicar o card do atendimento. Nova função
   `atendimento_timeline(p_crisp_id)` — mesma lógica de 3 níveis (Tier
   A/B/C) já usada por `relogio_posse_periodo()`, mas escopada pra UMA
   conversa e retornando cada troca de posse crua (atendente,
   atribuído_em, liberado_em, minutos_posse, ainda_ativo) em vez de um
   agregado. `atendimentos_com_metricas()` ganhou a coluna
   `tempo_ativo_seg`, calculada chamando essa mesma função internamente
   e somando só os trechos do atendente atual da linha — decisão
   deliberada de reusar a função em vez de duplicar a lógica, pra tabela
   e popup nunca poderem divergir. Column nova "Tempo ativo" na aba
   Atendimentos (`xl:table-cell`, mesmo padrão de esconder em telas
   menores que outras colunas secundárias já usam); `AtendimentoDetalheDialog`
   ganhou o campo "Tempo ativo (atendente atual)" e uma nova seção
   "Atendentes que passaram por esse chamado" (lista com
   nome/atribuído-em/liberado-em/duração de cada handoff, buscada via
   `fetchAtendimentoTimeline()`/`useQuery` própria). Validado em
   navegador com um chamado real de 7 atendentes/16 handoffs (Paulo
   Lucena, `session_a2093289-...`): tabela e popup batem entre si e com
   a query SQL bruta.
   **Bug de segurança encontrado e corrigido antes de validar**: a
   primeira versão de `atendimento_timeline()` só checava `is_admin()`
   dentro da CTE auxiliar `conversa` (via subqueries `(select ... from
   conversa)`), mas as CTEs que de fato retornavam dado
   (`timeline_a`/`eventos_b`/`msgs_c`) não dependiam dela — um usuário
   sem ser admin conseguiria chamar a função e receber o histórico de
   roteamento de qualquer conversa. Corrigido adicionando `and
   exists(select 1 from conversa)` em cada CTE de dado real; reverificado
   com chamada SQL direta sem contexto de admin retornando vazio.
4. **Backlog clicável**: os 4 cards de faixa (`0-1`/`2-3`/`4-7`/`+7 dias`)
   ganharam `onClick`/`cursor-pointer` (só quando `total > 0`) abrindo um
   `Dialog` com a lista paginada de chamados daquela faixa
   (Cliente/Atendente/Motivo/Início/Idade/Status/Ação), via nova função
   `backlog_casos(p_faixa, p_canal, p_atendente_nome, p_limit, p_offset)`
   — mesmo padrão de paginação (Anterior/Próxima, `total_count` na linha)
   já usado na aba Atendimentos. `backlog_casos()` foi criada já com
   paginação desde o início; não teve overload-fantasma porque a
   assinatura não mudou depois de criada.

Todas as funções SQL alteradas (`atendimentos_com_metricas`) tiveram a
assinatura antiga confirmadamente derrubada via `DROP FUNCTION` explícito
antes do `CREATE OR REPLACE` com a lista de colunas nova — mesmo problema
de sobrecarga-fantasma de sempre (ver primeira ocorrência documentada
nesta seção, 2026-08-16).

**Mudança de time em 2026-08-24 — Brenda saiu, horários atualizados:**
`public.users.ativo` da Brenda Coutinho foi setado pra `false` (não
deletado — mantém `auth_id`/histórico intactos, só para de contar em
`minutos_uteis_entre_time()`, mesmo padrão de exclusão já usado pra
qualquer colaborador inativo). Horários novos aplicados: Ana Franca
(09h→10h, almoço 12:30–14:30→13:00–15:00, saída 19h→20h). Vittor, Ana
Paula e Eduardo já tinham exatamente os horários novos informados pelo
usuário — nenhuma mudança neles. **Ketlin Reis** ganhou conta (sem login,
mesmo padrão das outras contas só-cobertura) com o e-mail já conhecido de
`csat_results.email_atendente` (`ketlin.reis@greenn.com.br`) e horário
08h–17h (almoço 13:30–14:30). **Pendências**: faltam e-mail completo de
**Nathalia Cavalcanti** (horário 08h–18h, almoço 11:30–13:30, mesmo
bloco de Ana Paula/Eduardo) e **Aline Stocco** (horário 08h–18h, almoço
11:30–13:30 — confirmada via `operator_id_aliases`, nome completo
"Aline Stocco"; note que a seção de horários de 2026-08-19 tinha marcado
Aline como sendo do time de Reclame Aqui e por isso deliberadamente fora
do Hub — o usuário agora pediu horário pra ela, então essa exclusão foi
revertida por decisão explícita, não é um esquecimento) e nome completo +
e-mail de **Amanda** (só aparece como "Amanda" em `crisp_conversations`,
sem sobrenome nem alias cadastrado; horário 09h–19h, almoço 13:00–15:00).

**Bug corrigido em 2026-08-24 — cards "Por tipo de cliente" não eram
clicáveis:** usuário reportou clicar em "Produtor"/"Final" sem o dado da
tela mudar. Investigação em navegador confirmou que o `<select>` "Tipo de
cliente" dentro do popover "Filtros" já funcionava corretamente (testado
via evento nativo, filtra de 4 cards pra 1 e a lista de Atendimentos de
1838 pra 313 chamados) — o problema real é que o usuário esperava poder
clicar diretamente nos cards da seção "Por tipo de cliente" (mesmo padrão
UX recém-criado pros cards de Backlog), e esses cards não tinham
`onClick` nenhum. Corrigido tornando os cards clicáveis: clique seleciona
aquele tipo (`tipoClienteFiltro`, mesmo estado do select), clique de novo
no único card restante limpa o filtro — com destaque visual
(`border-forest-300`/`ring-forest-300`) no card ativo. Validado em
navegador nos dois sentidos (selecionar e limpar).

**Feature nova em 2026-08-24 — popup "Chamados de {atendente}" (inclusive
do bot) ganhou colunas ordenáveis:** pedido do usuário especificamente
pro popup do bot ("Chamados de IA Greenn", aberto clicando no card "Bot
(IA Greenn)" — mesmo popup usado por clique num atendente humano na
tabela de Relógio de posse). Como a função por trás (`fetchAtendimentosComMetricas`)
já aceita `ordenarPor`/`direcao` (mesma função usada pela aba
Atendimentos), só faltava expor isso nesse popup — adicionado estado
`posseDetalheOrdenarPor`/`posseDetalheDirecao` próprio (não compartilha
com o `ordenarPor`/`direcao` da aba Atendimentos, são tabelas
independentes) e trocado os `<th>` de Início/1ª resposta/Resolução por
`SortableHeader`, mesmo componente já usado alhures. Validado: ordenar
"1ª resposta" no popup do bot foi de ordem cronológica pra 35h→21h→12h→7h
(desc), confirmando maior-pro-menor.

**Feature nova em 2026-08-24 — filtros persistidos em mais páginas:**
usuário notou que filtros (a começar por período/data) se perdiam ao
navegar pra fora da tela e voltar, fora do Overview (que já usava
`usePersistedState` desde 2026-08-19). Convertidas pra `usePersistedState`
(chave por página, ex.: `analytics:preset`, `csat:emailAtendente`,
`emRisco:filtros`) em **Analytics** (preset/personalizado/operadorEmail/
canal/estado/granularidade), **CSAT** (aba/preset/personalizado/
emailAtendente/topico/categoriaCliente/nota/classificacaoCsat), **Meu
Painel** (preset/personalizado), **Em Risco** (filtros: canal/atendenteNome/
status) e **Reclame Aqui** (aba/statusFiltro/responsavelFiltro) e **NPS**
(classificacao). Deliberadamente **não** persistido, mesmo padrão já
usado no Overview: texto de busca (`busca`), paginação (`page`), estado
de ordenação de coluna (`sortBy`/`ordenarPor`/`direcao`) e qualquer
estado de modal/dialog (`dialogAberto`, `editando`, `detalhe`) — esses são
transitórios por natureza, persisti-los criaria comportamento estranho
(ex.: reabrir a tela já com um modal de edição aberto). Validado em
navegador: mudar Analytics pra "Últimos 7 dias", navegar pra Home e
voltar, período continuou "Últimos 7 dias" (confirmado via leitura do
botão de data, não só via `localStorage`).

**Bug de performance grave encontrado e parcialmente corrigido em
2026-08-24 — Ranking do Overview aparecia vazio ("Sem atendimentos") por
timeout, não por falta de feature:** usuário perguntou "cadê o popup do
ranking de atendente" — investigação mostrou que a tabela de Ranking
estava vindo genuinely vazia (não um problema de UI/clique). Causa raiz
encontrada via `postgres_logs` (`canceling statement due to statement
timeout`) e confirmada com `EXPLAIN ANALYZE`:

1. **`relogio_posse_periodo()` — bug O(N²), corrigido:** `timeline_vigente`
   usava duas subqueries correlacionadas (`select ... from timeline t2
   where t2.session_id = t.session_id and t2.event_at <= t.event_at order
   by t2.event_at desc limit 1`) pra achar "o operador/estado vigente até
   este instante" — um forward-fill implementado como auto-join sem
   índice, reescaneando toda a CTE `timeline` **por linha da própria
   `timeline`**. Com o volume real de dado (~5800 eventos de
   roteamento+estado no período de 24 dias testado), isso sozinho levava
   **13,6 segundos** — MUITO acima do `statement_timeout` de 8s do role
   `authenticated` (só o role `service_role`/MCP tem 2min), então a
   função **sempre** dava timeout pra qualquer período com volume real,
   não só sob concorrência. Substituído por forward-fill via window
   function (técnica "gap-and-island": `count(*) filter (where
   tipo='routing') over (partition by session_id order by event_at rows
   between unbounded preceding and current row)` cria um grupo que avança
   a cada novo evento de roteamento; `max(valor) over (partition by
   session_id, grupo)` propaga o valor pra frente dentro do grupo) — de
   O(N²) pra O(N log N). Validado bit-a-bit contra a versão antiga (0
   divergências em 5789 linhas comparadas old vs. new, mesmo período
   real). Resultado: **13,6s → 92ms** (~148x). Mesmo padrão também
   existia em `atendimento_timeline(p_crisp_id)` (a versão por-conversa
   usada no popup de detalhe e chamada por linha dentro de
   `atendimentos_com_metricas` pra `tempo_ativo_seg`) — corrigido também
   por consistência e pra evitar um caso patológico futuro (uma conversa
   com muitos handoffs), mesmo N sendo pequeno o bastante hoje (validado
   contra o caso real de 18 eventos "Paulo Lucena", 0 divergências).
2. **`minutos_uteis_entre_time()` — custo por linha reduzido, não
   eliminado:** a função recalculava a união de horários do time inteiro
   (`generate_series` de dias × `cross join public.users` × `range_agg`)
   **do zero a cada chamada**, e é chamada como função escalar **uma vez
   por linha** em `atendente_performance`, `tfr_ttr_percentis`,
   `atendimentos_com_metricas`, `motivo_contato_resumo`,
   `transferencias_resumo`/`transferencias_casos` (até 3x por linha em
   `tfr_ttr_percentis`, que calcula TFR/TTR/TTR-1ª-resolução). Criada
   `public.cobertura_semanal` (tabela cache, `dow int primary key,
   cobertura int4multirange` — a união de horário do time por dia da
   semana, só 6 linhas) + `refresh_cobertura_semanal()` + trigger em
   `public.users` (`trg_users_cobertura_semanal`, dispara em
   insert/update de ativo/horários/delete) pra manter o cache
   atualizado. `minutos_uteis_entre_time` reescrita pra ler desse cache
   em vez de fazer `cross join public.users` toda vez — mesma assinatura,
   nenhuma função chamadora precisou mudar. Validado: 571 pares reais e
   sintéticos (incluindo janelas cruzando fim de semana e semanas
   inteiras) com 0 divergências contra a versão antiga antes de
   substituir. Ganho real: **~24% mais rápido por chamada** (medido com
   dado real variado, não só args repetidos) — ajudou o suficiente pra
   tirar `atendente_performance` da lista de timeouts (confirmado nos
   logs), mas **não o bastante pra `tfr_ttr_percentis`**, que ainda leva
   ~5,5s isolado (3 chamadas de `minutos_entre` por linha × ~1800 linhas)
   — perto demais do limite de 8s pra sobreviver a qualquer concorrência
   real, e no teste em navegador `tfr_ttr_percentis`/`relogio_posse_periodo`
   ainda apareciam juntos nos logs como timeout **de forma consistente**
   a cada reload, não só ocasionalmente — sugerindo que o compute tier
   pequeno deste projeto (documentado como conta Supabase temporária/de
   teste) não aguenta as ~9 queries pesadas do Dashboard disparando juntas
   no volume de dado atual (~1800 conversas no período testado), mesmo
   com esse ganho.

**Não corrigido ainda — pendência real, não concluída nesta sessão:** o
fix completo pra `tfr_ttr_percentis` (e provavelmente
`motivo_contato_resumo`/`transferencias_resumo`/`atendimentos_com_metricas`,
que compartilham o mesmo padrão "`minutos_entre` chamado como função
escalar por linha") exigiria trocar esse padrão por um mais eficiente:
computar a cobertura em **dias** (não em minutos-da-semana) **uma vez por
execução da query** — via uma CTE `dias_periodo` cobrindo só o intervalo
`data_inicio..data_fim` pedido (tipicamente 20-30 linhas) — e cada linha
da tabela principal fazer só uma interseção de multirange contra essa CTE
pequena já materializada, em vez de chamar uma função que recalcula tudo
do zero.

**Implementado ainda em 2026-08-24 (mesma sessão, mais tarde) — usuário
ficou bloqueado de verdade (não conseguia abrir o card do Vittor no
Ranking) usando o filtro "Este ano", o que forçou terminar o fix:**
Aplicado o padrão "CTE `dias_periodo` calculada uma vez por execução,
cada linha só faz interseção de multirange contra ela" em
`tfr_ttr_percentis` e `atendente_performance` (as duas funções que
sobravam na lista de timeout). Cada uma teve as chamadas por linha de
`minutos_entre`/`minutos_uteis_entre_time` substituídas por uma subquery
correlacionada contra `dias_periodo` (só ~25-240 linhas dependendo do
período, nada de `generate_series`/`cross join users`/`range_agg` por
linha da tabela principal). Validado bit-a-bit contra a versão anterior
(0 divergências em 1808/1803 linhas, testado nas janelas de 24 dias e
"Este ano" completo) antes de substituir. Ganho: `tfr_ttr_percentis` foi
de 5,5s pra 286ms na janela de 24 dias (~19x) e ficou em ~1,5s mesmo na
janela de 8 meses ("Este ano", `dias_periodo` bem maior). Motivo/
Transferências/`atendimentos_com_metricas` continuam com o padrão antigo
(mesma categoria de risco, não tocados ainda) — candidatos à mesma
otimização se voltarem a aparecer nos logs de timeout.

**Também aumentado o `statement_timeout` do role `authenticated` de 8s
(padrão Supabase) pra 25s** (`alter role authenticated set
statement_timeout = '25s'`) — confirmado com o usuário antes de aplicar
(é config de recurso do banco inteiro, não só deste código). Mantido em
25s mesmo depois do fix real abaixo, como margem de segurança — mas com
esse fix a query relevante roda em ~300ms, então na prática nem precisaria
de mais que os 8s originais.

**Causa raiz real encontrada (a anterior estava errada) — índice errado
escolhido pelo planner em `crisp_messages`:** logo depois dos fixes acima,
o usuário reportou que "Este ano" continuava com os cards do Ranking sem
abrir. Minha primeira teoria (registrada aqui e depois corrigida) foi que
minhas próprias queries de `EXPLAIN ANALYZE`, rodadas concorrentemente via
MCP no mesmo banco pequeno, estavam causando parte do timeout que eu
tentava diagnosticar — um teste limpo pareceu confirmar isso. **Essa
teoria estava incompleta**: o problema real só apareceu ao chamar a
função pela sessão do próprio navegador (com JWT/RLS reais) em vez de
pela conexão de serviço do MCP (que ignora RLS por completo,
`rolbypassrls`) — todos os meus benchmarks anteriores, sem perceber,
testavam um caminho mais barato que o usuário real nunca usa.
Reproduzindo via `supabase.rpc(...)` direto no console do navegador:
`relogio_posse_periodo` levava **21-24 segundos** (não erro, só lento)
pra retornar 15 linhas corretas.

Isolado com uma função de debug temporária rodando `EXPLAIN (ANALYZE,
BUFFERS)` dentro de uma sessão real (criada e removida na mesma
investigação), o plano mostrou **20,3 milhões de buffer hits** — a causa:
a subquery de fallback de nome usada tanto em `posse_tierA` quanto em
`posse_tierB` (`select operator_nome from crisp_messages where
operator_crisp_id = X order by message_timestamp desc limit 1`) estava
sendo executada **por linha de `intervalos`** (não por grupo final — o
`GROUP BY 1` referencia a própria expressão que contém a subquery, então
o Postgres precisa avaliá-la pra cada linha antes de agrupar), e o
planner escolhia `idx_crisp_messages_timestamp` (índice só em
`message_timestamp`) fazendo **scan reverso filtrando por
`operator_crisp_id`** em vez de usar um índice pelo operador — pra
operadores sem nenhuma mensagem própria (ex: quem só recebeu roteamento,
nunca mandou mensagem), o scan reverso percorria a tabela inteira (15.900
linhas) sem nunca achar match, por chamada, multiplicado por ~3135
chamadas. Corrigido com um índice composto que faltava:

```sql
create index idx_crisp_messages_operator_timestamp
  on public.crisp_messages (operator_crisp_id, message_timestamp desc)
  where operator_nome is not null;
```

Resultado: `relogio_posse_periodo` real (via navegador, RLS real, período
"Este ano" completo) foi de **21-24s para 334ms** (~65x). Validado em
navegador: 12 de 13 atendentes do Ranking clicáveis (o 13º, "Amanda
Felix", tem só 1 atendimento sem histórico de roteamento — não é bug,
é ausência de dado real). Mesmo padrão de fallback por `crisp_messages`
também existe em `atendimento_timeline()` (popup de detalhe de chamado) —
se beneficia do mesmo índice novo automaticamente, sem precisar de
mudança de código lá.

**Lição pra próximas investigações de performance nesta base:**
`EXPLAIN ANALYZE` via a conexão de serviço do MCP **ignora RLS**
(`rolbypassrls = true`), então qualquer função que se comporte diferente
sob RLS real (inclusive por causa de planner picks diferentes, não só
policies custosas) não aparece nesses testes. Pra diagnosticar timeout
que só acontece "pro usuário real", reproduzir via
`supabase.rpc(...)` direto no console do navegador (sessão real, JWT
real) é a única forma confiável — funções de debug temporárias
(`security definer`, dropadas depois) rodando `EXPLAIN ANALYZE` dentro
dessa mesma chamada permitem ver o plano real sem expor isso como API
pública.

**Ajuste de RLS aplicado no caminho (não era a causa raiz aqui, mas é
boa prática confirmada):** como parte da mesma investigação, as policies
de `SELECT` mais caras (`crisp_conversations`, `csat_results`, `users`)
tiveram `is_admin()`/`has_permission()`/`auth.uid()` envolvidos em
`(select ...)` — o padrão oficial de performance de RLS do Supabase, que
força o Postgres a avaliar uma vez só (InitPlan) em vez de por linha.
Nesta base especificamente isso não mudou nada na prática (as funções
`security definer` envolvidas são todas de propriedade do role
`postgres`, que tem `rolbypassrls = true` — RLS nunca chegava a ser
avaliada), mas é a correção certa mesmo assim para qualquer acesso futuro
que não passe por essas funções (ex: se uma tela nova um dia consultar
`crisp_conversations` via `supabase.from(...)` direto). Mantido.

**Índice novo também em `fcr_recontato_resumo`:** achado no mesmo lote —
a subquery `EXISTS` que detecta recontato filtrava
`crisp_conversations` por `people_id`/`topico` sem nenhum índice
composto, forçando seq scan por linha elegível (325 no período "Este
ano" testado). Criado `idx_crisp_conversations_recontato (people_id,
topico, current_started_at) where people_id is not null and topico is
not null` — **527ms → 3,9ms** (~135x), validado com `EXPLAIN ANALYZE`.

**Gap de segurança introduzido por mim, corrigido no mesmo lote:** a
tabela `cobertura_semanal` (cache criado mais cedo nesta sessão, ver
acima) tinha sido criada **sem RLS habilitado** — passou despercebido até
rodar `get_advisors(type: security)` de checagem, que acusou
`rls_disabled_in_public` nível ERROR. Corrigido com `enable row level
security` + as duas policies padrão do resto do schema (select aberto
pra `authenticated`, write admin-only) — mesmo padrão de `sla_config`.
Não tinha impacto prático (só funções `security definer` liam essa
tabela), mas ficava inconsistente com "toda tabela tem RLS" (seção 2) e
exposta via API a qualquer usuário autenticado sem essa correção.

**Feature nova em 2026-08-24 (mais tarde) — botão "Filtros" da aba
Atendimentos consolidado, igual ao Dashboard:** usuário reclamou que a
aba Atendimentos "ficou feia de novo" — a fileira de filtros (atendente/
canal/tipo de cliente/motivo) continuava sempre visível num `<Card>`
inline, sem entrar no popover "Filtros" (que já existia no cabeçalho
compartilhado das duas abas, mas só continha Horas úteis/corridas +
"Tipo de cliente" da seção "Por tipo de cliente" — conteúdo que só faz
sentido no Dashboard). Corrigido tornando o conteúdo do popover
condicional a `aba`: no Dashboard continua mostrando Tempo + filtro pra
seção "Por tipo de cliente"; em Atendimentos mostra Tempo (mesmo estado
`modoTempo`, compartilhado) + Atendente/Canal/Tipo de cliente/Motivo. A
aba Atendimentos ficou só com a busca por nome/e-mail visível
diretamente — o resto entra no mesmo botão "Filtros". Indicador visual
do botão (borda verde quando tem filtro ativo) passou a considerar
também os filtros da aba Atendimentos. Validado: contador de
"atendimentos" mudou de 2023 pra 356 ao filtrar por "Produtor" dentro do
popover.

**Bug real corrigido em 2026-08-24 (mesmo dia) — "Performance individual"
do Meu Painel sempre vazio pra quem não é admin:** ao investigar um
pedido de segmentação por tipo de cliente no Meu Painel, notei que
`tfr_ttr_percentis()`, `reabertura_resumo()`, `transferencias_resumo()` e
`fcr_recontato_resumo()` — as 4 funções por trás da seção "Performance
individual" — exigiam `public.is_admin()` **incondicionalmente** no WHERE,
mesmo já aceitando `p_atendente_nome` pra escopo pessoal (adicionado em
2026-08-19 especificamente pro Meu Painel, ver seção 10 acima). Resultado:
um colaborador sem ser admin sempre via SLA/FCR/Reaberturas/Transferências
zerados no próprio painel — o parâmetro pessoal nunca tinha efeito porque
o `and is_admin()` já barrava tudo antes. Como o usuário testando esta
sessão é admin (Eduardo), o bug nunca apareceu nos testes em navegador
até agora. Corrigido nas 4 funções: `is_admin()` virou `(is_admin() or
(p_atendente_nome is not null and p_atendente_nome = (select u.nome from
public.users u where u.id = current_app_user_id())))` — permite admin ver
qualquer atendente (comportamento antigo preservado, validado sem
divergência pra Eduardo) **ou** qualquer colaborador ver a si mesmo, mas
com o nome verificado contra o próprio registro em `public.users` no
banco (via `current_app_user_id()`, que resolve por `auth.uid()`) — nunca
confiando só no parâmetro recebido, então não dá pra um colaborador
passar o nome de outra pessoa e ver o desempenho alheio.

**Feature nova em 2026-08-24 (mesmo dia) — segmentação por tipo de
cliente no Meu Painel:** `metricas_por_tipo_cliente()` (usada hoje só
pelos cards "Por tipo de cliente" do Overview, admin-only) ganhou
`p_atendente_nome` com o mesmo padrão de acesso seguro acima. Nova seção
"Meus atendimentos por tipo de cliente" no Meu Painel, logo abaixo de
"Performance individual", reaproveitando o mesmo componente de card do
Overview (sem o clique-pra-filtrar, que não faz sentido aqui — não tem
outra seção pra filtrar). Validado com dado real do Eduardo: 17 chamados
Produtor / 4 Final, cada um com TFR/TTR próprios.

**Bug real corrigido em 2026-08-24 (mesmo dia, mais tarde) — "Tempo médio
de 1ª resposta" do bot inflado por um outlier de reabertura:** usuário
notou o card "Bot (IA Greenn)" mostrando 1min 45s, quando o esperado (por
achado documentado em 2026-08-18, acima nesta seção) era algo perto de
15s. Investigação: `tempo_resposta_bot()` calcula `avg(...)`, não
mediana — apesar do texto de 2026-08-18 já chamar o resultado esperado de
"mediana real do bot", a função nunca tinha sido implementada assim.
Com o volume real de dado atual (2028 amostras), a mediana genuína é
6,5s (p90 7,8s) — mas **um único outlier de 54,7 horas** (`session_
ae73a52c-...`, cliente "Diogo Alima89") sozinho puxava a média pra 104,5s.
Causa do outlier: a última mensagem antes de `current_started_at` era do
próprio cliente ("ok, obrigado."), e a resposta do bot só veio dias
depois — o mesmo tipo de ambiguidade de "quando uma conversa realmente
recomeça" já documentado como pendência pro relógio de posse (ver
"Pendência descoberta em 2026-08-17" nesta seção). Corrigido trocando
`avg()` por `percentile_cont(0.5)` — resultado real após o fix: 7s.
Card ganhou tooltips explicando (a) que o valor é mediana, não média, e
por quê, e (b) por que "Atendimentos" (1261) e "Chamados c/ posse" (1309)
podem divergir pro bot — mesma lógica já usada no rodapé da tabela de Ranking humano
("Total de atendimentos" vs. "Chamados c/ posse"), só que o card do bot
nunca tinha essa explicação. Motivo do
pedido do usuário: "ninguém é obrigado a adivinhar" — a explicação agora
fica no próprio produto (hover no rótulo), não só numa conversa com o
Claude.

**Auditoria em 2026-08-24 (mesmo dia, mais tarde) — usuário pediu pra
conferir mais alguns números "esquisitos"; todos corretos, nenhum bug
novo, só falta de explicação na UI (mesmo padrão do item acima):**

1. **Soma de "Total de atendimentos" vs. "Total de chamados"**: usuário
   somou manualmente as linhas do Ranking (bot + todos os atendentes) e
   bateu um número bem diferente do KPI do topo em dois testes seguidos
   (uma vez 3394, depois — já mais cuidadoso — 2097, contra ~1808 do
   KPI). Verificado buscando os dois ao mesmo instante (`atendente_
   performance` somado vs. `dashboard_atendimento_summary`): bateram
   exatamente — soma = total_chamados − chamados sem atendente ainda
   (1803 = 1808 − 5). A causa das divergências do usuário não era bug de
   cálculo, era o dado mudando entre uma leitura e outra — confirmado
   observando o próprio número do bot no card mudar de 1263 pra 1079 pra
   1265 em poucos minutos, só de tráfego real do n8n. Não deu pra "corrigir"
   isso (não é bug), mas fica registrado como o motivo mais provável na
   próxima vez que alguém reportar "os números não fecham".
2. **`csat_distribuicao_notas()`**: conferido boas+neutras+ruins = total
   exatamente (sem nota nula sumindo da soma) — função correta.
3. **"Tempo ativo" muito maior que "Tempo até resolução"**: chamado real
   da Fernando Machado (`session_9d21a52d-...`) mostrava Tempo até
   resolução 15h5min mas Tempo ativo 70h5min — parecia inconsistente.
   Confirmado com `EXPLAIN`/cálculo direto: são as MESMAS 70,09h corridas
   entre início e resolução, só que "Tempo até resolução" desconta fora de
   expediente (15,09h úteis) e "Tempo ativo" nunca descontou (é posse,
   sempre relógio corrido — mesma decisão de projeto de `relogio_posse_
   periodo`/`relogio_espera_cliente`, ver acima nesta seção). O chamado
   caiu numa sexta 17h até segunda 15h, atravessando um fim de semana
   inteiro sem desconto — por isso a diferença ficou tão grande. Não é
   bug, mas também não tinha explicação nenhuma no popup nem na coluna da
   tabela — adicionado tooltip nos dois lugares (`AtendimentoDetalheDialog.
   tsx` e o `<th>` "Tempo ativo" da aba Atendimentos) explicando a
   diferença de critério.

**Feature nova em 2026-08-24 (mesmo dia, mais tarde) — `formatDuration()`
ganhou dias/semanas/meses:** pedido direto do usuário depois do achado
acima — "70h 5min" é bem mais difícil de ler que "2d 22h 5min". Acima de
24h passou a mostrar dias (+ horas/min, sem segundos — viram ruído nessa
escala); acima de 7 dias mostra semanas (+ dias, sem horas/min); acima de
30 dias (aproximação, não acompanha mês corrido) mostra meses (+ semanas).
Abreviação sempre no singular mesmo pra plural ("2mês", não "2meses"),
mesmo padrão já usado pra "h"/"min"/"s". Comportamento abaixo de 24h
**não mudou** (só a faixa acima de 24h é nova). Como `formatDuration` é
compartilhada por toda a plataforma (seção 12, "nunca reimplementar
formatação de duração"), o efeito é automático em qualquer tela que
exiba durações longas (Tempo ativo, posse, backlog, etc.) sem precisar
tocar em cada uma. Validado em navegador com o mesmo chamado da Fernando
Machado usado no achado acima: "Tempo ativo" foi de "70h 5min" pra
"2d 22h 5min", e "Tempo até resolução" (15h5min14s, abaixo de 24h)
continuou exatamente igual, confirmando que só a faixa longa mudou.

**Bug real corrigido em 2026-08-24 (mesmo dia, mais tarde) — timeline de
atendentes duplicava segmento e mostrava "ainda ativo" em mais de uma
pessoa ao mesmo tempo:** usuário reportou (com session_id) um chamado
mostrando a Ana Paula com DOIS segmentos de posse (12s e 0s) e o Eduardo
com um terceiro — os três marcados "ainda com o chamado", o que é
logicamente impossível (só quem tem o chamado agora deveria aparecer
assim). Causa raiz: tanto `atendimento_timeline()` quanto o Tier A de
`relogio_posse_periodo()` (mesmo padrão, replicado — ver "Bug de
segurança" e o fix de O(N²), ambos nesta seção) faziam **um intervalo de
posse por LINHA CRUA do forward-fill**, em vez de colapsar linhas
consecutivas que não mudam o operador vigente. Um evento de
`crisp_conversation_state_history` (ex: NULL→"unresolved", uma transição
que não é resolução) no meio de uma posse do mesmo atendente criava uma
linha extra no forward-fill — e como o código gerava um intervalo por
linha (não por "trecho contínuo do mesmo atendente"), isso duplicava o
segmento e, pior, cada pedaço espúrio calculava seu próprio "ainda_ativo"
independentemente, podendo marcar mais de um atendente como ativo ao
mesmo tempo se os eventos caíssem dentro da mesma janela de 1 minuto
usada nesse cálculo.

Corrigido nas duas funções com uma segunda passada de gap-and-island:
depois do forward-fill (que já estava correto), agrupa linhas
consecutivas que não mudam nem o operador vigente nem "está resolvido"
(`coalesce(estado_vigente = 'resolved', false) is distinct from
coalesce(lag(...) = 'resolved', false)` — o `coalesce` é necessário
porque sem ele `NULL IS DISTINCT FROM false` dá `true`, quebrando o
agrupamento logo no primeiro evento de estado de qualquer conversa nova,
erro que eu mesmo cometi na primeira tentativa desse fix e só peguei
testando de novo antes de considerar resolvido). Cada grupo colapsado
vira UM intervalo (início = primeiro evento do grupo, fim = início do
próximo grupo ou agora). Validado: o chamado reportado passou de 3
segmentos (Ana Paula 12s + Ana Paula 0s + Eduardo "ativo") pra 2 corretos
(Ana Paula única, Eduardo "ativo" — só ele). Revalidado também o caso de
estresse já conhecido (Paulo Lucena, 16-18 handoffs reais) pra garantir
que o colapso não afeta segmentos que são trocas de operador de verdade:
continuou com 17 segmentos e exatamente 1 "ainda_ativo", soma de minutos
consistente com antes do fix. Os totais agregados de
`relogio_posse_periodo()` (soma de minutos/conversas por atendente) não
mudaram de forma anômala — pequenas variações batem com ~15min de
tráfego real do n8n entre uma consulta e outra, não com perda ou
duplicação de dado (segmentos espúrios eram contíguos do mesmo atendente,
então a SOMA de duração já estava certa antes; o que estava errado era
só a quantidade de linhas exibidas e o "ainda_ativo" por linha).

**Feature nova em 2026-08-25 — filtro de Atendente na aba Atendimentos do
Overview virou multi-seleção:** pedido do usuário. `atendimentos_com_
metricas()` tinha `p_atendente_nome text` (um nome só); trocado por
`p_atendente_nomes text[]`, filtro virou `nome_canonico_por_operator_id(...)
= any(p_atendente_nomes)` (união, não interseção — mostra chamados de
QUALQUER um dos selecionados). Mudança de assinatura exigiu o
`DROP FUNCTION` explícito de sempre antes do `CREATE` (mesmo problema de
sobrecarga-fantasma, ver primeira ocorrência nesta seção) — confirmado 1
versão só depois. Validado com 3 chamadas reais (1 nome, 2 nomes, sem
filtro): 279 / 312 / 2188 chamados respectivamente — 312 > 279 confirma
que é união de verdade, não os dois nomes se anulando nem filtrando por
interseção (que teria dado 0, já que ninguém é os dois atendentes ao
mesmo tempo).

Frontend: estado local trocou de `atendenteNome: string` (usePersistedState
`overview:atendenteNome`) pra `atendenteNomes: string[]` (chave nova
`overview:atendenteNomes` — deliberadamente uma chave diferente, não
reaproveitada, pra evitar o localStorage antigo guardando uma STRING
solta ser lido como se fosse array e quebrar de forma silenciosa). UI: o
`<select>` único virou uma lista de checkboxes rolável (`max-h-40
overflow-y-auto`) dentro do mesmo popover "Filtros", com contador
"Atendentes (N)" e um link "Limpar". Outros dois call-sites de
`fetchAtendimentosComMetricas` que usavam nome único (o popup "Chamados
de {atendente}" da Ranking/bot, e o filtro — esse sim continua
single-select de propósito, não fazia parte do pedido — da tela Em
Risco) foram adaptados só envolvendo o nome num array de 1 item, sem
mudar comportamento nenhum deles.

**Nota de teste (não é bug, é sobre a ferramenta de automação):**
validar checkbox via `dispatchEvent(new Event('change'))` depois de setar
`.checked` pelo setter nativo **não** disparou o `onChange` do React
nesta tela — o estado ficava visualmente marcado no DOM mas
`atendenteNomes` no React continuava `[]`. Só funcionou com um clique de
verdade (via `computer` tool). Registrado aqui só como lembrete pra quem
for testar checkbox controlado por React nesta base no futuro — não
mexi em nada do componente por causa disso, o componente está correto.

**Feature nova em 2026-08-25 — filtro de Atendente passou a existir também
na aba Dashboard do Overview (antes só em Atendimentos):** pedido direto
do usuário. O checkbox list de "Atendentes" saiu de dentro do branch
`aba === "atendimentos"` do popover "Filtros" e virou uma seção
compartilhada (renderizada sempre, antes do `{aba === "ranking" ? ... :
...}`), com uma nota explicando que no Dashboard ele filtra a página
inteira. `atendenteNomes` já era um estado único no nível da página (não
por aba), então não precisou de estado novo — só de expor o mesmo
controle visualmente nos dois lugares. Botão "Filtros" com destaque
visual (`border-forest-300`) passou a acender por `atendenteNomes.length
> 0` incondicional (antes só considerava isso quando `aba ===
"atendimentos"`).

Duas famílias de dado por trás do Dashboard, tratadas diferente:
- **`atendente_performance` (Ranking) e `relogio_posse_periodo` (gráfico
  "Posse por atendente humano")**: já retornam uma linha por atendente —
  filtrado **no cliente** (`rankingHumano`/`posseFiltrada`, dois `useMemo`
  novos), sem tocar SQL nenhum. Mais simples e mais barato que reescrever
  as funções, e o resultado é idêntico a filtrar no banco já que as duas
  só agregam por atendente mesmo.
- **`tfr_ttr_percentis` (Velocidade), `backlog_por_idade` (Backlog),
  `reabertura_resumo`/`reabertura_casos`, `transferencias_resumo`/
  `transferencias_casos`, `fcr_recontato_resumo`/`recontato_casos`,
  `metricas_por_tipo_cliente` (Por tipo de cliente)**: essas agregam o
  time inteiro num número só, então precisavam de filtro real no banco.
  As 5 que já tinham `p_atendente_nome text` (usado até então só pelo Meu
  Painel, pra auto-visualização) tiveram a assinatura trocada pra
  `p_atendente_nomes text[]`, mesmo padrão `= any(...)` já usado em
  `atendimentos_com_metricas` (ver acima nesta seção); as 3 variantes
  `_casos` (`reabertura_casos`, `transferencias_casos`, `recontato_casos`)
  não tinham NENHUM filtro de atendente até então (usadas só com
  `is_admin()` puro) — ganharam o parâmetro novo do zero. Todas as 8
  passaram pelo `DROP FUNCTION` explícito de sempre (mesma
  sobrecarga-fantasma de sempre) — confirmado 1 versão de cada no fim.
  `backlog_por_idade` também converteu seu `p_atendente_nome` existente,
  mesmo não sendo escopada por período (é sempre "backlog atual").

Segurança preservada: as 5 funções com o guard de auto-acesso pro Meu
Painel (`is_admin() or (p_atendente_nome is not null and p_atendente_nome
= nome do usuário logado)`) viraram `is_admin() or (p_atendente_nomes is
not null and array_length(p_atendente_nomes,1) = 1 and
p_atendente_nomes[1] = nome do usuário logado)` — um colaborador sem
`is_admin()` só consegue passar um array de exatamente 1 elemento igual
ao próprio nome; um array com o próprio nome + outro nome misturado (na
tentativa de ver dado de terceiro) cai fora da condição e a função não
retorna nada, igual antes só aceitava exatamente o próprio nome sozinho.
`src/pages/MeuPainel.tsx` (5 call-sites) só precisou envolver
`user!.nome` num array de 1 item — nenhuma mudança de comportamento lá.

Validação: como a conexão MCP não tem JWT real (`is_admin()` sempre
falso por ali, ver nota de sessões anteriores), a comparação
antes/depois foi feita pela sessão autenticada real do navegador
(`supabase.rpc(...)` via `javascript_tool`), capturando um baseline com
as funções antigas (ainda não substituídas) e comparando com as novas
depois do deploy. A maioria bateu exato; algumas (`tfr_vittor`,
`transferencias_vittor`, `backlog_vittor`) divergiram por ±1 registro —
investigado e confirmado ser **drift real de dado ao vivo** entre as duas
chamadas (segundos de diferença, sistema em produção com conversas sendo
atendidas de verdade), não bug: reforçado com uma comparação **no mesmo
snapshot** (uma única query SQL aplicando o predicado antigo
`= 'nome'` e o novo `= any(array['nome'])` lado a lado sobre a mesma
leitura de `crisp_conversations`) que deu 0 divergências pra 1 e 2 nomes.

**Bug real encontrado e corrigido durante a validação**: `transferencias_
casos` (a lista de casos por trás do card "Transferências") só filtrava
pela origem (`previous_operator_crisp_id`), mas `transferencias_resumo`
(o card com o número "X eventos" acima da lista) sempre exigiu **origem E
operador atual da conversa** batendem com o filtro (dupla condição já
pré-existente antes desta sessão, dentro do join dá `conversas` com
`eventos_humanos`) — resultado: filtrando por "Vittor" o resumo mostrava
"14 eventos" mas a lista expandida mostraria 119 linhas (todo handoff que
já teve Vittor como origem alguma vez, não só os que ele ainda segura).
Corrigido replicando a mesma condição dupla em `transferencias_casos`;
revalidado no navegador, resumo e lista batem exato (14 = 14). A
narrowness da definição original de `transferencias_resumo` (só contar
transferência se o chamado ainda estiver com quem transferiu, o que é
raro) não foi alterada — fora de escopo redesenhar essa métrica agora,
só garantir que a lista e o resumo nunca divirjam entre si.

Mesma checagem repetida por precaução em `backlog_casos` (a lista por
trás do popup que abre ao clicar num card de faixa do Backlog, ex: "0-1
dia") — essa função também já existia sem filtro de atendente nenhum
(só `is_admin()`), então clicar num card já filtrado por Vittor abriria
um popup com TODOS os 326 chamados da faixa, não só os 31 dele. Corrigida
com o mesmo `p_atendente_nome text → p_atendente_nomes text[]` +
`= any(...)`. Validado no navegador: card "0-1 dia" mostrou 31 com Vittor
selecionado, popup abriu com "31 chamados" no rodapé de paginação e as
15 linhas da 1ª página todas com "Vittor Fernandes" na coluna Atendente.

**Deliberadamente fora do filtro por atendente no Dashboard** (ficam
sempre agregados do time inteiro, mesmo com atendentes selecionados):
`motivo_contato_resumo` (Motivo de contato), `relogio_espera_cliente`
(Relógio de espera do cliente), `minutos_uteis_entre_time`/
`fetchHorasExpedientePeriodo` (Relógio de trabalho ativo — é "cobertura
do time", filtrar por pessoa mudaria o que o número representa),
`csat_distribuicao_notas` (CSAT usa identidade por e-mail, sistema de
reconciliação separado de `operator_crisp_id` — ver decisão arquitetural
já documentada nesta seção), `contagem_periodo` e `tempo_resposta_bot`
(sobre o bot, filtro de atendente humano não se aplica). Não é
esquecimento — decisão consciente de escopo pra não estourar o tamanho
da mudança; registrado aqui pra não parecer bug numa auditoria futura.

Validado em navegador de ponta a ponta: com "Vittor Fernandes"
selecionado, Ranking mostrou só a linha dele (290 atendimentos, 42
reaberturas, 14 transferências — bateu com os números validados via
RPC), "Volume de atendimentos por pessoa" mostrou só "Vittor: 290",
Velocidade saiu de "Sem amostras" pra TFR/TTR reais (289 amostras),
Backlog mudou de 1625 pra 62 chamados em aberto, Reabertura mostrou
227/42/54 (bate exato com a chamada RPC direta). Trocar pra aba
Atendimentos manteve a mesma seleção (estado compartilhado, como
esperado) e o popover lá continuou mostrando só canal/tipo de
cliente/motivo além de Atendentes — sem o select "Tipo de cliente (seção
'Por tipo de cliente')" duplicado do Dashboard.

**Achado em 2026-08-25 — por que a soma dos trechos de "Atendentes que
passaram por esse chamado" pode ficar menor que "Tempo até resolução":**
usuário estranhou um chamado real (`session_88219c50-...`) com o Vittor
aparecendo DUAS vezes na lista de atendentes, e o total de resolução 12s
maior que a soma visível dos trechos. Investigado com os eventos brutos
(`operator_routing_history`/`crisp_conversation_state_history`): não é
bug, são dois fenômenos genuínos e distintos, ambos consequência direta
de decisões já documentadas nesta seção:
1. **Vittor duas vezes** — o chamado foi resolvido (`first_resolved_at`)
   e reaberto 3s depois (`reopened_count = 1`) antes de resolver de novo
   (`resolved_at`), sem trocar de atendente. `atendimento_timeline()`
   corta o trecho na fronteira de resolução mesmo quando o operador é o
   mesmo dos dois lados — comportamento intencional do fix de
   2026-08-24 (ver acima nesta seção), que existe exatamente pra não
   esconder que o chamado reabriu.
2. **12s de diferença** — o chamado nasceu (`current_started_at`) ~12s
   antes do 1º roteamento pra um humano (ainda sem atendente, só
   pending/com o bot); esse intervalo não aparece em nenhum trecho da
   lista mas conta em "Tempo até resolução" (que é sempre do início real
   ao fim real). Achou-se também um segundo gap menor (~3s) durante a
   janela resolvido→reaberto do item 1, mesmo motivo.

Primeira correção foi um `title` (tooltip) estático no rótulo "Atendentes
que passaram por esse chamado" explicando os dois casos em prosa. Usuário
auditou mais 2 chamados reais no mesmo dia (`session_74efd17a-...`,
gap de 8min56s de fila + 4min12s resolvido-aguardando-reabertura;
`session_96e21498-...`, só 2min6s de fila, sem reabertura) e perguntou se
dava pra "remover o gap" em vez de só explicar por tooltip — decisão:
melhor que tooltip genérico é mostrar o gap como uma LINHA própria na
lista, com a duração real desse chamado específico, então a soma bate
visualmente sem precisar calcular nada.

**Feature nova em 2026-08-25 (mesmo dia) — `atendimento_timeline()` passou
a devolver os trechos sem atendente, não só os com atendente:** função
reescrita — `intervalos_a` (Tier A, o de melhor fidelidade) ganhou duas
correções estruturais antes de virar `runs_a`/`gaps_a`: (1) o `inicio` do
1º intervalo agora é `least(inicio, current_started_at)` — o chamado pode
ter nascido alguns segundos antes do 1º evento registrado (ex:
`current_started_at` 18:11:38.446 vs. 1º evento de estado 18:11:43.518 —
5s que ficavam de fora antes); (2) o `fim` de todo intervalo agora é
capado em `coalesce(resolved_at, now())` — sem isso, o trecho "resolvido"
final de um chamado que nunca reabre cresceria pra sempre em direção a
"agora" toda vez que o popup fosse reaberto, o que seria um gap falso (o
chamado está fechado, não "aguardando" nada). `runs_a` (que já existia,
filtra pra fora null-operador/resolvido) ganhou uma irmã `gaps_a` com a
condição exatamente complementar — juntas as duas cobrem 100% dos
intervalos, sem sobra nem buraco. Cada linha ganhou uma coluna nova
`tipo`: `'atendente'` (posse real, como antes), `'fila'` (ainda sem
roteamento pra humano) ou `'resolvido'` (marcado resolvido, aguardando
reabertura ou fim real) — `atendente` vem `null` nos dois últimos casos.
Tier B (só roteamento, sem histórico de estado — dado mais antigo) ganhou
uma versão simplificada só do gap de fila (`gap_b`, antes do 1º evento de
roteamento) — não dá pra detectar o gap de "resolvido" nessa tier por
faltar o histórico de estado. Tier C (sem roteamento nenhum, fallback por
mensagem) não ganhou gap nenhum — já é a aproximação mais fraca, não
compensa a complexidade. Mudança de `RETURNS TABLE` (coluna nova) exigiu
o `DROP FUNCTION` de sempre antes do `CREATE`.

`tempo_ativo_seg` em `atendimentos_com_metricas()` (que chama
`atendimento_timeline()` internamente e soma só os trechos do atendente
da linha via `filter (where at.atendente = c.operator_nome_exibicao)`)
não precisou de nenhuma mudança — `atendente = null` nunca bate numa
comparação de igualdade em SQL, então os trechos de gap já ficam fora da
soma automaticamente pela própria semântica de `NULL`. Validado mesmo
assim: `session_96e21498-...` continuou com `tempo_ativo_seg = 618`
(10min18s da Amanda) depois do deploy, idêntico a antes.

Frontend: `AtendimentoDetalheDialog.tsx` ganhou `labelDoTrecho()`/
`aindaAtivoDoTrecho()` (mapeiam `tipo` pro texto certo — "Sem atendente
(fila)" / "Sem atendente (resolvido, aguardando reabertura)") e estilo
diferenciado pras linhas de gap (`border-dashed` + itálico + texto mais
apagado) pra não parecer atendente de verdade na lista. O tooltip
estático do rótulo da seção foi removido — não faz mais sentido explicar
"a soma pode ficar menor" quando a soma agora inclui os gaps e sempre
bate.

Validado nos 3 chamados reais desta conversa via `supabase.rpc(...)` no
console do navegador (sessão admin real): a soma de todos os trechos
(atendente + fila + resolvido) reconcilia com `resolved_at -
current_started_at` em cada um, com diferença residual de 0,3–4,7s —
inteiramente explicada pelo arredondamento de exibição já conhecido
(`round(minutos_posse::numeric,1)`, granularidade de 6s), não um erro
novo. Revalidado também em navegador de verdade abrindo o popup do
chamado "Mr Carneiro" (`session_74efd17a-...`): as 5 linhas (fila 8min54s
→ Amanda 6s → resolvido 4min12s → Amanda 0s → Vittor 2min6s) aparecem na
ordem certa, com as 2 linhas de gap visualmente tracejadas/apagadas.

**Fix aplicado em 2026-08-25 (mesmo dia, logo em seguida) — arredondamento
duplo em `atendimento_timeline()` removido:** usuário achou mais um
chamado real (`session_a507c67c-...`, "Felipe Bertaggi") onde a soma das
3 linhas exibidas (12s + 1min30s + 6s = 1min48s) ainda ficava 3s abaixo
de "Tempo até resolução" (1min51s), mesmo já com os gaps virando linhas
explícitas. Causa: a função arredondava `minutos_posse` pra 1 casa decimal
(`round(...,1)`, granularidade de 6 segundos) **antes** de devolver pro
frontend, que arredonda de novo (`formatDuration`, segundo a segundo) —
dois arredondamentos em granularidades diferentes empilhados, cada linha
podendo perder até ~3s. Removido o `round(...,1)` da função (última linha
do `SELECT` final) — `minutos_posse` agora sai com precisão completa, e
quem arredonda pra exibição é só o `formatDuration()` do frontend, uma
vez só. Revalidado nos 4 chamados reais desta conversa: a soma **bruta**
(sem nenhum arredondamento) bate exata com `resolved_at -
current_started_at` nos 4 (diferença 0.00s, contra até 4.7s antes); a
soma dos valores **exibidos** (cada um já arredondado ao segundo mais
próximo) caiu pra no máximo ~1.7s de diferença — o mínimo matematicamente
possível ao somar números já arredondados individualmente, não mais um
sinal de dado faltando. Chamado do Felipe revalidado no popup real:
trocou de "12s / 1min 30s / 6s" (somava 1min48s) pra "11s / 1min 32s /
8s" (soma 1min51s, bate exato).

**Bug sistêmico encontrado e corrigido em 2026-08-25/26 — evento de um
ciclo anterior do mesmo `crisp_id` vazava pro cálculo do ciclo atual, em
5 funções:** pedido do usuário pra auditar mais chamados e confirmar que
o fix acima realmente fechava a conta. Rodei uma auditoria de 400
chamados reais (últimos 60 dias) comparando a soma bruta dos trechos de
`atendimento_timeline()` contra `resolved_at - current_started_at` —
achado: 97,5% batia dentro de 1s, mas a média do erro absoluto era
**2587s (43min)** e o pior caso **425713s (4,9 dias)**, escondido atrás
da média de "dentro de 1s" parecer boa.

Causa raiz: o mesmo `crisp_id` do Crisp pode ser reaproveitado em ciclos
bem separados no tempo — um chamado resolve, fica dormente, o cliente
manda mensagem nova dias/semanas depois, `current_started_at` avança pro
início desse novo ciclo — mas `operator_routing_history`/
`crisp_conversation_state_history`/`crisp_messages` continuam guardando
os eventos do ciclo ANTERIOR pra sempre, sem nenhum marcador de "isso
aqui já era outro ciclo". `atendimento_timeline()` (e as 4 funções
irmãs abaixo) liam esses eventos só filtrando por `session_id`, sem piso
nenhum — um evento de 5 dias atrás virava "o operador atual" ou inflava
um gap, multiplicando o erro por 400+ vezes o tamanho real do chamado.
Prevalência real (60 dias, 2456 conversas): 19 com evento de roteamento
vazado, 59 com evento de estado vazado — raro (~1-2%), mas cada caso
inflava um card em horas ou dias.

Primeira tentativa de fix (`event_at >= current_started_at` cru) resolveu
os casos óbvios mas criou um falso positivo: um chamado real
(`session_660bb833-...`) tinha seu evento de roteamento genuíno ~18min
ANTES de `current_started_at` (atraso de pipeline no MESMO ciclo, sem
nenhuma resolução no meio) — o corte cru descartava esse roteamento
legítimo, derrubando o chamado de Tier A pra Tier C (fallback por
mensagem, sem o mesmo rigor). Investigando a distribuição real de "quantos
minutos antes de current_started_at" um evento vazado aparece, achei uma
separação limpa: casos legítimos de atraso ficam todos abaixo de ~18min;
todo caso confirmadamente de ciclo anterior tem, sem exceção, um evento
`state = 'resolved'` real ANTES do vazamento (a prova de que aquele
ciclo já tinha fechado) — inclusive um caso de 92min que só bateu com
essa regra (não com um corte por tempo fixo).

Fix definitivo, **`piso_ciclo`**: só corta evento anterior a
`current_started_at` se existir um `'resolved'` real antes dele (prova
de ciclo fechado); sem esse marcador, é só atraso de pipeline no mesmo
ciclo e nada é cortado. Aplicado como CTE em todas as 5 funções que leem
`operator_routing_history`/`crisp_conversation_state_history` por
`session_id`: `atendimento_timeline`, `relogio_posse_periodo`,
`relogio_espera_cliente`, `transferencias_resumo`, `transferencias_casos`.

Ainda faltava um segundo ajuste em `atendimento_timeline()`: o 1º
intervalo (depois do `piso_ciclo`) tinha o início preso em
`current_started_at` só quando esse intervalo sobrevivia ao filtro
`fim > início` — mas um intervalo "fila" residual de poucos segundos
(sobra de atraso de pipeline, não ciclo antigo) tinha seu `fim` ANTES de
`current_started_at`, então era descartado pelo filtro, e o intervalo
seguinte (o do atendente de verdade) virava o novo 1º sobrevivente sem
nunca receber o clamp. Corrigido calculando `fim` de todo intervalo
primeiro, descartando os que terminam inteiramente antes de
`current_started_at`, e só then prendendo o início do novo 1º
sobrevivente — mesma técnica replicada em `relogio_posse_periodo`
(particionada por `session_id`, já que essa função agrega muitas
conversas de uma vez, não uma só).

Validado com uma função de debug temporária (`security definer`, dropada
depois) rodando a mesma auditoria de 400 chamados: Tier A foi de "97,5%
dentro de 1s, média de erro 2587s" pra **100% dentro de 1s, média de erro
0,00s, pior caso 0,00s** — reconciliação exata nos 364 chamados Tier A da
amostra. Tier C (sem histórico de roteamento, fallback só por mensagem —
dado anterior à instalação do plugin) continua com erro grande por
design, decisão de escopo já documentada (não ganhou tratamento de gap
nem de `piso_ciclo` — é a aproximação mais fraca, não compensa a
complexidade pra dado que só existe antes de 2026-08-18).

Sanity-check nas outras 4 funções após o fix: `relogio_posse_periodo`,
`relogio_espera_cliente`, `transferencias_resumo`/`transferencias_casos`
rodam sem erro e devolvem número em faixa plausível. O card "Bot (IA
Greenn)" mostrando centenas de milhares de minutos de posse numa janela
larga (60 dias) **não é regressão desta correção** — é o mesmo fenômeno
já documentado (seção 10, achado de 2026-08-18: a conta real
`b8b993a0-.../allan@gdigital.com.br` acumula posse de muitos chamados
ainda `pending` nunca retomados por um humano) — como o `piso_ciclo` só
EXCLUI evento (nunca inclui mais do que antes) e o clamp só ENCURTA o 1º
trecho, o fix é matematicamente incapaz de aumentar posse de qualquer
chamado; se o número parece grande, já era pelo menos tão grande antes.
Como o banco foi zerado em 2026-08-18 (ver seção 10) e há só ~8 dias de
dado real acumulado, uma janela de 30 ou 60 dias captura o dataset
inteiro por igual — por isso os dois deram o mesmo resultado no teste,
não é bug de filtro de data.

**Bug encontrado em 2026-08-26 — "duas Amanda" no filtro de Atendentes:**
usuário notou o checklist de Atendentes (Filtros do Overview) mostrando
"Amanda" e "Amanda Felix" como duas pessoas separadas. Causa: mesmo
`operator_crisp_id` (`2c2aec92-...`) mas `crisp_conversations.operator_nome`
gravado de forma inconsistente pelo n8n — 47 linhas como `"Amanda"`, 2
como `"Amanda Felix"` — e como `operator_id_aliases` nunca tinha ganhado
uma linha pra esse ID (pendência já registrada em 2026-08-24, nunca
concluída), `nome_canonico_por_operator_id()` cai no fallback (`coalesce(
alias, nome_bruto_da_linha)`) e devolve os dois valores brutos como se
fossem atendentes diferentes. Corrigido com o mesmo mecanismo de sempre:
`insert into operator_id_aliases (operator_crisp_id, nome_canonico)
values ('2c2aec92-...', 'Amanda Felix')`. Validado via `distinct_
atendentes_canonico()` no navegador: só "Amanda Felix" aparece agora.

Discutido com o usuário um fix estrutural pra essa categoria inteira de
bug (não só a Amanda — qualquer atendente sem alias ainda fica exposto a
`operator_nome` inconsistente): puxar periodicamente a lista de
operadores da API do Crisp (`GET /v1/website/{website_id}/operators/list`,
mesmo endpoint/autenticação por Plugin Token usado pra popular
`operator_id_aliases` pra o time inteiro em 2026-08-18 — ver seção 10
acima) e fazer upsert em `operator_id_aliases` a partir do nome oficial
cadastrado no Crisp, não do texto solto de `operator_nome` por
mensagem/conversa. Isso pegaria automaticamente operador novo (nome
completo desde o 1º dia) e corrigiria inconsistência de nome sem precisar
de alias manual um por um. Usuário optou por n8n (workflow "Request de
users no Crisp"): `Schedule Trigger → HTTP Request (GET operators/list na
Crisp) → Split Out (campo "data") → HTTP Request (POST pro PostgREST do
Supabase, `/rest/v1/operator_id_aliases`, com header `Prefer:
resolution=merge-duplicates` pra fazer upsert em vez de só insert — PATCH
foi cogitado e descartado, porque não cria linha nova pra operador que
ainda não tem alias, só atualiza existente).

Nesse mesmo lote, `operator_id_aliases` ganhou uma coluna `email text`
(`alter table ... add column`, sem dado ainda) — pedido do usuário pra
esse cron também gravar o e-mail do operador vindo da Crisp, não só nome.
Sem RLS nova (política de tabela já existente cobre a coluna, RLS é por
linha não por coluna).

**Cron confirmado funcionando em 2026-08-26**: usuário montou e rodou o
fluxo (`Schedule Trigger` 7h → `HTTP Request` GET na Crisp → node `Code`
mapeando `operador.details.user_id`/`first_name`/`last_name`/`email`
— campos vêm aninhados dentro de `details`, não no nível raiz do item,
por isso o primeiro teste tinha dado tudo vazio → `HTTP Request` POST pro
Supabase). 1ª rodada gravou uma linha lixo (`operator_crisp_id` vazio,
nome só espaço em branco) por causa do mapeamento errado de campo —
apagada depois de corrigido. 2ª rodada funcionou e revelou dois problemas
reais:
1. **`Prefer: resolution=merge-duplicates` sobrescrevia `nome_canonico`
   sem condição** — um alias corrigido à mão (ex: "Rafael Wisch") virava
   o valor cru da Crisp de novo (`"rafael wisch"`) a cada rodada do cron.
2. **Operador novo real, mas nome errado**: apareceu um `operator_crisp_id`
   nunca visto antes (`69f58226-...`) com `email = eduardo.nicolau@greenn.
   com.br` mas `nome_canonico = "Eduardo Pereira"` — confirmado com o
   usuário que é uma segunda conta Crisp dele mesmo (Eduardo Nicolau),
   só com nome errado cadastrado na Crisp. Corrigido manualmente
   (`update ... set nome_canonico = 'Eduardo Nicolau'`).

Item 2 só foi possível notar por causa da coluna `email` nova — sem ela,
"Eduardo Pereira" pareceria só mais um nome cru qualquer, não um alerta
de possível duplicata de identidade.

Fix estrutural pro item 1: criada `public.upsert_operator_alias(
operator_crisp_id text, nome_canonico text, email text default null)`
— mesmo nome dos parâmetros que as chaves do JSON body que o n8n já
mandava, de propósito, pra trocar só a URL no node HTTP Request de POST
sem precisar mexer no body. Faz `insert ... on conflict (operator_crisp_id)
do update set nome_canonico = coalesce(atual, novo), email = coalesce(
atual, novo)` — só preenche campo vazio, nunca sobrescreve alias já
corrigido à mão. Validado com chamadas isoladas (id fake, apagado depois):
confirmado que um 2º upsert com nome/e-mail diferentes NÃO altera uma
linha que já tinha valor, e QUE preenche quando o campo estava null.
Node de POST do n8n precisa trocar a URL de `/rest/v1/operator_id_aliases`
pra `/rest/v1/rpc/upsert_operator_alias` (body continua igual).

**Achado em 2026-08-26 (mesmo dia) — cards "Por tipo de cliente" com
"chamados" maior que as amostras do card de Velocidade, não é bug:**
usuário estranhou "Final: 33 chamados" só que TTR "—" e o card geral de
Velocidade mostrando só "13 amostras" no mesmo período. Confirmado com
RPC real: `metricas_por_tipo_cliente()` conta **todo** chamado com aquela
tag (`count(*)` em `chamados`), tenha ou não TFR/TTR calculado; `tfr_ttr_
percentis()` só conta quem já tem o valor de verdade (`count(tfr_seg)`).
No período testado: 48 chamados no total, 38 com `tipo_cliente` (33
Final + 5 Produtor), só 13 já com resposta humana — cedo no dia, fila
grande. Números batem exatos, só faltava explicação na UI. Adicionado
`title` (tooltip) em "{N} chamados" e em "TTR médio" de cada card, mais
uma frase na nota de rodapé da seção — mesmo padrão já usado no resto da
página pra esse tipo de "número que parece não bater".

**Feature nova em 2026-08-26 (mesmo dia) — cards "Por tipo de cliente"
ganharam bucket "Sem tipo"; "Motivo de contato" ganhou Top 3 clicável +
tabela ordenável:**

1. `metricas_por_tipo_cliente()` reescrita: antes excluía de propósito
   todo chamado com `tipo_cliente is null` (`base` filtrava isso fora) —
   agora esses chamados viram um card **"Sem tipo"** (sempre por último,
   `order by (tipo = 'Sem tipo'), chamados desc`) em vez de simplesmente
   sumir sem explicação. Cuidado na reescrita: trocar o `unnest` normal
   (que descarta a linha inteira quando `tipo_cliente` é null/vazio, já
   que `unnest(null)`/`unnest('{}')` não produz nenhuma linha) por
   `left join lateral ... on true`, e usar `not exists` pra só cair em
   "Sem tipo" quando o chamado não tem NENHUMA tag de verdade — evita
   contar um chamado como "Sem tipo" só por causa de uma vírgula sobrando
   no fim de `tipo_cliente` (ex: `"Final,"` já produz um elemento vazio
   no meio das tags reais via `string_to_array`).
2. `HorizontalBarChart` (`src/components/ui/BarChart.tsx`) ganhou
   `onBarClick`/`isSelected` opcionais — clique na linha, destaque visual
   (`ring-forest-300`), sem quebrar nenhum uso existente do componente
   (props opcionais). Primeiro uso: "Motivo de contato" — Top 8 virou
   **Top 3**, clicável (clica de novo pra limpar, ou botão "Limpar"),
   filtra a tabela de tópicos abaixo pra só aquele tópico. Tabela ganhou
   `SortableHeader` nas 3 colunas numéricas (Chamados/TFR médio/TTR médio),
   client-side (`motivosOrdenados`, mesmo padrão de `rankingOrdenado`) —
   já vem tudo carregado de uma vez, sem paginação, então não precisa de
   parâmetro novo em `motivo_contato_resumo()`.

**Ajuste em 2026-08-26 (mesmo dia) — cap padrão das listas "Ver mais" do
Dashboard reduzido de 10 pra 4:** usuário achou as listas de casos
(Transferências, FCR/Recontato, Motivo de contato) grandes demais por
padrão. Trocado `slice(0, 10)`/`length > 10`/`Ver mais (N - 10)` por
`slice(0, 4)`/`length > 4`/`Ver mais (N - 4)` nas 3 (Reabertura já tinha
sido reduzida antes, no mesmo pedido de filtro atendente/reaberto — ver
acima). Ranking de atendentes ficou de fora de propósito (pedido
explícito do usuário, "menos na de atendentes") — continua sem paginação,
mostra todo mundo sempre.

**Correção em 2026-08-27 — filtro de Atendente do Dashboard passou a
valer pra TUDO, não só pros cards já cobertos:** usuário testou
selecionando "Ana Clara" (sem atividade no período) e viu "Total de
chamados"/"Total de mensagens" continuarem com o número do time inteiro
— pedido explícito: "com o filtro aplicado ele deve refletir na página
toda... tudo!". Estendido `p_atendente_nomes text[]` (mesmo padrão
`= any(...)`, `DROP FUNCTION` de sempre) em mais 5 funções:
- `contagem_periodo` ("Total de chamados"/"Total de mensagens").
- `motivo_contato_resumo` ("Motivo de contato").
- `relogio_espera_cliente` ("Relógio de espera do cliente").
- `csat_distribuicao_notas` — caso especial: CSAT é reconciliado por
  **e-mail** (`csat_results.email_atendente`), não por
  `operator_crisp_id` (decisão arquitetural já documentada, seção 21) —
  filtrar por nome canônico exigiu traduzir nome → e-mail via
  `operator_id_aliases.email` (populada pelo cron novo desta mesma
  sessão) antes de comparar com `normalizar_email_atendente(email_
  atendente)`. Só funciona pra quem já tem e-mail cadastrado no alias;
  sem isso, filtrar por essa pessoa dá 0 CSAT (correto/honesto — não tem
  como saber o e-mail dela — em vez de mostrar o time inteiro sem avisar).
- `minutos_uteis_entre_time` ("Relógio de trabalho ativo") — o mais
  delicado: essa função lê de `cobertura_semanal`, uma tabela-cache
  pré-computada pro time INTEIRO (criada em 2026-08-24 especificamente
  pra evitar recalcular o cross-join de horários a cada chamada). Filtrar
  por pessoa não pode usar essa cache (ela já vem agregada, sem separar
  por indivíduo) — a função ganhou um segundo caminho que recalcula a
  união na hora só pras pessoas selecionadas (poucas linhas, não compensa
  cache por combinação de pessoas possível; sem filtro continua no
  caminho rápido de sempre, validado que `minutos_entre()` — que chama
  essa função internamente sem passar o novo parâmetro — continua batendo
  exato com a chamada direta). O plantão fixo de sábado (08h-12h, não
  rastreável por pessoa — depende de `escala_sabado`, tabela separada)
  só entra na versão sem filtro; filtrado, mostra só a jornada de
  segunda-sexta de quem foi selecionado. Validado: Vittor Fernandes
  (07h-16h, almoço 10:30-11:30 = 8h/dia úteis) deu exatamente 960min em 2
  dias (8h × 2 × 60), batendo com o horário cadastrado dele.

Todas as 5 validadas com Ana Clara (sem atividade): todas foram a
zero/vazio, confirmado também que atendente com atividade real
(Vittor) continua retornando números não-zero — não é um filtro que
zera tudo incondicionalmente.

**Bug real encontrado e corrigido no mesmo lote — `conversas_evolucao()`
(gráfico "Evolução diária de conversas" da Home) agrupava por dia em UTC,
não em horário de Brasília, gerando um total diferente do resto do app
pro "mesmo" período:** usuário comparou a soma dos 7 valores diários da
Home (21 a 27/08) com "Total de chamados" do Overview pro mesmo intervalo
— 1843 contra 1770, 73 de diferença. Causa: `date_trunc(granularidade,
started_at)` sem `at time zone 'America/Sao_Paulo'` — único lugar do
banco inteiro que faz isso, todo o resto (TFR/TTR, `minutos_uteis_entre_
time`, etc.) sempre converte pra BRT antes de truncar. O efeito: cada dia
UTC "vaza" as últimas 3h de um dia BRT pro rótulo do dia seguinte (BRT
21h-23h59 cai no dia UTC seguinte) — confirmado com dado real, cada
bucket UTC realmente se decompõe em duas fatias de dias BRT diferentes
(ex: UTC "21/08" = 73 chamados do fim do BRT 20/08 + 302 do BRT 21/08
de verdade). Também trocado `started_at` por `current_started_at` (não
era a causa da diferença nesse teste específico — os dois bateram igual
pra essa janela — mas `current_started_at` é o campo usado em toda outra
função do app, manter os dois é inconsistência sem motivo). Corrigido;
revalidado via RPC real: soma dos 7 dias voltou a bater exato com
Overview (1770 = 1770).

**Feature nova em 2026-08-27 — Administração → Metas, edita as metas de
SLA/CSAT direto no Hub:** `sla_config` já existia (regra única global,
`meta_primeira_resposta_min`/`meta_resolucao_min`) e já era lida por
`tfr_ttr_percentis()` pro "SLA cumprido %" de Velocidade — mas não tinha
UI nenhuma pra editar, só dava pra mudar via SQL direto. `api.ts` já
tinha `fetchSlaConfigPadrao`/`upsertSlaConfigPadrao` prontos, sem
nenhuma tela consumindo (mesma categoria de código morto-esperando-UI já
vista antes nesta sessão). Criada `AdminMetas.tsx`
(`/admin/metas`, aba nova em `AdminLayout.tsx`), formulário simples
(React Hook Form + Zod, padrão de sempre) com os 2 campos que já
existiam. Nesse mesmo lote, `sla_config` ganhou coluna `meta_csat
numeric` (pedido do usuário — "metas como... média CSAT") — populada
com `4.5` de default (mesmo corte já usado em "avaliações boas" no resto
do app). RLS já cobria a tabela inteira (`sla_config_write_admin`,
`is_admin()`), não precisou de policy nova. Validado no navegador:
formulário carrega os valores reais do banco, salvar grava de verdade
(testado com `meta_csat`, confirmado no banco, revertido pro default
depois). **`meta_csat` só está armazenada por enquanto** — nenhuma tela
ainda usa esse valor pra calcular um "SLA de CSAT cumprido" (diferente
de `meta_primeira_resposta_min`/`meta_resolucao_min`, que já alimentam
`tfr_ttr_percentis()`); aplicar esse valor em algum indicador de CSAT é
trabalho futuro, não pedido ainda.

**Feature nova em 2026-08-27 (mesmo dia, mais tarde) — botão "Baixar PDF"
na Reunião de Resultados, com o relatório completo do período filtrado:**
o usuário tinha recebido um relatório em PDF ("Resultados SAC" — Chamados,
Por tipo de cliente, Ranking, CSAT, Reabertura, Transferências, FCR/
Recontato) gerado como página HTML avulsa (Artifact) com dado real
congelado num instante específico, fora do Hub. Pedido: esse PDF devia
"vir" ao clicar em "Baixar PDF" dentro da própria aba de RR, respeitando
o filtro de período (granularidade/período) já selecionado na página, não
um snapshot fixo. Implementado `exportResultadosSacToPdf()` em
`src/lib/exportPdf.ts` (jsPDF, mesma biblioteca já usada por
`exportRRHistoricoToPdf`/`exportRRUnicaToPdf` nesse arquivo) — layout
próprio (helpers `linhaMetricas`/`tabela`/`tituloSecao`, sem retângulos
coloridos, seguindo o estilo grayscale-com-delta-verde/vermelho já
estabelecido pelos exports existentes desse arquivo, em vez de replicar o
visual mais editorial do Artifact original). `ReuniaoResultados.tsx`
ganhou um botão "Baixar PDF" novo (`Download`, ao lado do seletor de
período, **admin-only** — mesma barreira já usada no card "Detalhamento
por atendente" dessa página, porque o conteúdo é sempre agregado do time
inteiro) e 7 pares de `useQuery` (atual + anterior, mesma janela
granularidade/período da página) reaproveitando funções que **já
existiam** em `api.ts` desde as leves anteriores desta sessão
(`fetchContagemPeriodo`, `fetchTfrTtrPercentis`, `fetchMetricasPorTipoCliente`,
`fetchCsatDistribuicao`, `fetchReaberturaResumo`, `fetchTransferenciasResumo`,
`fetchFcrRecontatoResumo`) — nenhuma função SQL nova precisou ser criada.
Ranking (top 3 humano por volume) e a tabela de CSAT por atendente (todos,
bot incluso) não precisaram de query nova: derivados de `perfAtual`
(`fetchAtendentePerformance`), já buscado por essa página pro card
"Detalhamento por atendente" — exclusão do bot no Ranking usa
`operator_nome !== "IA Greenn"`, mesmo nome canônico usado em
`Performance.tsx`. Label do período anterior usa uma função nova,
`labelDoPeriodo()`, generalizando a lógica já existente em
`ultimosPeriodos()` pra qualquer par início/fim (o período anterior pode
cair fora da janela de 6 opções do dropdown, então não dava pra só buscar
na lista `periodos`). Validado: `tsc -b --noEmit` limpo, clique em
"Baixar PDF" no navegador sem erro de console, com a tabela
"Detalhamento por atendente" da mesma página já mostrando dado real no
momento do teste (confirma que as mesmas queries admin-only resolvem
corretamente). Os exports de histórico qualitativo existentes
(`exportRRHistoricoToPdf`/`exportRRUnicaToPdf`, texto de aprendizados/
dificuldades/plano de ação salvos em `rr_history`) foram mantidos sem
alteração — resolvem um problema diferente (nota qualitativa já salva)
do relatório quantitativo novo (métricas ao vivo do período filtrado).

**Refeito em 2026-08-27 (mesmo dia, logo em seguida) — "Baixar PDF" da
Reunião de Resultados trocou de jsPDF pra HTML real + impressão do
navegador, porque o jsPDF ficou feio:** usuário comparou com o relatório
"Resultados SAC" que tinha recebido antes como página HTML avulsa
(gerada fora do Hub, convertida pra PDF via Chrome headless — ver
histórico desta sessão) e pediu pra fazer "do mesmo jeito", deixando
claro que **não precisa ser PDF necessariamente**. Causa raiz do "feio":
jsPDF desenha texto/linhas em coordenadas manuais — não tem como aplicar
o design system real do Hub (cores, cards arredondados, sombra) sem
reimplementar tudo à mão feio, diferente da página HTML original que só
usava CSS de verdade. Solução: **removida por completo** a função
`exportResultadosSacToPdf()` (jsPDF) de `exportPdf.ts` — voltou a ter só
os 3 exports originais (histórico qualitativo de RR). No lugar, criado
`src/components/RelatorioResultadosSac.tsx`: o relatório inteiro
renderizado como JSX de verdade, com os componentes/tokens reais do Hub
(`Card`-style, `Badge` pra as tags "Crisp"/"Novo", paleta `forest`/`sand`/
`rust`/`sky` do `tailwind.config.ts`) — mesmas seções de antes (Chamados,
Por tipo de cliente, Ranking, CSAT, Reabertura, Transferências, FCR/
Recontato, Preencher manualmente). Tipos/dados extraídos pra
`src/lib/resultadosSac.ts` (`ResultadosSacData`, `deltaPercentual`/
`deltaPontos`/`fmtNum`/`fmtPct1`) — módulo puro, sem depender de jsPDF
nem de JSX, só a forma dos dados + a matemática de comparação com o
período anterior.

O componente abre como overlay em tela cheia (`fixed inset-0 z-50`)
dentro da própria `ReuniaoResultados.tsx` (estado `mostrarRelatorio`,
sem rota nova), com botão "Fechar" e um "Baixar PDF" que chama
`window.print()` — deixa o **navegador** renderizar o PDF (motor de
impressão real, preserva cor/fonte/layout perfeitamente, mesma técnica
que já tinha funcionado no relatório avulso anterior), em vez de
reimplementar isso manualmente. Pra isso não vazar a sidebar/header do
Hub no PDF impresso, `AppLayout.tsx` ganhou classes `print:hidden` na
sidebar e no header, e `print:block`/`print:overflow-visible`/
`print:h-auto`/`print:max-w-none` nos containers (sem isso, `overflow-y-
auto` + `h-screen` cortariam a impressão numa página só, do tamanho da
viewport). O overlay em si usa `print:static` (contrapondo o `fixed` de
tela) pra fluir como conteúdo normal multi-página na impressão; cada
card/linha/tabela tem `break-inside-avoid` pra não ser cortado ao meio
entre páginas.

Validado no navegador com dado real (admin, Agosto de 2026 vs Julho —
Julho sem dado real desde o reset de 2026-08-18, então os deltas
aparecem corretamente como "sem comparação" em vez de inventar
variação): todas as 7 seções renderizaram com número real, incluindo o
bucket "Sem tipo" em Por tipo de cliente e o bot "IA Greenn" aparecendo
na tabela de CSAT mas ficando de fora do Ranking (mesma exclusão do
Overview) — sem erro de console. **Achado de ferramenta, não de
código**: o clique via `computer`/coordenada nesta sessão de automação
não disparava o `onClick` do botão (o estado React nunca mudava, sem
erro nenhum — parecia um clique "fantasma"), mas um `.click()` via
`javascript_tool` direto no elemento funcionou normalmente — o app está
correto, foi só a forma de testar que precisou mudar. Não foi possível
tirar screenshot nesta sessão (Browser pane não estava aberto do lado do
usuário), então a fidelidade visual pixel-a-pixel do PDF impresso não
foi confirmada por captura de tela — a validação foi por conteúdo/
estrutura (texto renderizado) + reuso comprovado dos tokens reais do
Hub, não por imagem.

**Bug real corrigido em 2026-08-27 (mesmo dia, logo em seguida) — o PDF
impresso vinha com a página crua (KPIs, tabela, formulário em branco)
ANTES do relatório de verdade:** usuário mandou o PDF gerado pelo botão
novo ("Baixar PDF" → `window.print()`) e mostrou 2 das 6 páginas sendo a
tela normal da Reunião de Resultados, só a partir da página 3 começando
o relatório (`RelatorioResultadosSac`). Causa: `print:hidden` tinha sido
aplicado só na sidebar/header (`AppLayout.tsx`), mas nunca no resto do
conteúdo da PRÓPRIA página (`ReuniaoResultados.tsx`) — na tela, o overlay
`fixed inset-0` cobre tudo visualmente, mas a impressão converte
`fixed` pra `static` (via `print:static`, de propósito, pra fluir
multi-página), então sem esconder o resto explicitamente ele só virava
"mais um bloco depois dos outros" em vez de substituir a página. Corrigido
envolvendo todo o conteúdo normal (header/KPIs/meta/detalhamento/
formulário/histórico + os dois dialogs de visualizar/editar RR) num
`<div className="space-y-8 print:hidden">`, com o `RelatorioResultadosSac`
ficando de fora desse wrapper (irmão dele, dentro de um Fragment) —
único conteúdo que sobra na impressão a partir de agora. Validado via
JS no navegador: `overlayInsideWrap: false` (o relatório não é mais
descendente do wrapper escondido).

**Segundo problema relatado no mesmo lote — "botão de excluir não
funciona":** investigado do zero (RLS `rr_history_delete_admin` = só
`is_admin()`, função `is_admin()` correta, usuário com `role_nome =
'Administrador'` e `auth_id` vinculado — nada errado no banco) e
reproduzido no navegador: o clique chega em `excluirRR`/`confirm()`
normalmente. **Achado real, independente da causa original:**
`excluirRR` sempre gravava erro em `erroEdicao`, mas esse estado só é
renderizado dentro do formulário do dialog "Corrigir RR" — se o delete
falhar (por qualquer motivo: rede, sessão expirada, RLS) a partir do
ícone de lixeira da lista OU do botão "Excluir" dentro do dialog de
visualização, o erro nunca aparecia em lugar nenhum — parecia
"não fazer nada", exatamente o sintoma relatado. Corrigido com um estado
próprio `erroExclusao` (não reaproveita `erroEdicao`), renderizado em
dois lugares: acima da lista de Histórico (cobre o ícone de lixeira) e
dentro do dialog de visualização (cobre o botão "Excluir" de lá) — limpo
ao abrir um novo item (`setErroExclusao(null)` junto de
`setVisualizando(rr)`). Não foi possível reproduzir uma falha de delete
de verdade nesta sessão (RLS/dados confirmados corretos, e forçar uma
falha exigiria simular erro de rede ou mexer em permissão de propósito),
então o sintoma original mais provável é o mesmo `ReferenceError` de
estado stale do HMR já visto durante as edições rápidas desta sessão
(corrigido com hard reload) — mas o silêncio do erro em si era um bug
real e independente, que ficaria escondendo qualquer falha futura de
exclusão, corrigido por precaução.

**Feature nova em 2026-08-27 (mesmo dia, mais tarde) — filtro de "Tipo de
cliente" do Dashboard passou a valer pra página inteira, mesmo tratamento
já dado ao filtro de Atendente:** usuário filtrou por "Produtor" e
comparou o card de Velocidade (TFR médio 2h22min34s, time inteiro) com o
card "Por tipo de cliente → Produtor" (TFR médio 25min25s) — números
diferentes pro que parecia o mesmo filtro. Causa: `tipoClienteFiltro`
nunca foi passado pra nenhuma função SQL — `distinct_tipos_cliente()`/
`metricas_por_tipo_cliente()` nem aceitam esse parâmetro; o `<select>`
só filtrava a própria seção "Por tipo de cliente" no cliente
(`.filter((m) => !tipoClienteFiltro || m.tipo_cliente === tipoClienteFiltro)`),
igual ao filtro de Atendente antes de ser estendido (ver mais acima nesta
seção). Confirmado com o usuário: estender do mesmo jeito.

Criada `public.chamado_tem_tipo_cliente(coluna text, filtro text)`
— helper reusado por todas as funções abaixo, porque `tipo_cliente` é
lista separada por vírgula (mesmo tratamento de sempre): `filtro is null`
(sem filtro) **ou** `filtro = 'Sem tipo'` e a coluna não tem nenhuma tag
real (mesmo bucket sintético de `metricas_por_tipo_cliente`, alcançável
só clicando o card, não pelo `<select>`) **ou** a lista contém `filtro`.
Testado isoladamente (6 casos, todos corretos) antes de aplicar.

`p_tipo_cliente text default null` adicionado (mesmo padrão de sempre:
`DROP FUNCTION` explícito + `CREATE OR REPLACE`, checado 1 versão de cada
no fim) em 13 funções: `tfr_ttr_percentis` (Velocidade),
`atendente_performance` (Ranking — filtro novo de verdade, diferente do
de Atendente que é só client-side; **`csat_medio`/`total_avaliacoes`
continuam vindo de `csat_results` sem filtro**, ver próximo parágrafo),
`relogio_posse_periodo` (Posse — não tinha nem filtro de atendente
ainda, ganhou os dois tratamentos juntos), `contagem_periodo`,
`motivo_contato_resumo`, `relogio_espera_cliente`, `reabertura_resumo` +
`reabertura_casos`, `transferencias_resumo` + `transferencias_casos`,
`fcr_recontato_resumo` + `recontato_casos`, `backlog_por_idade` +
`backlog_casos` (essas duas nem tinham sido citadas no pedido original,
adicionadas por consistência — mesmo risco de "resumo≠casos" já corrigido
uma vez pra Transferências, ver seção 10 acima).

**Descoberta ao investigar `csat_distribuicao_notas`: CSAT não pode ser
filtrado por tipo de cliente, e isso não é um bug pra corrigir depois —
é estrutural.** `csat_results` (fonte do card de CSAT) não tem coluna
`tipo_cliente` nenhuma — tem `categoria_cliente`
(`Consumidor`/`Produtor`/`Não identificado`), populada por um node
diferente do n8n, com vocabulário diferente do `tipo_cliente` de
`crisp_conversations` (`Final`/`Produtor`/`Bluee`/`SDR`) — as duas tabelas
já são reconciliadas por sistemas de identidade separados (e-mail vs.
`operator_crisp_id`, decisão arquitetural documentada na seção 21), e a
categorização de cliente é mais um caso da mesma separação. Usar
`categoria_cliente` como aproximação seria enganoso (ex: filtrar por
"Bluee" ou "SDR" nunca bateria nada em `categoria_cliente`, que não tem
esses valores). Deixado de fora **de propósito**, com nota visível no
card explicando o motivo (hover) — mesmo padrão de transparência já usado
pra outras exclusões nesta sessão. `minutos_uteis_entre_time` (Relógio de
trabalho ativo) também ficou de fora — é sobre agenda/cobertura do time,
não sobre chamados, filtrar por tipo de cliente não faz sentido
semanticamente (mesma nota adicionada no card). `tempo_resposta_bot`
também não foi tocado (mesma exclusão já valia pro filtro de Atendente).

Frontend: `src/services/api.ts` ganhou `tipoCliente?: string` nas 13
funções (+ `fetchBacklogCasos`) correspondentes; `Performance.tsx` ganhou
`tipoClienteRpc = tipoClienteFiltro || undefined` (ao lado de
`atendenteNomesFiltro`) passado nas queries + incluído nas `queryKey`s
(sem isso o TanStack Query serviria cache velho ao trocar o filtro). O
rótulo do `<select>` no popover "Filtros" (antes "Tipo de cliente (seção
'Por tipo de cliente')") foi atualizado pra refletir o novo escopo, com
uma nota explicando a exceção de CSAT/trabalho ativo — mesmo padrão da
nota já existente pro filtro de Atendente logo acima dele no popover.

Validado com dado real do navegador (sessão autenticada, RLS real — MCP
não serve pra isso, `is_admin()` sempre falso por ali, ver lição já
registrada nesta seção): filtrando por "Produtor" na semana 21-27/08,
Velocidade e "Por tipo de cliente → Produtor" passaram a bater
exatamente (TFR médio 11min49s, TTR médio 10h2min54s, 316 chamados nos
dois lugares) — exatamente o sintoma relatado, confirmado corrigido.
Ranking também validado mudando de composição/ordem com o filtro
(Vittor continua 1º mas com 122 em vez de 389 atendimentos; Ana Paula
Maximiano de Souza entra em 2º, ausente do ranking geral top 3).

**Bug real corrigido em 2026-08-31 — `csat_results.classificacao_csat`
tem vocabulário inconsistente, e o módulo CSAT inteiro confiava nesse
texto cru pra classificar Promotor/Neutro/Detrator:** usuário mostrou
print do widget real de pesquisa da Crisp (5 níveis: Muito satisfeito/
Satisfeito/Neutro/Insatisfeito/Muito insatisfeito) e apontou que o Hub
só reconhece 3 (Promotor/Neutro/Detrator). Investigando o banco:
`classificacao_csat` **não é coluna gerada** (apesar de descrito assim
em versão anterior desta doc) — é texto solto gravado pelo n8n, e o
vocabulário mudou sem aviso: pra `nota=5`, 154 linhas têm `"Promotor"`
e 35 têm `"Muito satisfeito"`; pra `nota=4`, 13 `"Promotor"` e 3
`"Satisfeito"`; `nota=1` tem 12 `"Detrator"` e 1 `"Muito insatisfeito"`.
Toda comparação exata contra esse campo (`=== "Promotor"` etc.) **perdia
silenciosamente** qualquer linha gravada com o vocabulário novo — nos
KPIs "Promotores/Neutros/Detratores" do Dashboard de CSAT, no badge de
cada linha da Planilha, no filtro de Classificação (`.eq("classificacao_
csat", ...)` no Supabase), no popup de detalhe, em Meu Painel e no CSV
exportado. Confirmado com o usuário: manter Promotor/Neutro/Detrator
como estão hoje (badge + métrica), só corrigir a classificação por
baixo — não expor os 5 níveis brutos em lugar nenhum da UI.

Corrigido na raiz: `classificacaoPorNota(nota)` nova em `src/lib/
utils.ts` (`nota>=4` Promotor, `=3` Neutro, `<=2` Detrator — mesmo corte
já usado em `csat_distribuicao_notas()` no banco) — `nota` é sempre
confiável (inteiro 1-5, nunca teve esse problema de vocabulário), então
vira a única fonte de verdade; `classificacao_csat` nunca mais é
comparado por igualdade em lugar nenhum do código. Aplicado em
`Csat.tsx` (KPIs, badge da Planilha, contagem por colaborador),
`CsatDetalheDialog.tsx`, `MeuPainel.tsx` (badge + ordenação da coluna
Classificação) e `exportCsv.ts`. O filtro server-side em `api.ts`
(`fetchCsatFiltered`/`fetchCsatForDashboard`) trocou de `.eq("classificacao_
csat", x)` pra faixa de nota (`Promotor` → `nota>=4`, `Neutro` →
`nota=3`, `Detrator` → `nota<=2`). Tipo em `database.ts` afrouxado de
`"Promotor"|"Neutro"|"Detrator"|null` pra `string | null` com comentário
explicando pra nunca confiar nesse campo. Validado no navegador (período
"Este ano", dado real): Promotores+Neutros+Detratores agora soma
**exatamente** 228 = Total de avaliações (205+5+18) — antes da correção
essa soma ficava abaixo do total sempre que existisse linha com o
vocabulário novo no período, silenciosamente.

**Feature nova em 2026-08-31 (mesmo dia, mais tarde) — cards de "CSAT por
colaborador" viraram clicáveis (popup com as avaliações) e a lista passou
a ordenar por ordem alfabética:** pedido direto do usuário. Antes,
`porColaborador` (o `Array.from(map.entries())` que alimenta tanto os
cards quanto o `HorizontalBarChart` acima deles) não tinha nenhum sort —
a ordem era só a ordem de inserção no `Map`, essencialmente arbitrária
(a primeira vez que cada atendente aparecia em `dashboardRows`). Corrigido
com `.sort((a, b) => a.atendente.localeCompare(b.atendente, "pt-BR"))` no
fim do `useMemo`. O `HorizontalBarChart` continua ordenado por `percentual`
decrescente (faz um `[...porColaborador].sort(...)` próprio, independente
— não foi afetado, continua fazendo sentido pro gráfico mostrar do
melhor pro pior).

Cada `Card` ganhou `onClick`/`cursor-pointer`/hover (mesmo padrão visual
já usado nos cards de distribuição de nota da própria página) abrindo um
novo `Dialog` (estado `atendenteDetalhe: { chave, nome }`) com a lista de
avaliações daquele atendente no período filtrado — filtro client-side de
`dashboardRows` por `normalizarChave(...).chave` (mesma função já usada
pra agrupar `porColaborador`, então o popup nunca diverge do que o card
mostra). Cada linha da lista abre o `CsatDetalheDialog` já existente
(reaproveita o mesmo estado `detalhe` da Planilha — os dois dialogs
empilham, `Dialog` usa `z-50` fixo pros dois, e como o popup de
avaliações é renderizado antes do `CsatDetalheDialog` no JSX, o de
detalhe sempre pinta por cima quando os dois estão abertos). Validado no
navegador: clicar em "Ana Franca" abriu popup com as 2 avaliações reais
do período, nota/classificação batendo com o resumo do card.

**Ajuste no mesmo dia, logo em seguida — gráfico compacto "CSAT por
colaborador" (barras horizontais no topo da seção) também virou
clicável:** usuário reportou "não tá abrindo o popup no card do
operador". Reproduzindo com clique real (bubbling, não `.click()` direto
no container) nos cards grandes de baixo, o popup abria normalmente —
não achei bug ali. Suspeita mais provável: o relatório visual tem DOIS
elementos por atendente na mesma seção — o gráfico compacto
`HorizontalBarChart` (rótulos curtos tipo "Ana F. (24)") em cima, e os
cards grandes com avatar embaixo — só os cards grandes tinham `onClick`;
o gráfico de cima, apesar de já suportar `onBarClick`/`isSelected` (usado
em "Motivo de contato", Overview), nunca tinha recebido isso aqui.
Corrigido: `colaboradorPorPercentual` (o mesmo array ordenado que já
alimentava o gráfico) foi hoisted pra fora do JSX num `useMemo` — só
assim dava pra reaproveitar o índice que `onBarClick(label, index)`
devolve pra achar o registro certo — e o `HorizontalBarChart` ganhou
`onBarClick` abrindo o mesmo `atendenteDetalhe` dos cards. Agora os dois
pontos de clique (gráfico compacto e card grande) abrem o mesmo popup.

**Bug real corrigido em 2026-08-31 (mesmo dia, mais tarde) —
Transferências contava a 1ª atribuição de cada chamado como se fosse uma
transferência de verdade:** usuário estranhou "Origem (quem passou a
bola)" mostrando `"—": 13` igual ao total de "Chamados transferidos: 13"
— ou seja, TODAS as transferências do período eram "—", e perguntou se
era a IA. Investigado no banco: `operator_routing_history.previous_
operator_crisp_id` tem uma string vazia (`''`, não `null`) em ~810 linhas
só nos últimos 60 dias — confirmado com `row_number() over (partition by
session_id order by event_at)` que **100%** dessas linhas são o **1º**
evento de roteamento do chamado (nunca a 2ª em diante). Não é a IA nem
um operador sem alias — é o pipeline do n8n gravando "de ninguém pro
primeiro atendente" com string vazia em vez de `null`/sem gravar nada.
`transferencias_resumo()`/`transferencias_casos()` só filtravam
`previous_operator_crisp_id is not null` — `''` passa nesse teste, então
toda primeira atribuição de todo chamado do período estava sendo somada
como se fosse handoff entre dois humanos, inflando taxa/contagem/tempo
médio e poluindo a lista de Origem com um "—" enorme. Corrigido
adicionando `and previous_operator_crisp_id <> ''` ao lado do `is not
null` já existente, nas duas funções (`DROP FUNCTION` + `CREATE OR
REPLACE` de sempre, 1 versão confirmada de cada no fim). Validado via
`supabase.rpc(...)` no navegador (sessão real): pra "Este ano" (Jan-Ago),
de até 1000 casos retornados só 4 ficaram com origem nula — os poucos
casos legítimos de operador sem alias ainda cadastrado, não mais a massa
de primeiras-atribuições. Nenhuma outra função lê `previous_operator_
crisp_id` (`relogio_posse_periodo`/`atendimento_timeline` só leem
`operator_crisp_id`), então o bug ficou isolado a Transferências.

**Bug crítico de performance corrigido em 2026-08-31 (mesmo dia, mais
tarde) — filtro "Este ano" deixava Ranking/Posse/Espera do cliente sem
dado nenhum, por timeout silencioso:** usuário reportou não conseguir
clicar num atendente pra ver detalhes com "Este ano" selecionado; quase
em seguida, reportou também "Relógio de espera do cliente" e "Posse por
atendente humano" mostrando "Sem amostras"/"Sem chamados resolvidos" —
mensagens de UI genéricas de "sem dado", mas a causa real era outra.
Reproduzido via `supabase.rpc(...)` no console do navegador (sessão real
— MCP não serve, `is_admin()` sempre falso por ali):
`relogio_posse_periodo()` levava **25+ segundos e estourava o
`statement_timeout`** pra "Este ano" (Jan-Ago, ~3900 chamados) — o erro
do Postgres nunca chegava a aparecer pro usuário porque o frontend só
sabe renderizar "sem dado" quando a query falha (mesmo padrão de UX em
todo o Dashboard), escondendo que era timeout, não ausência real de
dado.

Causa raiz: o parâmetro `p_tipo_cliente` novo (adicionado mais cedo
nesta mesma sessão) fez o Postgres **estimar mal a cardinalidade** da
CTE `conversas_periodo` — com o filtro, o planner estimava 1303 linhas
quando o real são 3925 (confirmado via `EXPLAIN ANALYZE` isolado: sem o
filtro, `rows=3908` estimado vs. `3925` real; com o filtro cru,
`rows=1303` estimado) — porque `chamado_tem_tipo_cliente()` é uma
função opaca pro planner, sem estatística de seletividade nenhuma. Essa
estimativa errada, sozinha, não explica os 25s (a CTE em si roda em
~50ms mesmo errada) — o problema é que ela **se propaga** pelas ~15 CTEs
encadeadas de `relogio_posse_periodo` (window functions, joins,
múltiplos tiers), e cada join subsequente planeja em cima de um número
errado, degradando o plano inteiro. Tentativa 1 (envolver a chamada com
`p_tipo_cliente is null or chamado_tem_tipo_cliente(...)` direto no
`WHERE`) corrigiu o plano em teste isolado com **literal** SQL (Postgres
consegue eliminar a chamada de função inteira via constant-folding
quando o valor é literal, não parâmetro) mas **não resolveu a chamada
real via RPC** — a suspeita é que `p_tipo_cliente` como parâmetro
genuíno de uma função `LANGUAGE SQL` complexa (15+ CTEs) não recebe o
mesmo constant-folding que um literal recebe, mas isso não foi provado
com 100% de certeza (não dava pra reproduzir com `is_admin()=true` de
verdade via MCP sem arriscar segurança).

Fix definitivo, robusto independente do mecanismo exato: as 4 funções
mais afetadas (`relogio_posse_periodo`, `relogio_espera_cliente`,
`transferencias_resumo`, `transferencias_casos`) foram convertidas de
`LANGUAGE sql` pra `LANGUAGE plpgsql` com **branch explícito**
(`if p_tipo_cliente is null then ... else ... end if`) — o caminho
`is null` é **literalmente** a query original de antes desta sessão,
sem nenhum traço de `chamado_tem_tipo_cliente` no texto SQL executado,
então não há nada pro planner estimar errado nesse caminho (o preço é
duplicar o corpo da função nos dois branches — verboso, mas a única
garantia real). Achado no caminho: `RETURN QUERY` do plpgsql é mais
estrito que `LANGUAGE sql` sobre tipos de retorno — `sum(bigint)`
retorna `numeric`, e o `LANGUAGE sql` original tolerava isso via cast
implícito no contrato de retorno, mas plpgsql não; precisou de
`sum(...)::bigint` explícito em `relogio_posse_periodo`.

Validado via RPC real (sessão autenticada, "Este ano"): `relogio_posse_
periodo` **25.335ms (timeout) → 663ms**, 15 atendentes incluindo Vittor
Fernandes; `relogio_espera_cliente` (já não tinha nem sido testado
antes, mas tinha o mesmo padrão) **funcionando, 524ms, 74 amostras**;
`transferencias_resumo`/`transferencias_casos`, que não chegavam a dar
timeout mas estavam visivelmente degradadas (4,3s/3,9s), melhoraram pra
~2,6-2,8s — não perfeito, mas dentro do aceitável e sem erro. Confirmado
na UI real: com "Este ano", "Sem amostras" e "Sem chamados resolvidos no
período" sumiram, e clicar em "Vittor Fernandes" no Ranking abriu
"Chamados de Vittor Fernandes" normalmente.

**Pendência consciente**: as outras 9 funções que ganharam `p_tipo_
cliente` na leva anterior (`tfr_ttr_percentis`, `atendente_performance`,
`contagem_periodo`, `motivo_contato_resumo`, `reabertura_resumo`,
`reabertura_casos`, `fcr_recontato_resumo`, `recontato_casos`,
`backlog_por_idade`, `backlog_casos`) **não foram convertidas** — são
estruturalmente mais simples (sem a cadeia funda de CTEs/window
functions dos 4 acima), e o mesmo teste isolado nesta sessão mostrou só
uma degradação modesta (~13x, de 4ms pra 56ms num teste de
`conversas_periodo` sozinho) que não chega a estourar timeout mesmo pra
"Este ano" — mas é o mesmo bug de fundo, só sem o efeito cascata. Se
algum desses ficar lento/travado no futuro, o fix é o mesmo (branch
plpgsql).

**Feature nova em 2026-08-31 (mesmo dia, mais tarde) — "Exportar CSV" na
aba Atendimentos do Overview, respeitando os filtros ativos:** pedido
direto do usuário. A tabela de Atendimentos é paginada (`fetchAtendimentosComMetricas`,
`p_limit`/`p_offset` na função SQL), então exportar precisa buscar
**todas** as páginas, não só a visível — criada
`fetchTodosAtendimentosComMetricas()` em `api.ts`, que pagina em blocos
de 500 (bem abaixo do limite de linhas por resposta do PostgREST, 1000 —
mesmo limite já documentado nesta sessão pra `transferencias_casos`) até
`rows.length < 500` ou atingir o `total_count` devolvido na primeira
chamada. `exportAtendimentosToCsv()` novo em `exportCsv.ts` (mesmo
padrão de `exportCsatToCsv`/`exportEmRiscoToCsv` já existentes: Cliente,
e-mail, atendente, canal, tipo de cliente, status, timestamps, os 3
tempos calculados em segundos brutos — não formatados — e link do
chamado). Botão fica ao lado da busca por nome/e-mail, com estado
"Exportando..." desabilitado durante o fetch.

Validado no navegador com "Este ano" (~3932 chamados, o cenário mais
pesado possível hoje): completou em ~35-40s sem erro — lento, mas
correto, porque `atendimentos_com_metricas()` calcula `tempo_ativo_seg`
chamando `atendimento_timeline()` **por linha**, então exportar
milhares de linhas soma milhares de sub-chamadas. Pra períodos típicos
de uso real (semana/mês, dezenas a poucas centenas de linhas) fica na
casa de segundos. Não otimizado agora — funciona corretamente, só listado
aqui como candidato a melhoria futura caso "Este ano"/períodos muito
largos virem uso comum desse botão especificamente (diferente do
Dashboard, que já tinha sido otimizado pra esses períodos largos nesta
mesma sessão).

**Auditoria + feature nova em 2026-08-31 (mesmo dia, mais tarde) —
usuário conferiu um chamado real (Daniel Da Silva Alves, Vittor
Fernandes, `session_f2270b03-...`) que reabriu 2 vezes e continua aberto
até hoje, perguntando se a métrica de "Tempo até resolução" fica
incorreta nesse caso:** não é bug — é decisão de projeto já documentada
(seção "TTR: 1ª resolução vs. resolução final", 2026-08-19 nesta mesma
seção): `tempo_resolucao_seg`/TTR sempre usa a resolução **mais recente**
(`resolved_at`), então se/quando esse chamado resolver de vez, o TTR vai
incluir os ~13 dias corridos inteiros (incluindo os 2 trechos "resolvido,
aguardando reabertura" da reabertura) — proposital, porque do ponto de
vista do cliente o problema só ficou resolvido de verdade na última vez.
Quem quiser a velocidade só da 1ª tentativa (sem o ruído de reabertura)
já tem `ttr_primeira_resolucao_media`, card separado em Velocidade.
Confirmado no banco: `resolved_at is null`, `reopened_count = 2`,
batendo exatamente com as 2 linhas tracejadas "Sem atendente (resolvido,
aguardando reabertura)" no popup de detalhe — o timeline está correto.

Motivou um pedido em seguida: já que "Tempo até resolução" mostrava só
"—" pra esse chamado (ainda sem `resolved_at`), dava pra mostrar um
valor "ao vivo" (quanto tempo já decorreu, contando) em vez de vazio?
`atendimentos_com_metricas()` ganhou coluna nova `tempo_aberto_seg` —
preenchida **só** quando `resolved_at is null`, mesmo cálculo que
`tempo_resolucao_seg` passaria a usar se resolvesse agora
(`minutos_entre(current_started_at, now(), p_modo_tempo) * 60` — mesmo
toggle horas úteis/corridas de sempre). Deliberadamente uma **coluna
separada**, não reaproveitando `tempo_resolucao_seg`: esse último
continua null pra chamado aberto, então nenhum agregado (`tfr_ttr_
percentis()`, que nem lê esse campo) corre risco de misturar um valor
"ainda contando" com um TTR final de verdade. Renderizado em âmbar +
`title` explicando + sufixo "(em aberto, ainda contando)"/`*` nos 3
lugares que mostram esse tempo: `AtendimentoDetalheDialog.tsx`, a tabela
principal da aba Atendimentos e o popup "Chamados de {atendente}" — e
como coluna própria (não misturada) no CSV exportado. Validado no
navegador com o chamado real da auditoria: tabela e popup de detalhe
batem exato ("5d 4h 44min", horas úteis, crescendo a cada consulta como
esperado).

**Feature nova em 2026-08-31 (mesmo dia, mais tarde) — badge visual "🔄
Reaberto Nx" pra chamado que já reabriu:** mesmo chamado real da
auditoria acima (Daniel Da Silva Alves/Vittor Fernandes) motivou o
pedido — usuário viu "Tempo até resolução" ao vivo (`tempo_aberto_seg`,
feature anterior nesta mesma seção) e perguntou se dava pra pelo menos
sinalizar visualmente que o chamado já tinha sido fechado e reaberto
antes, já que isso não aparecia em lugar nenhum fora do popup de detalhe
(que já mostra os trechos "resolvido, aguardando reabertura" desde
2026-08-25). `atendimentos_com_metricas()` ganhou coluna nova
`reopened_count integer` — simples passthrough de
`crisp_conversations.reopened_count` (coluna já existente, populada pelo
pipeline de evento real desde 2026-08-18, ver seção 10 acima), via
`DROP FUNCTION` + `CREATE OR REPLACE` de sempre (confirmado 1 versão só
no fim). Frontend: `AtendimentoDetalheDialog.tsx` ganhou um `Badge
tone="warning"` ("🔄 Reaberto Nx") na fileira de badges do topo, com
`title` explicando que o tempo parado entre a resolução e a reabertura
entra na conta de "Tempo até resolução" quando (se) o chamado fechar de
vez de novo (mesma decisão de projeto já documentada — TTR sempre usa a
resolução mais recente). Um indicador `🔄` compacto (mesmo `title`) foi
adicionado ao lado do nome do cliente tanto na tabela principal da aba
Atendimentos quanto no popup "Chamados de {atendente}" — os 3 lugares
que já mostravam `tempo_aberto_seg` ganharam o mesmo tratamento, mesmo
padrão de "nunca deixar um popup e uma tabela divergirem" já seguido
várias vezes nesta sessão. Validado no navegador com o chamado real:
`dan97silv@gmail.com` aparece na tabela como "Daniel Da Silva Alves🔄",
e o popup de detalhe mostra "🔄 Reaberto 2x" — batendo exatamente com as
2 linhas "Sem atendente (resolvido, aguardando reabertura)" já visíveis
na timeline desse chamado.

Também confirmado nesse teste (pergunta direta do usuário: "o tempo é
somado ne? a cada reabertura") que **"Tempo ativo (atendente atual)" soma
corretamente os 3 trechos do mesmo atendente através das 2 reaberturas**,
não só o trecho mais recente: Vittor Fernandes aparece 3 vezes na
timeline desse chamado (23h7min53s + 22h10min52s + 5d18min, ainda
contando) e o total exibido bate exato (6d21h37min) — comportamento
correto desde o fix de gap-and-island de 2026-08-24 (ver acima nesta
seção), só nunca tinha sido reconferido especificamente pra esse caso de
2 reaberturas com o mesmo atendente dos dois lados.

**Bug real corrigido em 2026-08-31 (mesmo dia, mais tarde) — Ranking de
operadores do Analytics sempre mostrava "—" em 1ª resposta/Encerramento
pra TODO mundo, não só pra quem não tem conta no Hub:** usuário comparou
lado a lado com o Ranking do Overview (que mostra TFR/TTR reais pras
mesmas pessoas no mesmo período) e notou que só o CSAT batia — os tempos
do Analytics estavam vazios até pra Brenda/Ana Franca/Vittor/Eduardo, não
só pro "Não identificado" (esse sim deveria ficar vazio mesmo, sem
e-mail não tem como linkar). Causa: `operador_ranking()` calculava TFR/
TTR agrupando `crisp_conversations` por `cc.operator_email` e depois
fazia join com o CSAT (`t.operator_email = csat.email_atendente`) — mas
`operator_email` **nunca é preenchido pelo n8n**, confirmado 0 de 4021
linhas com esse campo populado (mesmo achado já documentado em
2026-08-18 pra outros lugares, mas essa função específica nunca tinha
sido corrigida — escapou daquela varredura porque foi criada/nunca
revisitada depois). Um `left join` contra uma coluna sempre `NULL` nunca
casa nenhuma linha, então `tfr_seg`/`resolucao_seg` saíam sempre `NULL`
pra qualquer operador, mascarado atrás do mesmo "—" que um operador
sem dado real mostraria.

Corrigido trocando a chave de agrupamento/join: em vez de
`operator_email`, `tempos` agora agrupa por
`nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome)`
— mesma reconciliação por ID já usada em `atendente_performance()`
(Overview) — e o join final passou a ser por **nome canônico**
(`t.atendente_canonico = csat.atendente`), não por e-mail. CSAT continua
com sua própria identidade por e-mail (`normalizar_nome_atendente`/
`atendente_aliases`, decisão arquitetural já documentada — seção 21) —
a ponte entre os dois sistemas pra esse ranking específico é o nome
canônico resultante de cada um, único ponto em comum entre as duas
fontes. Validado no navegador (sessão real, "01/01/2026 - 31/08/2026"):
todos os 7 operadores nomeados passaram a mostrar TFR/Encerramento reais
(ex: Brenda 17min52s/13h9min20s, Vittor 6h48min25s/1d17h39min) —
só "Não identificado" (50 avaliações sem e-mail, achado à parte nesta
mesma sessão) continua "—", corretamente, por realmente não ter como
linkar. Números do Analytics não batem exatos com os do Overview pra
mesma pessoa/período (ex: Vittor 6h48min no Analytics vs. 29min no
Overview) — não é bug, é esperado: `operador_ranking()` nunca teve o
toggle Horas úteis/Horas corridas do Overview, sempre foi tempo de
relógio cru, e essa função não recebeu esse conceito nesta correção
(fora de escopo — o bug era o join quebrado, não a ausência do toggle).

**Página removida em 2026-08-31 (mesmo dia, mais tarde) — módulo "Em
Risco" (`/em-risco`) excluído por pedido direto do usuário:** removido
`src/pages/EmRisco.tsx` inteiro, a rota em `App.tsx`
(estava dentro do mesmo `<AdminOnlyRoute />` de `/performance`), o item
de sidebar e a entrada em `GlobalSearch.tsx` (`AlertOctagon` removido dos
imports dos dois arquivos, já que não sobrou nenhum outro uso do ícone
neles), e `exportEmRiscoToCsv()` de `exportCsv.ts` (só era usada por essa
página). A linha correspondente em `public.modules` (slug `em_risco`,
reservada desde a Fase 1) também foi apagada — confirmado antes 0 linhas
em `user_permissions` referenciando esse `module_id`, então não existia
nenhuma concessão real presa a ela. `fetchAtendimentosComMetricas`/
`fetchDistinctCanais`/`fetchDistinctAtendentesConversas` **não** foram
tocadas (compartilhadas com a aba Atendimentos do Overview). O parâmetro
`somenteRisco`/`p_somente_risco` em `atendimentos_com_metricas()` ficou
como está — só era usado pelos dois call-sites desta página — em vez de
mexer de novo na assinatura dessa função compartilhada só pra tirar um
parâmetro agora inofensivo; mesma categoria de código morto já tolerada
várias vezes nesta sessão (`horario_por_nome`, overloads de
`duracao_dentro_expediente`), candidato a limpeza futura se algum dia
alguém for mexer nessa função por outro motivo. Validado: `tsc -b
--noEmit` limpo, e no navegador — sidebar sem o item, `/em-risco`
carrega em branco (sem crash; mesmo comportamento que qualquer URL
inexistente já teria nesta app, que não tem rota catch-all/404 — não
introduzido por esta remoção), e o resto do Overview (Dashboard/
Atendimentos) continuou funcionando normalmente.

**Ajuste no Ranking de operadores do Analytics em 2026-08-31 (mesmo dia,
mais tarde) — 3 pedidos do usuário:** (1) removido o card "Operador
destaque" (troféu + CSAT médio) acima da tabela — usuário achou
dispensável; (2) `#1` deixou de ser quem tem o melhor CSAT e passou a
ser quem tem **mais chamados** — trocado o `row_number() over (order by
csat.csat_medio desc nulls last)` de `operador_ranking()` por `order by
csat.total_chamados desc` (mesma função corrigida mais cedo nesta seção
pro bug do join quebrado); como a ordem padrão da tabela (antes de
clicar em qualquer cabeçalho) também vem desse `posicao`, o efeito é os
dois de uma vez — número do badge e ordem inicial das linhas; (3)
adicionada coluna **"Avaliações"** (`total_avaliacoes`) — o dado já
vinha da função desde sempre, só não era renderizado na tabela; ganhou
`SortableHeader` como as outras colunas numéricas (`RankingCampo`
estendido com `"total_avaliacoes"`). `Trophy` removido dos imports
(ficou sem nenhum outro uso depois do card sair). Validado no navegador:
"#1 Vittor Fernandes" com 69 chamados (era o card do troféu que mostrava
"Brenda Coutinho" antes, por ter o melhor CSAT com poucos chamados),
coluna "Avaliações" com os mesmos números de "Chamados" (nesta base cada
avaliação de CSAT é um chamado, então as duas colunas coincidem hoje —
mas são conceitos diferentes, por isso continuam separadas).

**Bugs corrigidos em 2026-08-31 (mesmo dia, mais tarde) — popup "Registro
do dia" do Calendário, achados numa auditoria pedida pelo usuário
("essa aba de cadastro em calendario, ta bem merda"):**

1. **4 modais reimplementados manualmente, nunca migrados pro componente
   `Dialog` compartilhado**: `dialogFolga`/`dialogSobreaviso` (inline) e
   `FeriasDialog`/`LancamentoDialog` (funções à parte) — todos com o
   markup manual `fixed inset-0 z-[60] flex items-center justify-center
   bg-ink/40 p-4` + `<Card>`, o exato padrão que o componente `Dialog`
   foi criado pra substituir em toda a plataforma (seção 11/13, adotado
   "em todos os modais da aplicação" em sessão anterior) — só esses 4
   nunca tinham sido migrados. Consequência prática, não só estética:
   nenhum dos 4 fechava com **Escape** (`Dialog` tem um `keydown`
   listener próprio; o markup manual não tinha nenhum), e nenhum expunha
   `role="dialog"`/`aria-modal`. Migrados os 4 pra `<Dialog onClose=
   {...}>`, removendo o wrapper manual e o `<Card>` interno (o `Dialog`
   já aplica o mesmo estilo de card). O drawer lateral que mostra o
   detalhe do dia (`fixed inset-0 z-50 flex justify-end`, desliza da
   direita) foi **deixado como está de propósito** — é um padrão
   diferente (painel lateral, não modal centralizado), `Dialog` não se
   aplica a ele. Validado no navegador: "Solicitar Folga" agora tem
   `role="dialog"`/`aria-modal="true"` e fecha com Escape (confirmado
   despachando o evento diretamente, já que o clique via ferramenta de
   automação mostrou de novo o mesmo artefato de corrida com o estado do
   React já documentado nesta sessão — checar em duas chamadas
   sequenciais, não uma só, resolveu).
2. **Colaborador inativo aparecia nos seletores de escala**: `usuarios`
   vem de `fetchUsers()` (compartilhada, sem filtro de `ativo` de
   propósito — Administração → Usuários precisa listar todo mundo) — mas
   o Calendário usava essa lista crua direto nos 4 seletores de "quem
   fica responsável" (semana, sábado, sobreaviso, férias), então
   **Brenda Coutinho** (`ativo = false` desde 2026-08-24, ver acima
   nesta seção) continuava aparecendo como opção pra virar responsável
   da semana meses depois de ter saído do time. Corrigido com
   `usuariosAtivos = useMemo(() => (usuarios ?? []).filter(u => u.ativo),
   [usuarios])`, usado nos 4 lugares em vez da lista crua. Validado no
   navegador: dropdown "Definir responsável da semana" foi de 6 pra 5
   nomes, Brenda não aparece mais.

Escopo do que ficou de fora, por não ter direção específica ainda: a
fileira de 5 botões (Solicitar Folga/Sobreaviso/Férias/Lançamento/Limpar)
continua igual — o usuário também apontou "visual poluído" de forma
geral, mas uma reorganização desses botões (agrupar, virar menu, etc.)
é uma decisão de design que ainda não foi alinhada; os dois problemas
concretos e verificáveis (modal sem Dialog, inativo no seletor) foram os
corrigidos nesta leva.

**Feature nova em 2026-08-31 (mesmo dia, mais tarde) — modo escuro
completo, com botão no Header:** pedido explícito do usuário, escolhendo
de propósito a opção "tema completo" (não só o botão) numa pergunta de
escopo — o Tailwind já tinha `darkMode: "class"` configurado, mas zero
`dark:` em uso em qualquer lugar da base até este ponto.

Arquitetura escolhida: em vez de adicionar `dark:` em toda classe de cor
de todo componente (inviável para uma base deste tamanho), `ink` e
`sand` — os dois tokens neutros usados em praticamente 100% do texto/
fundo/borda da plataforma — viraram variáveis CSS (`--color-ink-*`/
`--color-sand-*`, formato "R G B" pra suportar os modificadores de
opacidade do Tailwind tipo `text-ink/50`, que não funcionam com `var()`
puro) definidas em `src/index.css` (`:root` = claro, `.dark` = escuro) e
referenciadas em `tailwind.config.ts` como `rgb(var(--x) / <alpha-value>)`.
Resultado: qualquer componente que já usava `bg-sand-surface`/`text-ink`/
`border-sand-line` (a esmagadora maioria da UI — `Card`, `Dialog`,
tabelas, inputs) passou a funcionar em dark mode **sem nenhuma edição**,
só por herdar o valor novo da variável quando `.dark` está presente em
`<html>`.

Paleta escura escolhida (não é inversão automática, foram valores
desenhados à mão): fundo quase-preto neutro-frio (`sand-bg` #14161A),
superfície de card um tom acima (`sand-surface` #1C1F24), texto principal
quase-branco (`ink` #EEF0F2), texto secundário cinza médio (`ink-soft`
#9CA3AF, mesma família do slate do Tailwind). As cores de marca/acento
(`forest`/`amber`/`rust`/`sky`/`violet`, tons 400-900) foram **mantidas
como estão** nos dois temas — só os tons "50" (fundo bem claro + texto
"700", usado como preenchimento de badge/chip/ícone-circular em ~15
lugares) precisavam de tratamento especial, porque um fundo quase-branco
sólido destoa muito de um card escuro: esses viraram
`dark:bg-{cor}-500/15 dark:text-{cor}-400` (preenchimento translúcido da
própria cor de acento sobre o fundo escuro, com texto mais claro pra
manter contraste) — corrigido centralizadamente em `Badge.tsx` e
`Avatar.tsx` (os 2 componentes mais reutilizados que tinham esse padrão)
e depois em cada uso solto encontrado por auditoria (`grep -E
"bg-(forest|amber|rust|sky|violet)-50([^0-9]|$)"`, com cuidado extra pra
não confundir com `bg-forest-500` — mesmo bug de substring que já
aconteceu antes nesta sessão): `Kpi`, `EmptyState`, `DateRangePopover`,
`GlobalSearch`, `BarChart`, e cerca de 15 usos soltos em páginas
(ícone-circular de destaque em Home/Documentação/OutrosLinks/
AdminOverview/AdminOutrosLinks/Atualizacoes, avatar-like em Csat/Perfil,
badge de moedas em MeuPainel, chip de filtro ativo em Csat/Performance,
cor de dia especial no grid do Calendário). `sky-400` e `forest-200`
foram adicionados à paleta (não existiam — precisos pro texto/borda dos
novos estados; `forest-200` corrigiu de graça um `border-forest-200`
que já estava transparente por shade inexistente, mesma categoria do fix
de `rust-400`/`rust-100` de 2026-08-24). **Deliberadamente fora**: o
componente `RelatorioResultadosSac.tsx` (relatório pra impressão/PDF) —
mantido sempre claro de propósito, ninguém quer PDF em fundo preto.
`Sidebar.tsx` também ficou intocado — já é `bg-forest-900` fixo
independente de tema, nunca usou os tokens `sand`/`ink`.

Também convertido `bg-white` → `bg-sand-surface` em ~23 arquivos (sed
em massa, seguro porque `sand.surface` já era literalmente `#FFFFFF` no
claro — zero mudança visual antes do dark mode existir) — sem isso, todo
input/select/popover que usava `bg-white` cru (não o token) continuaria
branco sólido mesmo com o tema escuro ativo. Excluídos do sed:
`Sidebar.tsx` (2 usos de `bg-white/5` como hover sobre o verde escuro
fixo, sem relação com o tema) e `RelatorioResultadosSac.tsx` (mesma
razão do parágrafo acima).

Mecanismo do toggle: `src/hooks/useTheme.ts` (novo) — `useState`
inicializado lendo a classe já presente em `<html>`, `useEffect` que
adiciona/remove `.dark` e persiste em `localStorage`
(`hub-sac:tema`). Um script inline em `index.html` (antes de
`main.tsx` montar) já aplica a classe no primeiro paint — lê
`localStorage`, cai pro `prefers-color-scheme` do SO só na primeira
visita (nunca mais depois que o usuário toca no botão uma vez) — evita o
flash de tema claro→escuro que aconteceria se só o React aplicasse a
classe depois de montar. Botão novo em `Header.tsx`, à direita do sino
de notificações (posição pedida explicitamente): ícone `Moon`/`Sun`
(lucide-react) que alterna conforme o tema atual.

Validado no navegador: toggle liga/desliga corretamente (confirmado via
`localStorage`/classe/cores computadas, não só visual), sobrevive a
reload (script inline funcionando), e uma varredura em 4 páginas
diferentes (Home, CSAT, Overview, Calendário) confirmando **zero
elementos com `background-color: rgb(255, 255, 255)`** no modo escuro —
nenhum branco sólido escapou. Não testado exaustivamente em todo `/admin/*`
nem em Reclame Aqui/NPS/Missões/Helpdesks/Outros Links/Cursos/
Documentação linha a linha — esses reaproveitam os mesmos tokens/
componentes já corrigidos, risco residual baixo, mas vale um olhar se
algo destoar ao usar essas telas de verdade.

**Feature grande em 2026-08-31 (mesmo dia, mais tarde) — autocadastro com
aprovação de admin, redefinir senha e login com Google, somando ao
convite manual que já existia:** usuário trouxe a spec de um login de
outro projeto seu ("da centralização") pedindo algo parecido. Planejado
em modo de planejamento formal antes de mexer em qualquer código, dado o
histórico sensível dessa área (seção 5: vínculo `auth_id` quebrado já
derrubou o Hub duas vezes em produção).

- **Schema**: `public.users` ganhou `aprovado boolean not null default
  true` — todo usuário existente (todos criados por convite/admin até
  hoje) já nasce aprovado automaticamente, sem precisar de backfill à
  parte. Só os dois caminhos novos (autocadastro, primeiro login via
  Google) inserem `aprovado: false` explicitamente.
- **Achado de segurança durante o planejamento, corrigido junto**: a
  policy `users_update_own_or_admin` deixava qualquer usuário atualizar
  a própria linha sem restringir quais colunas — inofensivo antes, mas
  assim que `aprovado` passou a controlar acesso de verdade, um usuário
  pendente poderia chamar a API do Supabase direto e se auto-aprovar
  (`update users set aprovado = true where auth_id = auth.uid()`).
  Corrigido com `prevent_self_privilege_escalation()`, trigger `before
  update on public.users` que reseta `NEW.aprovado`/`NEW.role_id`/
  `NEW.auth_id` de volta pro valor antigo sempre que quem edita não é
  admin (`is_admin()`) — silencioso, não quebra o resto do update.
  **Validado com um usuário pendente real**: a chamada retorna sucesso
  (a policy de RLS libera, é a própria linha do usuário), mas a linha
  devolvida continua com `aprovado: false` — o trigger neutralizou a
  tentativa sem gerar erro nenhum pro cliente.
- **Duas Edge Functions novas**, mesmo padrão de segurança da
  `invite-user` já existente (service role key nunca exposta ao
  cliente; se o insert em `public.users` falhar, desfaz o usuário criado
  no Auth — nunca deixa `auth_id` órfão):
  - `self-signup` (pública): valida `@greenn.com.br` **no servidor**
    (a validação client-side no formulário é só UX), cria o usuário via
    `admin.createUser()`, insere em `public.users` com `aprovado: false`
    e os mesmos defaults de horário que `invite-user` já usa.
  - `complete-oauth-signup` (exige sessão): chamada automaticamente pelo
    `AuthContext` quando uma sessão nova não tem `public.users`
    vinculado **e** veio do provider Google
    (`session.user.app_metadata.provider === "google"`, sinal do
    próprio Supabase Auth, não forjável pelo cliente — outros casos de
    perfil ausente continuam caindo no erro explícito de sempre, sem
    tentar se auto-curar, pra não mascarar um vínculo quebrado de
    verdade como os 2 incidentes já documentados). Extrai o e-mail do
    **JWT do próprio chamador** (nunca de um campo enviado no corpo, o
    que abriria brecha pra spoofing), e se o domínio não bater, apaga o
    usuário do Auth recém-criado pelo OAuth em vez de deixá-lo órfão.
- **Achado real durante os testes — mensagem de erro genérica escondia o
  motivo real**: `functions.invoke()` do supabase-js, quando a função
  responde com status não-2xx, joga tudo em `error` (um
  `FunctionsHttpError` genérico — "Edge Function returned a non-2xx
  status code") e `data` vem `null` — a mensagem específica que a Edge
  Function tentou mandar (`json({error: "..."}, 400)`) só existe dentro
  de `error.context` (a `Response` crua), nunca em `data.error`. Esse
  bug já existia silenciosamente em `inviteUser()` desde que essa função
  foi criada (mesmo padrão `if (error) throw error; if (data?.error)
  throw ...`) — só nunca tinha sido notado porque convite por admin
  raramente falha. Corrigido criando `invokeFunction()` (helper
  compartilhado em `api.ts`) que tenta ler `error.context.json()` antes
  de desistir pra mensagem genérica, usado agora pelas 3 funções
  (`inviteUser`, `signUpUser`, `completeOAuthSignup`).
- **Achado real durante os testes — trigger pré-existente bloqueava
  qualquer insert em `public.users` vindo de uma Edge Function**: ao
  testar o autocadastro de ponta a ponta, o insert falhava com "DELETE
  requires a WHERE clause" — nada a ver com o autocadastro em si.
  Causa: `trg_users_cobertura_semanal` (criado em 2026-08-24, ver seção
  10 acima) dispara `refresh_cobertura_semanal()` a cada insert/update
  de `ativo`/horário em `public.users`, e essa função começava com
  `delete from public.cobertura_semanal;` sem `WHERE` — funcionava pra
  chamadas via SQL direto (inclusive a mesma linha inserida direto por
  SQL, testado), mas algo na camada de Data API/PostgREST usada pelo
  `adminClient.from("users").insert(...)` da Edge Function rejeita
  DELETE sem WHERE nesse caminho especificamente (mecanismo exato não
  totalmente identificado, mas isolado com certeza: SQL direto via MCP
  funcionava, o mesmo insert via Edge Function não). Corrigido trocando
  pra `delete from public.cobertura_semanal where dow between 0 and 6;`
  — mesmo efeito (limpa as 6 linhas), só com `WHERE` sintático — sem
  mudar nenhum comportamento da função. Como esse trigger dispara pra
  **qualquer** insert/update de usuário com horário preenchido (não só
  autocadastro), esse bug provavelmente já afetaria `inviteUser()`
  também se fosse chamado pela Edge Function em vez de direto — não
  confirmado porque não foi reproduzido nesse caminho, só documentado
  aqui como risco caso apareça de novo.
- **Frontend**: `src/components/ui/PasswordInput.tsx` (novo,
  reutilizável — olho pra mostrar/ocultar senha) usado em `Login.tsx`
  (entrar + criar conta) e `DefinirSenha.tsx` (que passou a ser
  reaproveitada tanto pro fluxo de convite quanto pro de redefinir
  senha — mesmo mecanismo técnico dos dois, sessão já estabelecida a
  partir do token na URL + `auth.updateUser({password})`, não fazia
  sentido duplicar rota); `senha mínima` subiu de 6 pra 8 caracteres ali
  também, pra ficar consistente com a regra nova do autocadastro.
  `Login.tsx` inteiro redesenhado: fundo com gradiente + 6 blobs
  desfocados animados (`@keyframes blob-float` em `index.css`,
  `prefers-reduced-motion` desativa), `SegmentedControl` já existente
  fazendo o papel das abas Entrar/Criar conta (sem componente de Tabs
  novo), fluxo de "Esqueci minha senha" inline (`resetPasswordForEmail`),
  botão "Entrar com Google" (`signInWithOAuth`). Nova página
  `AguardandoAprovacao.tsx`, renderizada por `RequireAuth.tsx` no lugar
  do `<Outlet />` quando `user.aprovado === false` (sem rota própria).
  `Administração → Usuários` ganhou badge "Pendente aprovação"
  (sobrepõe o badge de ativo/inativo) + botão de aprovar (ícone check,
  `upsertUser({id, aprovado: true})`, mesmo padrão exato de
  editar/excluir já existentes ali).
- **Fora do meu alcance — configuração externa que o usuário precisa
  fazer**: login com Google só funciona de ponta a ponta depois de (1)
  criar uma credencial OAuth 2.0 no Google Cloud Console e (2) colar o
  Client ID/Secret em Supabase Dashboard → Authentication → Providers →
  Google. Validado que o botão dispara `signInWithOAuth` corretamente e
  o Supabase responde `"Unsupported provider: provider is not enabled"`
  — erro esperado, confirma que só falta a configuração externa.
- **Validado de ponta a ponta no navegador** (sessão real, não MCP):
  cadastro com e-mail fora do domínio rejeitado no cliente; cadastro
  com `@greenn.com.br` válido criou o usuário real (`aprovado: false`
  confirmado no banco); login com essa conta caiu em "Sua conta ainda
  não foi aprovada" (não no Hub); tentativa de auto-aprovação via API
  direta bloqueada pelo trigger (testado, ver acima); "Esqueci minha
  senha" enviou o link sem erro. **Não validado**: o clique em "Aprovar"
  como admin de verdade — a sessão de admin ativa foi encerrada durante
  os testes (logout deliberado pra conseguir ver a tela de login) e não
  havia credencial disponível pra logar de volta programaticamente;
  fica uma conta de teste real pendente
  (`teste.qa.signup@greenn.com.br`) no banco, pronta pra ser aprovada
  manualmente como último passo de verificação.

**Bug real corrigido em 2026-08-31 (mesmo dia, mais tarde) — popup
"Chamados de {atendente}" (Overview) não paginava, mostrava só os 50
primeiros chamados sem nenhum aviso:** achado pelo usuário perguntando
diretamente se o popup mostrava todos os chamados do Vittor (468 no
período "Este ano") — não mostrava. A query desse popup sempre chamou
`fetchAtendimentosComMetricas` com `page: 0, pageSize: 50` fixo, sem
nenhum controle de paginação nem exibição do total — diferente da aba
Atendimentos e do popup de Backlog, que já paginam de verdade. Corrigido
replicando exatamente o mesmo padrão dessas duas (estado `posseDetalhePage`,
`pageSize: PAGE_SIZE` como o resto da página, rodapé "N chamados /
Anterior / Página X de Y / Próxima"); os dois pontos que abrem esse popup
(clique numa linha do Ranking, clique no card do bot) resetam a página
pra 0. Não validado ao vivo no navegador — a sessão de admin foi encerrada
durante os testes do login (ver acima nesta seção) e não havia como logar
de volta sem a senha real; a correção é uma cópia estrutural do padrão já
comprovado nesta mesma tela, risco baixo, mas fica marcado como pendente
de conferir visualmente na próxima vez que alguém abrir o Overview.

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

## 13. Convenções de UI/UX

- **Paleta**: `forest` (verde, cor de marca — ações primárias, destaque de
  sucesso), `sand` (fundo/superfície neutros), `amber` (alerta/atenção),
  `rust` (erro/perigo), `sky` (informação), `violet` (ausência/férias/
  folga). Definidas em `tailwind.config.ts`, nunca usar cores hex soltas
  no JSX — sempre pelas classes do tema.
- **Modo escuro** (desde 2026-08-31, ver seção 10 para o histórico
  completo): `ink`/`sand` são variáveis CSS (`.dark` em `<html>` troca o
  valor), então `bg-sand-surface`/`text-ink`/`border-sand-line` já
  funcionam nos dois temas de graça — nunca use `bg-white` cru (vira
  branco sólido preso, mesmo no escuro). Cores de acento (`forest-500`
  etc.) não trocam de valor entre temas, mas os tons **"50"** (fundo
  bem claro + texto "700", usado em badge/chip/ícone-circular) precisam
  de um par manual `dark:bg-{cor}-500/15 dark:text-{cor}-400` toda vez
  que forem usados — não existe atalho automático pra esse padrão
  específico (ver `Badge.tsx`/`Avatar.tsx` como referência).
- **Tipografia**: Inter (`font-display`/`font-body`), IBM Plex Mono
  (`font-mono`, não usado hoje em nenhuma tela identificada). Tamanhos
  semânticos custom: `text-display`, `text-card-title`, `text-legenda`,
  `text-kpi-lg`, `text-micro`.
- **Raio de borda**: `rounded-xl`/`rounded-2xl` em praticamente todo
  elemento (cards, inputs, botões, modais) — nunca `rounded-none`/`rounded-sm`
  sem motivo.
- **Sombras**: `shadow-card` (base), `shadow-soft`, `shadow-float` (modais,
  sidebar expandida) — não usar `shadow-lg`/`shadow-xl` padrão do Tailwind.
- **Layout de página**: container global `max-w-[1600px]` centralizado
  (`AppLayout.tsx`), sidebar fixa recolhível (72px colapsada, 240px
  expandida, expande no hover ou fixada por clique).
- **Modais**: usar `<Dialog onClose={...}>` (`src/components/ui/Dialog.tsx`)
  envolvido pelo `{condicao && <Dialog>...}` do estado local — não recriar o
  markup `fixed inset-0 ... bg-ink/40` manualmente. Passe `className` para
  ajustar `max-w-*`/altura quando o formulário for maior que o padrão
  (`max-w-md`).
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
   element={<AppLayout />}>` (autenticado). Se for admin-only, envolver em
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

1. Definir e aplicar o schema diretamente no projeto Supabase
   ("Centralização - SAC") — colunas, constraints, RLS. **Isto acontece
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
   isso, removida em 2026-08-18, ver seção 10).
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
| Analytics | `/analytics` | Todo autenticado — painel leve (indicadores básicos, evolução, distribuição por canal/status/tópico, ranking exige permissão `analytics`* ou admin) |
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
| Overview (ex-Performance) | `/performance` | Admin-only estrito — página principal pro admin bater o olho no time inteiro; aba "Dashboard" (ex-"Ranking") concentra CSAT boas/neutras/ruins, ranking de atendentes, Velocidade (TFR/TTR com percentis), Backlog, Relógios (posse/espera) e Motivo de contato; aba "Atendimentos" é só a lista crua de chamados (era uma página própria `/atendimentos` até ser incorporada aqui) |
| Administração (Usuários, Perfis, Permissões, Escalas, Metas, Cursos, Documentação, Atualizações, Outros Links) | `/admin/*` | Admin-only estrito |

\* README menciona uma permissão granular "Analytics" para liberar
ranking/destaque; não confirmado se o slug `analytics` está de fato
cadastrado em `public.modules` — conferir antes de assumir.

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
  referência — ver seção 10 para o diagnóstico completo.
- Reunião de Resultados corrigida (fonte errada de dados: CSAT/atendimentos
  zerados pra admin) e Analytics corrigido (KPI "Total de chamados" que
  sempre repetia "Total de avaliações", gráfico de evolução sempre vazio
  por `JOIN` num campo sempre nulo) — ver seção 10.
- RR ganhou edição, exclusão admin-only, campos opcionais (plano de
  ação/objetivos), exportação em PDF (histórico ou RR única), dialog de
  visualização por card, e detalhamento por atendente (chamados/avaliações
  x período anterior, mensal ou semanal) — ver seção 10.

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
- **Guards admin-only de `/atendimentos`, `/performance`, `/admin/*`** —
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
   pendências) — não só o `README.md`.
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
