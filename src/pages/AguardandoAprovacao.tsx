import { Hourglass, Leaf } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function AguardandoAprovacao() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-bg px-4">
      <Card className="w-full max-w-sm p-6 text-center shadow-float">
        <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-forest-500 text-white">
          <Leaf size={18} />
        </div>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Hourglass size={26} />
        </div>
        <h1 className="font-display text-base font-semibold text-ink">
          Sua conta ainda não foi aprovada
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          {user?.nome ? `Olá, ${user.nome}. ` : ""}
          Um administrador do Hub precisa revisar seu acesso antes de você
          poder entrar. Isso costuma ser rápido — tente novamente mais tarde.
        </p>
        <Button variant="secondary" className="mt-6 w-full" onClick={() => logout()}>
          Sair
        </Button>
      </Card>
    </div>
  );
}
