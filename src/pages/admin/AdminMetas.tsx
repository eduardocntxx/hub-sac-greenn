import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fetchSlaConfigPadrao, upsertSlaConfigPadrao } from "@/services/api";

const metasSchema = z.object({
  meta_primeira_resposta_min: z.coerce.number().min(1, "Informe um valor maior que zero"),
  meta_resolucao_min: z.coerce.number().min(1, "Informe um valor maior que zero"),
  meta_csat: z.coerce.number().min(1, "Mínimo 1").max(5, "Máximo 5"),
});
type MetasForm = z.infer<typeof metasSchema>;

export default function AdminMetas() {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const { data: config, isLoading } = useQuery({ queryKey: ["sla-config-padrao"], queryFn: fetchSlaConfigPadrao });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<MetasForm>({ resolver: zodResolver(metasSchema) });

  useEffect(() => {
    if (config) {
      reset({
        meta_primeira_resposta_min: config.meta_primeira_resposta_min,
        meta_resolucao_min: config.meta_resolucao_min,
        meta_csat: config.meta_csat ?? 4.5,
      });
    }
  }, [config, reset]);

  async function onSubmit(data: MetasForm) {
    if (!config) return;
    setErro(null);
    setSalvo(false);
    try {
      await upsertSlaConfigPadrao(config.id, data);
      await queryClient.invalidateQueries({ queryKey: ["sla-config-padrao"] });
      setSalvo(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar as metas.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display text-ink">Metas</h1>
        <p className="mt-1 text-sm text-ink/60">
          Metas usadas pro cálculo de SLA no Overview (Velocidade) e no CSAT — hoje uma regra única, vale pra todos os
          canais e motivos.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target size={16} className="text-forest-600" />
            <CardTitle>Metas de atendimento</CardTitle>
          </div>
          <CardDescription>Chamados dentro desses valores contam como "SLA cumprido" nos indicadores.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-ink/50">Carregando...</p>
          ) : !config ? (
            <p className="text-sm text-rust-500">Nenhuma regra de meta encontrada em sla_config.</p>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              onChange={() => {
                setSalvo(false);
              }}
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
                  Tempo até 1ª resposta (minutos)
                </label>
                <input
                  type="number"
                  step="1"
                  {...register("meta_primeira_resposta_min")}
                  className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface px-3 text-sm outline-none focus:border-forest-500"
                />
                {errors.meta_primeira_resposta_min && (
                  <p className="mt-1 text-xs text-rust-500">{errors.meta_primeira_resposta_min.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
                  Tempo até resolução (minutos)
                </label>
                <input
                  type="number"
                  step="1"
                  {...register("meta_resolucao_min")}
                  className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface px-3 text-sm outline-none focus:border-forest-500"
                />
                {errors.meta_resolucao_min && <p className="mt-1 text-xs text-rust-500">{errors.meta_resolucao_min.message}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
                  CSAT médio (1 a 5)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  {...register("meta_csat")}
                  className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface px-3 text-sm outline-none focus:border-forest-500"
                />
                {errors.meta_csat && <p className="mt-1 text-xs text-rust-500">{errors.meta_csat.message}</p>}
              </div>

              {erro && <p className="text-sm text-rust-500">{erro}</p>}
              {salvo && !isDirty && <p className="text-sm text-forest-600">Metas salvas.</p>}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar metas"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
