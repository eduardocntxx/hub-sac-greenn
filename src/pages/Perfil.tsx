import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LogOut, Clock, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { fetchMyHorario, updateMyHorario, updateOwnProfile } from "@/services/api";

const perfilSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  cargo: z.string(),
  equipe: z.string(),
});
type PerfilForm = z.infer<typeof perfilSchema>;

const DEFAULT_HORARIO = {
  horario_entrada: "08:00",
  horario_saida_almoco: "12:00",
  horario_retorno_almoco: "13:00",
  horario_saida: "17:00",
};

export default function Perfil() {
  const { user, logout, refreshUser } = useAuth();
  const [notificacoes, setNotificacoes] = useState(true);
  const [horario, setHorario] = useState(DEFAULT_HORARIO);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const {
    register: registerPerfil,
    handleSubmit: handleSubmitPerfil,
    reset: resetPerfil,
    formState: { errors: errosPerfil },
  } = useForm<PerfilForm>({ resolver: zodResolver(perfilSchema) });

  function abrirEdicaoPerfil() {
    if (!user) return;
    resetPerfil({ nome: user.nome, cargo: user.cargo, equipe: user.equipe });
    setErroPerfil(null);
    setEditandoPerfil(true);
  }

  async function salvarPerfil(dados: PerfilForm) {
    if (!user) return;
    setSalvandoPerfil(true);
    setErroPerfil(null);
    try {
      await updateOwnProfile(user.id, dados);
      await refreshUser();
      setEditandoPerfil(false);
    } catch (err) {
      setErroPerfil(err instanceof Error ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setSalvandoPerfil(false);
    }
  }

  const { data: horarioAtual } = useQuery({
    queryKey: ["meu-horario", user?.id],
    queryFn: () => fetchMyHorario(user!.id),
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (horarioAtual) {
      setHorario({
        horario_entrada: horarioAtual.horario_entrada?.slice(0, 5) ?? DEFAULT_HORARIO.horario_entrada,
        horario_saida_almoco: horarioAtual.horario_saida_almoco?.slice(0, 5) ?? DEFAULT_HORARIO.horario_saida_almoco,
        horario_retorno_almoco: horarioAtual.horario_retorno_almoco?.slice(0, 5) ?? DEFAULT_HORARIO.horario_retorno_almoco,
        horario_saida: horarioAtual.horario_saida?.slice(0, 5) ?? DEFAULT_HORARIO.horario_saida,
      });
    }
  }, [horarioAtual]);

  if (!user) return null;

  async function salvarHorario() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      await updateMyHorario(user!.id, horario);
      setSalvo(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o horário.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-display text-ink">Perfil</h1>
        <p className="mt-1 text-sm text-ink/60">
          Suas informações e preferências pessoais.
        </p>
      </div>

      <Card>
        <CardContent>
          {editandoPerfil ? (
            <form onSubmit={handleSubmitPerfil(salvarPerfil)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Nome</label>
                <input
                  {...registerPerfil("nome")}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                />
                {errosPerfil.nome && <p className="mt-1 text-xs text-rust-500">{errosPerfil.nome.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Cargo</label>
                  <input
                    {...registerPerfil("cargo")}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Equipe</label>
                  <input
                    {...registerPerfil("equipe")}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  />
                </div>
              </div>
              {erroPerfil && <p className="text-sm text-rust-500">{erroPerfil}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={salvandoPerfil}>
                  {salvandoPerfil ? "Salvando..." : "Salvar"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditandoPerfil(false)} disabled={salvandoPerfil}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-50 text-xl font-display font-semibold text-forest-700 dark:bg-forest-500/15 dark:text-forest-300">
                {user.nome
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div>
                <p className="font-display text-base font-semibold text-ink">
                  {user.nome}
                </p>
                <p className="text-sm text-ink/60">{user.email}</p>
                <p className="text-sm text-ink/60">
                  {user.cargo} · {user.equipe}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge tone={user.perfil === "administrador" ? "brand" : "neutral"}>
                  {user.perfil === "administrador" ? "Admin" : "Colaborador"}
                </Badge>
                <Button variant="secondary" size="sm" onClick={abrirEdicaoPerfil}>
                  <Pencil size={13} /> Editar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="p-5 pb-0">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <Clock size={16} /> Meu horário de trabalho (segunda a sexta)
          </h2>
          <p className="mt-1 text-xs text-ink/50">
            Usado para calcular corretamente seus indicadores de tempo de atendimento (fora do expediente não conta).
          </p>
        </div>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Entrada</label>
              <input
                type="time"
                value={horario.horario_entrada}
                onChange={(e) => setHorario((h) => ({ ...h, horario_entrada: e.target.value }))}
                className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Saída para almoço</label>
              <input
                type="time"
                value={horario.horario_saida_almoco}
                onChange={(e) => setHorario((h) => ({ ...h, horario_saida_almoco: e.target.value }))}
                className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Retorno do almoço</label>
              <input
                type="time"
                value={horario.horario_retorno_almoco}
                onChange={(e) => setHorario((h) => ({ ...h, horario_retorno_almoco: e.target.value }))}
                className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Saída</label>
              <input
                type="time"
                value={horario.horario_saida}
                onChange={(e) => setHorario((h) => ({ ...h, horario_saida: e.target.value }))}
                className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
          </div>
          <p className="text-xs text-ink/40">
            Sábados não têm horário fixo individual — seguem a escala manual definida pela Administração.
          </p>
          {erro && <p className="text-sm text-rust-500">{erro}</p>}
          <div className="flex items-center gap-3">
            <Button onClick={salvarHorario} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar horário"}
            </Button>
            {salvo && <span className="text-sm text-forest-600">Salvo com sucesso.</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">
            Preferências
          </h2>
        </div>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between text-sm">
            <span>Receber notificações internas</span>
            <input
              type="checkbox"
              checked={notificacoes}
              onChange={(e) => setNotificacoes(e.target.checked)}
              className="h-5 w-5 accent-forest-500"
            />
          </label>
        </CardContent>
      </Card>

      <Button variant="secondary" onClick={() => logout()}>
        <LogOut size={16} /> Sair da conta
      </Button>
    </div>
  );
}
