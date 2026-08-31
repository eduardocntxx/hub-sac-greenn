import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AguardandoAprovacao from "@/pages/AguardandoAprovacao";

export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-ink/50">
        Carregando sessão...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!user.aprovado) return <AguardandoAprovacao />;

  return <Outlet />;
}
