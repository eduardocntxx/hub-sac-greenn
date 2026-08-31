import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Check, Leaf, MailCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { signUpUser } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const DOMINIO_PERMITIDO = "@greenn.com.br";

const signUpSchema = z
  .object({
    nome: z.string().min(1, "Informe seu nome"),
    email: z
      .string()
      .email("E-mail inválido")
      .refine((v) => v.toLowerCase().endsWith(DOMINIO_PERMITIDO), `Use um e-mail ${DOMINIO_PERMITIDO}`),
    senha: z.string().min(8, "Mínimo de 8 caracteres"),
    confirmarSenha: z.string(),
  })
  .refine((v) => v.senha === v.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });
type SignUpForm = z.infer<typeof signUpSchema>;

const BLOBS = [
  { cor: "bg-forest-500", pos: "-left-24 -top-24", tam: "h-80 w-80", delay: "0s" },
  { cor: "bg-sky-500", pos: "-right-20 top-10", tam: "h-64 w-64", delay: "-4s" },
  { cor: "bg-violet-500", pos: "-bottom-28 -left-16", tam: "h-96 w-96", delay: "-8s" },
  { cor: "bg-amber-500", pos: "-bottom-20 right-0", tam: "h-72 w-72", delay: "-12s" },
  { cor: "bg-rust-500", pos: "left-1/3 top-0", tam: "h-56 w-56", delay: "-16s" },
  { cor: "bg-forest-300", pos: "right-1/4 bottom-0", tam: "h-64 w-64", delay: "-6s" },
];

