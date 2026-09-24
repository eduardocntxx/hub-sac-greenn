import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/layouts/AppLayout";
import { AdminOnlyRoute } from "@/routes/ProtectedRoute";
import { RequireAuth } from "@/routes/RequireAuth";
import { RequirePermission } from "@/routes/RequirePermission";
import { RouteBoundary } from "@/components/RouteBoundary";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

import Login from "@/pages/Login";
import MeuPainel from "@/pages/MeuPainel";

// Login e Meu Painel ficam no bundle inicial (Login é a 1ª tela de quem não
// tem sessão; Meu Painel é o destino de quase todo login — Home foi removida
// em 2026-09-23, Meu Painel virou a rota padrão). O resto carrega sob
// demanda — antes era um único JS de 2,3 MB (669 kB gzip) baixado até na
// tela de login.
const DefinirSenha = lazyWithRetry(() => import("@/pages/DefinirSenha"));
const Csat = lazyWithRetry(() => import("@/pages/Csat"));
const ReclameAqui = lazyWithRetry(() => import("@/pages/ReclameAqui"));
const Nps = lazyWithRetry(() => import("@/pages/Nps"));
const Performance = lazyWithRetry(() => import("@/pages/Performance"));
const Helpdesks = lazyWithRetry(() => import("@/pages/Helpdesks"));
const Calendario = lazyWithRetry(() => import("@/pages/Calendario"));
const Missoes = lazyWithRetry(() => import("@/pages/Missoes"));
const ReuniaoResultados = lazyWithRetry(() => import("@/pages/ReuniaoResultados"));
const Cursos = lazyWithRetry(() => import("@/pages/Cursos"));
const Documentacao = lazyWithRetry(() => import("@/pages/Documentacao"));
const Atualizacoes = lazyWithRetry(() => import("@/pages/Atualizacoes"));
const OutrosLinks = lazyWithRetry(() => import("@/pages/OutrosLinks"));
const Perfil = lazyWithRetry(() => import("@/pages/Perfil"));
const AdminLayout = lazyWithRetry(() => import("@/pages/admin/AdminLayout"));
const AdminOverview = lazyWithRetry(() => import("@/pages/admin/AdminOverview"));
const AdminUsuarios = lazyWithRetry(() => import("@/pages/admin/AdminUsuarios"));
const AdminOutrosLinks = lazyWithRetry(() => import("@/pages/admin/AdminOutrosLinks"));
const AdminCursos = lazyWithRetry(() => import("@/pages/admin/AdminCursos"));
const AdminDocumentacao = lazyWithRetry(() => import("@/pages/admin/AdminDocumentacao"));
const AdminAtualizacoes = lazyWithRetry(() => import("@/pages/admin/AdminAtualizacoes"));
const AdminPerfis = lazyWithRetry(() => import("@/pages/admin/AdminPerfis"));
const AdminPermissoes = lazyWithRetry(() => import("@/pages/admin/AdminPermissoes"));
const AdminEscalas = lazyWithRetry(() => import("@/pages/admin/AdminEscalas"));
const AdminMetas = lazyWithRetry(() => import("@/pages/admin/AdminMetas"));

// staleTime de 60s: sem isso (padrão 0) toda montagem/foco de aba refaz as
// agregações pesadas do Postgres. Mutações continuam refrescando na hora via
// invalidateQueries, que ignora staleTime.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <RouteBoundary>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="definir-senha" element={<DefinirSenha />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<MeuPainel />} />
                <Route path="meu-painel" element={<MeuPainel />} />
                <Route path="missoes" element={<Missoes />} />
                {/* Analytics excluído em 2026-09-24; o Overview (aberto a todos) substitui. */}
                <Route path="analytics" element={<Navigate to="/performance" replace />} />
                <Route path="performance" element={<Performance />} />
                <Route path="reuniao-resultados" element={<ReuniaoResultados />} />
                <Route path="cursos" element={<Cursos />} />
                <Route path="documentacao" element={<Documentacao />} />
                <Route path="atualizacoes" element={<Atualizacoes />} />
                <Route path="outros-links" element={<OutrosLinks />} />
                <Route path="perfil" element={<Perfil />} />

                <Route path="helpdesks" element={<Helpdesks />} />
                <Route path="calendario" element={<Calendario />} />

                <Route element={<RequirePermission slug="csat" />}>
                  <Route path="csat" element={<Csat />} />
                </Route>

                <Route element={<RequirePermission slug="reclame_aqui" />}>
                  <Route path="reclame-aqui" element={<ReclameAqui />} />
                </Route>

                <Route element={<RequirePermission slug="nps" />}>
                  <Route path="nps" element={<Nps />} />
                </Route>

                <Route element={<AdminOnlyRoute />}>
                  <Route path="admin" element={<AdminLayout />}>
                    <Route index element={<AdminOverview />} />
                    <Route path="usuarios" element={<AdminUsuarios />} />
                    <Route path="perfis" element={<AdminPerfis />} />
                    <Route path="permissoes" element={<AdminPermissoes />} />
                    <Route path="escalas" element={<AdminEscalas />} />
                    <Route path="metas" element={<AdminMetas />} />
                    <Route path="cursos" element={<AdminCursos />} />
                    <Route path="documentacao" element={<AdminDocumentacao />} />
                    <Route path="atualizacoes" element={<AdminAtualizacoes />} />
                    <Route path="outros-links" element={<AdminOutrosLinks />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Routes>
          </RouteBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
