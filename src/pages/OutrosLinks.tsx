import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Link2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { SecaoHead } from "@/components/ui/SecaoHead";
import { Entrada } from "@/components/ui/Entrada";
import { fetchTools } from "@/services/api";
import { DynamicIcon } from "@/lib/dynamicIcon";

export default function OutrosLinks() {
  const { data: tools, isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: fetchTools,
  });

  const categorias = Array.from(new Set((tools ?? []).map((t) => t.categoria ?? "Geral")));

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Outros Links" subtitulo="Acesso rápido aos sistemas do dia a dia. Cada link abre em uma nova guia." />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : !tools || tools.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhum link cadastrado"
          description="Peça ao Administrador para cadastrar os links do time em Administração > Outros Links."
        />
      ) : (
        categorias.map((categoria) => (
          <div key={categoria}>
            <SecaoHead titulo={categoria} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tools
                .filter((t) => (t.categoria ?? "Geral") === categoria)
                .map((t, i) => (
                  <Entrada key={t.id} indice={i} elevar className="h-full">
                  <Card className="group flex h-full flex-col overflow-hidden p-0 hover:ring-1 hover:ring-forest-500/40">
                    {t.imagem_url && (
                      <div className="h-28 w-full overflow-hidden bg-sand-bg">
                        <img
                          src={t.imagem_url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-forest-500/10 text-forest-600 transition-transform duration-200 group-hover:scale-110 dark:text-forest-300">
                        {t.icone_url ? (
                          <img src={t.icone_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <DynamicIcon name={t.icone ?? undefined} size={24} />
                        )}
                      </div>
                      <h3 className="mt-4 font-display text-card-title text-ink">
                        {t.nome}
                      </h3>
                      <p className="mt-1 flex-1 text-legenda text-ink/55">{t.descricao}</p>
                      <a
                        href={t.url ?? "#"}
                        target={t.abrir_nova_guia ? "_blank" : undefined}
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-sand-line px-4 py-2 text-sm font-medium text-ink transition-colors group-hover:border-forest-500 group-hover:bg-forest-500 group-hover:text-white"
                      >
                        Acessar <ExternalLink size={13} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </a>
                    </div>
                  </Card>
                  </Entrada>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