function BlobsFundo() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className={`animate-blob-float absolute rounded-full opacity-[0.12] blur-3xl ${b.cor} ${b.pos} ${b.tam}`}
          style={{ animationDelay: b.delay }}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const { user, login, loading, error: profileError } = useAuth();
  const [aba, setAba] = useState<"entrar" | "criar-conta">("entrar");

  // ---- Entrar ----
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [googleCarregando, setGoogleCarregando] = useState(false);

  // ---- Esqueci minha senha ----
  const [recuperando, setRecuperando] = useState(false);
  const [recEmail, setRecEmail] = useState("");
  const [recEnviando, setRecEnviando] = useState(false);
  const [recEnviado, setRecEnviado] = useState(false);
  const [recErro, setRecErro] = useState<string | null>(null);

  // ---- Criar conta ----
  const [cadastroFeito, setCadastroFeito] = useState(false);
  const [cadastroErro, setCadastroErro] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const {
    register: registerSignUp,
    handleSubmit: handleSubmitSignUp,
    formState: { errors: errorsSignUp },
    reset: resetSignUp,
  } = useForm<SignUpForm>({ resolver: zodResolver(signUpSchema) });

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLoginError(null);
    try {
      await login(email, password);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitRecuperacao(e: FormEvent) {
    e.preventDefault();
    setRecEnviando(true);
    setRecErro(null);
    try {
      if (!supabase) throw new Error("Supabase não configurado.");
      const { error } = await supabase.auth.resetPasswordForEmail(recEmail, {
        redirectTo: `${window.location.origin}/definir-senha`,
      });
      if (error) throw error;
      setRecEnviado(true);
    } catch (err) {
      setRecErro(err instanceof Error ? err.message : "Não foi possível enviar o link.");
    } finally {
      setRecEnviando(false);
    }
  }

  async function onGoogleLogin() {
    if (!supabase) return;
    setGoogleCarregando(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    // navega pra fora do app (redirect do Google) — sem finally aqui de propósito
  }

  async function onSubmitCadastro(data: SignUpForm) {
    setCadastrando(true);
    setCadastroErro(null);
    try {
      await signUpUser({ nome: data.nome, email: data.email, senha: data.senha });
      setCadastroFeito(true);
      resetSignUp();
    } catch (err) {
      setCadastroErro(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setCadastrando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sand-bg to-forest-500/10 px-4">
      <BlobsFundo />
      <Card className="relative w-full max-w-md p-6 shadow-float">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-forest-500 text-white">
            <Leaf size={22} />
          </div>
          <h1 className="font-display text-lg font-semibold text-ink">Hub SAC Greenn</h1>
          <p className="mt-1 text-sm text-ink/50">Plataforma interna do time de Suporte</p>
        </div>

        {recuperando ? (
          recEnviado ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                <MailCheck size={26} />
              </div>
              <div>
                <p className="font-medium text-ink">Verifique seu e-mail</p>
                <p className="mt-1 text-sm text-ink/60">
                  Se {recEmail} tiver uma conta no Hub, enviamos um link pra redefinir a senha.
                </p>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setRecuperando(false);
                  setRecEnviado(false);
                  setRecEmail("");
                }}
              >
                Voltar pro login
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmitRecuperacao} className="space-y-4">
              <button
                type="button"
                onClick={() => setRecuperando(false)}
                className="flex items-center gap-1 text-xs text-ink/50 hover:text-ink/70"
              >
                <ArrowLeft size={13} /> Voltar
              </button>
              <p className="text-sm text-ink/70">
                Informe seu e-mail — se ele tiver uma conta no Hub, enviamos um link pra redefinir a senha.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">E-mail</label>
                <input
                  type="email"
                  required
                  value={recEmail}
                  onChange={(e) => setRecEmail(e.target.value)}
                  className="w-full rounded-lg border border-sand-line bg-sand-surface px-3 py-2 text-sm outline-none focus:border-forest-500"
                  placeholder="voce@greenn.com.br"
                />
              </div>
              {recErro && <p className="text-sm text-rust-500">{recErro}</p>}
              <Button type="submit" className="w-full" disabled={recEnviando}>
                {recEnviando ? "Enviando..." : "Enviar link de recuperação"}
              </Button>
            </form>
          )
        ) : (
          <>
            <SegmentedControl
              className="mb-5 w-full"
              options={[
                ["entrar", "Entrar"],
                ["criar-conta", "Criar conta"],
              ] as const}
              value={aba}
              onChange={(v) => {
                setAba(v);
                setCadastroFeito(false);
              }}
            />

            {aba === "entrar" ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">E-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-sand-line bg-sand-surface px-3 py-2 text-sm outline-none focus:border-forest-500"
                    placeholder="voce@greenn.com.br"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-sm font-medium text-ink">Senha</label>
                    <button
                      type="button"
                      onClick={() => setRecuperando(true)}
                      className="text-xs text-forest-600 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <PasswordInput
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {(loginError || profileError) && (
                  <div className="rounded-lg border border-rust-400/40 bg-rust-500/5 px-3 py-2 text-sm text-rust-600">
                    {loginError ?? profileError}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Entrando..." : "Entrar"}
                </Button>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-sand-line" />
                  <span className="text-xs text-ink/40">ou</span>
                  <div className="h-px flex-1 bg-sand-line" />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={onGoogleLogin}
                  disabled={googleCarregando}
                >
                  {googleCarregando ? "Redirecionando..." : "Entrar com Google"}
                </Button>
              </form>
            ) : cadastroFeito ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-50 text-forest-600 dark:bg-forest-500/15 dark:text-forest-300">
                  <Check size={26} />
                </div>
                <div>
                  <p className="font-medium text-ink">Conta criada!</p>
                  <p className="mt-1 text-sm text-ink/60">
                    Um administrador do Hub precisa revisar seu acesso antes de você
                    poder usar a plataforma. Você já pode fazer login, mas vai ver uma
                    tela de espera até ser aprovado.
                  </p>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setAba("entrar")}>
                  Ir para o login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmitSignUp(onSubmitCadastro)} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Nome</label>
                  <input
                    {...registerSignUp("nome")}
                    className="w-full rounded-lg border border-sand-line bg-sand-surface px-3 py-2 text-sm outline-none focus:border-forest-500"
                    placeholder="Seu nome completo"
                  />
                  {errorsSignUp.nome && <p className="mt-1 text-xs text-rust-500">{errorsSignUp.nome.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">E-mail</label>
                  <input
                    {...registerSignUp("email")}
                    className="w-full rounded-lg border border-sand-line bg-sand-surface px-3 py-2 text-sm outline-none focus:border-forest-500"
                    placeholder={`voce${DOMINIO_PERMITIDO}`}
                  />
                  {errorsSignUp.email && <p className="mt-1 text-xs text-rust-500">{errorsSignUp.email.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Senha</label>
                  <PasswordInput {...registerSignUp("senha")} placeholder="••••••••" />
                  {errorsSignUp.senha && <p className="mt-1 text-xs text-rust-500">{errorsSignUp.senha.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Confirmar senha</label>
                  <PasswordInput {...registerSignUp("confirmarSenha")} placeholder="••••••••" />
                  {errorsSignUp.confirmarSenha && (
                    <p className="mt-1 text-xs text-rust-500">{errorsSignUp.confirmarSenha.message}</p>
                  )}
                </div>

                {cadastroErro && (
                  <div className="rounded-lg border border-rust-400/40 bg-rust-500/5 px-3 py-2 text-sm text-rust-600">
                    {cadastroErro}
                  </div>
                )}

                <p className="text-xs text-ink/40">
                  Cadastro liberado só pra e-mails {DOMINIO_PERMITIDO}. Sua conta fica
                  pendente de aprovação de um administrador até poder ser usada.
                </p>

                <Button type="submit" className="w-full" disabled={cadastrando}>
                  {cadastrando ? "Criando conta..." : "Criar conta"}
                </Button>
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
