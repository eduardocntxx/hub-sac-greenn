import { Navigate, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import AguardandoAprovacao from "@/pages/AguardandoAprovacao";
import logoGreenn from "@/assets/greenn-logo.png";

export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    // Logo respirando com um anel, no lugar do texto solto.
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-forest-400"
              animate={{ scale: [0.6, 1.6], opacity: [0.8, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.img
              src={logoGreenn}
              alt="Greenn"
              className="h-12 w-12"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <p className="text-sm text-ink/50">Carregando sessão...</p>
        </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!user.aprovado) return <AguardandoAprovacao />;

  return <Outlet />;
}
