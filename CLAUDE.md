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
   `user`, redireciona para `/login`.
6. `Login.tsx` chama `auth.login(email, senha)` →
   `supabase.auth.signInWithPassword`. Não há cadastro público nem "esqueci
   minha senha" implementados na UI — contas são criadas manualmente
   (Supabase Auth + registro em `public.users` via Admin → Usuários).
7. Logout: `auth.logout()` → `supabase.auth.signOut()`.

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
| Em Risco | `/em-risco` | Admin-only estrito — chamados abertos ordenáveis por tempo em aberto/TFR, com filtros de atendente/status/canal e exportação CSV |
| Administração (Usuários, Perfis, Permissões, Escalas, Cursos, Documentação, Atualizações, Outros Links) | `/admin/*` | Admin-only estrito |

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
