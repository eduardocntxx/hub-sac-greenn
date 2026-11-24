import { useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { OutletDaTela, useTransicao } from "@/components/TransicaoTela";
import { cn } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";

// Agrupado por domínio (só organização visual — nenhuma rota mudou):
// Geral | Identidade e acesso | Escala do time | Conteúdo da plataforma.
const grupos: { nome: string; tabs: { to: string; label: string; end?: boolean }[] }[] = [
  {
    nome: "Geral",
    tabs: [{ to: "/admin", label: "Visão geral", end: true }],
  },
  {
    nome: "Identidade e acesso",
    tabs: [
      { to: "/admin/usuarios", label: "Usuários" },
      { to: "/admin/perfis", label: "Perfis" },
      { to: "/admin/permissoes", label: "Permissões" },
    ],
  },
  {
    nome: "Escala do time",
    tabs: [
      { to: "/admin/escalas", label: "Escalas" },
      { to: "/admin/metas", label: "Metas" },
    ],
  },
  {
    nome: "Conteúdo",
    tabs: [
      { to: "/admin/cursos", label: "Cursos" },
      { to: "/admin/documentacao", label: "Documentação" },
      { to: "/admin/atualizacoes", label: "Atualizações" },
      { to: "/admin/outros-links", label: "Outros Links" },
    ],
  },
];

const ORDEM_ABAS = grupos.flatMap((g) => g.tabs.map((t) => t.to));

// Subaba: o conteúdo vira como página de livro a partir da borda do lado da aba clicada;
// título e abas ficam parados.
function ConteudoDaAba() {
  const { pathname } = useLocation();
  const { ativo } = useTransicao();
  const indice = Math.max(0, ORDEM_ABAS.indexOf(pathname));
  const anterior = useRef(indice);
  const lado = indice >= anterior.current ? "direita" : "esquerda";
  anterior.current = indice;
  const giro = 10;
  return (
    <div className="relative" style={{ perspective: "1200px" }}>
      <AnimatePresence initial={false} mode="popLayout" custom={lado}>
        <motion.div
          key={pathname}
          custom={lado}
          variants={{
            entrar: (l: string) => ({ opacity: 0, rotateY: l === "direita" ? giro : -giro, x: l === "direita" ? "6%" : "-6%", z: -160, originX: l === "direita" ? 0 : 1 }),
            centro: { opacity: 1, rotateY: 0, x: 0, z: 0, transition: { type: "spring", stiffness: 170, damping: 20, delay: 0.06 } },
            sair: { opacity: 0, z: -120, transition: { duration: 0.28, ease: "easeIn" } },
          }}
          initial={ativo ? false : "entrar"}
          animate="centro"
          exit="sair"
        >
          <OutletDaTela />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Administração"
        subtitulo="Gerencie usuários, perfis, permissões, módulos e todo o conteúdo da plataforma."
      />

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-sand-line pb-0">
        {grupos.map((g, gi) => (
          <div key={g.nome} className={cn("flex flex-col gap-1", gi > 0 && "border-l border-sand-line pl-5")}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{g.nome}</span>
            <div className="flex flex-wrap gap-1">
              {g.tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    cn(
                      "relative -mb-px whitespace-nowrap px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive ? "text-forest-600 dark:text-forest-300" : "text-ink/50 hover:text-ink"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {t.label}
                      {/* Sublinhado da aba ativa desliza entre as abas. */}
                      {isActive && (
                        <motion.span
                          layoutId="admin-aba-ativa"
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-forest-500"
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConteudoDaAba />
    </div>
  );
}
