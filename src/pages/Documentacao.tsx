import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchDocumentation } from "@/services/api";

export default function Documentacao() {
  const [busca, setBusca] = useState("");

  const { data: docs, isLoading } = useQuery({
    queryKey: ["documentation"],
    queryFn: fetchDocumentation,
  });

  const filtrados = useMemo(
    () => (docs ?? []).filter((d) => d.titulo.toLowerCase().includes(busca.toLowerCase())),
    [docs, busca]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display text-ink">
          Documentação
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Repositório central de documentos internos do time de Suporte.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar documento..."
          className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface pl-9 pr-3 text-sm outline-none focus:border-forest-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento encontrado"
          description="Tente buscar por outro termo ou peça ao Administrador para publicar o conteúdo."
        />
      ) : (
        <div className="space-y-2">
          {filtrados.map((d) => (
            <a key={d.id} href={d.link ?? "#"} target="_blank" rel="noreferrer" className="block">
              <Card className="flex items-center justify-between p-4 transition-colors hover:border-forest-300">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-50 text-forest-600 dark:bg-forest-500/15 dark:text-forest-300">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{d.titulo}</p>
                    <p className="text-xs text-ink/50">{d.descricao}</p>
                  </div>
                </div>
                <Badge tone="neutral">{d.categoria ?? "Geral"}</Badge>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
