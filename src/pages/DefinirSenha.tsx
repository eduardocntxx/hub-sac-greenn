import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function DefinirSenha() {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(true);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setVerificando(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSessaoValida(Boolean(data.session));
      setVerificando(false);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password: senha });
      if (error) throw error;
      setSucesso(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível definir a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-bg px-4">
      <Card className="w-full max-w-sm p-6 shadow-float">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-500 text-white">
            <Leaf size={18} />
          </div>
          <span className="font-display text-base font-semibold text-ink">Hub SAC Greenn</span>
        </div>

        {verificando ? (
          <p className="text-sm text-ink/60">Verificando convite...</p>
        ) : !sessaoValida ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Este link de convite é inválido ou já expirou.
            </p>
            <p className="text-xs text-ink/50">
              Peça pro Administrador enviar um novo convite pelo Hub.
            </p>
          </div>
        ) : sucesso ? (
          <p className="text-sm text-forest-600">
            Senha definida! Redirecionando...
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-ink/70">
              Bem-vindo(a)! Defina sua senha de acesso ao Hub.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Nova senha</label>
              <PasswordInput
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Confirmar senha</label>
              <PasswordInput
                required
                minLength={8}
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {erro && <p className="text-sm text-rust-500">{erro}</p>}

            <Button type="submit" className="w-full" disabled={salvando}>
              {salvando ? "Salvando..." : "Definir senha e entrar"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
