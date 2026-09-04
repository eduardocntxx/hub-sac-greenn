import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { updateCsatResult, fetchDistinctOperadores } from "@/services/api";
import type { DbCsatResult } from "@/types/database";
import { useState } from "react";

const schema = z.object({
  atendente: z.string().min(1, "Obrigatório"),
  email_atendente: z.string().email("E-mail inválido").or(z.literal("")),
  cliente: z.string(),
  telefone: z.string(),
  email: z.string().email("E-mail inválido").or(z.literal("")),
  numero_whatsapp: z.string(),
  canal: z.string(),
  topico: z.string(),
  categoria_cliente: z.enum(["", "Consumidor", "Produtor", "Não identificado"]),
  tags_cliente: z.string(),
  comentario: z.string(),
  link_chamado: z.string(),
});
type FormType = z.infer<typeof schema>;

interface CsatEditarDialogProps {
  registro: DbCsatResult;
  onClose: () => void;
  onSalvo: () => void;
}

// Edição de metadado pelo admin (RLS via csat_write_admin_or_perm) — nunca
// inclui "nota", que é o dado real que o cliente deu na pesquisa; corrigir
// isso mudaria a métrica de satisfação, não um metadado de atribuição.
export function CsatEditarDialog({ registro: r, onClose, onSalvo }: CsatEditarDialogProps) {
  const [erro, setErro] = useState<string | null>(null);
  const { data: operadores } = useQuery({ queryKey: ["distinct-operadores"], queryFn: fetchDistinctOperadores });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormType>({
    resolver: zodResolver(schema),
    defaultValues: {
      atendente: r.atendente ?? "",
      email_atendente: r.email_atendente ?? "",
      cliente: r.cliente ?? "",
      telefone: r.telefone ?? "",
      email: r.email ?? "",
      numero_whatsapp: r.numero_whatsapp ?? "",
      canal: r.canal ?? "",
      topico: r.topico ?? "",
      categoria_cliente: r.categoria_cliente ?? "",
      tags_cliente: r.tags_cliente ?? "",
      comentario: r.comentario ?? "",
      link_chamado: r.link_chamado ?? "",
    },
  });

  // Garante que o valor atual apareça como opção mesmo se não estiver na
  // lista de operadores conhecidos (ex: "Não identificado") — senão o
  // select ficaria sem nenhuma opção selecionada, mascarando o valor real.
  const opcoesAtendente = (() => {
    const lista = operadores ?? [];
    const jaTemAtual = lista.some((o) => o.atendente === r.atendente);
    return jaTemAtual || !r.atendente ? lista : [{ atendente: r.atendente, email_atendente: r.email_atendente ?? "" }, ...lista];
  })();

  function onAtendenteChange(nome: string) {
    const encontrado = opcoesAtendente.find((o) => o.atendente === nome);
    if (encontrado?.email_atendente) setValue("email_atendente", encontrado.email_atendente);
  }

  async function onSubmit(values: FormType) {
    setErro(null);
    try {
      await updateCsatResult(r.id, {
        atendente: values.atendente,
        email_atendente: values.email_atendente || null,
        cliente: values.cliente || null,
        telefone: values.telefone || null,
        email: values.email || null,
        numero_whatsapp: values.numero_whatsapp || null,
        canal: values.canal || null,
        topico: values.topico || null,
        categoria_cliente: values.categoria_cliente || null,
        tags_cliente: values.tags_cliente || null,
        comentario: values.comentario || null,
        link_chamado: values.link_chamado || null,
      });
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  return (
    <Dialog onClose={onClose} className="max-w-xl">
      <h3 className="font-display text-sm font-semibold text-ink">Editar avaliação de CSAT</h3>
      <p className="mt-1 text-xs text-ink/50">
        Só metadados de atribuição/classificação — a nota dada pelo cliente não é editável aqui.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Atendente</label>
            <select
              {...register("atendente", { onChange: (e) => onAtendenteChange(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm"
            >
              <option value="">Selecione...</option>
              {opcoesAtendente.map((o) => (
                <option key={o.atendente} value={o.atendente}>{o.atendente}</option>
              ))}
            </select>
            {errors.atendente && <p className="mt-1 text-xs text-rust-500">{errors.atendente.message}</p>}
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">E-mail do atendente</label>
            <input {...register("email_atendente")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
            {errors.email_atendente && <p className="mt-1 text-xs text-rust-500">{errors.email_atendente.message}</p>}
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Cliente</label>
            <input {...register("cliente")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">E-mail do cliente</label>
            <input {...register("email")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
            {errors.email && <p className="mt-1 text-xs text-rust-500">{errors.email.message}</p>}
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Telefone</label>
            <input {...register("telefone")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">WhatsApp</label>
            <input {...register("numero_whatsapp")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Canal</label>
            <input {...register("canal")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Categoria do cliente</label>
            <select {...register("categoria_cliente")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm">
              <option value="">—</option>
              <option value="Consumidor">Consumidor</option>
              <option value="Produtor">Produtor</option>
              <option value="Não identificado">Não identificado</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Tópico</label>
            <input {...register("topico")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Tags do cliente</label>
            <input {...register("tags_cliente")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" placeholder="separadas por vírgula" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Link do chamado</label>
            <input {...register("link_chamado")} className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/40">Comentário</label>
            <textarea {...register("comentario")} rows={3} className="mt-1 w-full rounded-lg border border-sand-line bg-sand-surface px-2 py-1.5 text-sm" />
          </div>
        </div>

        {erro && <p className="text-sm text-rust-500">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
