import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/layouts/AppLayout";
import { AdminOnlyRoute } from "@/routes/ProtectedRoute";
import { RequireAuth } from "@/routes/RequireAuth";
import { RequirePermission } from "@/routes/RequirePermission";

import Login from "@/pages/Login";
import DefinirSenha from "@/pages/DefinirSenha";
import Home from "@/pages/Home";
import Csat from "@/pages/Csat";
import ReclameAqui from "@/pages/ReclameAqui";
import Nps from "@/pages/Nps";
import Performance from "@/pages/Performance";
import Helpdesks from "@/pages/Helpdesks";
import Calendario from "@/pages/Calendario";
import MeuPainel from "@/pages/MeuPainel";
import Missoes from "@/pages/Missoes";
import Analytics from "@/pages/Analytics";
import ReuniaoResultados from "@/pages/ReuniaoResultados";
import Cursos from "@/pages/Cursos";
import Documentacao from "@/pages/Documentacao";
import Atualizacoes from "@/pages/Atualizacoes";
import OutrosLinks from "@/pages/OutrosLinks";
import Perfil from "@/pages/Perfil";

import AdminLayout from "@/pages/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminUsuarios from "@/pages/admin/AdminUsuarios";
import AdminOutrosLinks from "@/pages/admin/AdminOutrosLinks";
import AdminCursos from "@/pages/admin/AdminCursos";
import AdminDocumentacao from "@/pages/admin/AdminDocumentacao";
import AdminAtualizacoes from "@/pages/admin/AdminAtualizacoes";
import AdminPerfis from "@/pages/admin/AdminPerfis";
import AdminPermissoes from "@/pages/admin/AdminPermissoes";
import AdminEscalas from "@/pages/admin/AdminEscalas";
import AdminMetas from "@/pages/admin/AdminMetas";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="definir-senha" element={<DefinirSenha />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<Home />} />
                <Route path="meu-painel" element={<MeuPainel />} />
                <Route path="missoes" element={<Missoes />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="reuniao-resultados" element={<ReuniaoResultados />} />
                <Route path="cursos" element={<Cursos />} />
                <Route path="documentacao" element={<Documentacao />} />
                <Route path="atualizacoes" element={<Atualizacoes />} />
                <Route path="outros-links" element={<OutrosLinks />} />
                <Route path="perfil" element={<Perfil />} />

                <Route element={<AdminOnlyRoute />}>
                  <Route path="performance" element={<Performance />} />
                </Route>
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
