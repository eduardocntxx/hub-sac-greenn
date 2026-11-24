import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  TrendingUp,
  HandCoins,
  Target,
  ClipboardList,
  BookOpen,
  Megaphone,
  Wrench,
  CalendarDays,
  Star,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  KeyRound,
} from "lucide-react";
import logoGreenn from "@/assets/greenn-logo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

// Menu agrupado por assunto (2026-11-23, no molde da Central de Tickets), não por permissão.
// Item restrito ganha só um selo no ícone: coroa amarela = só admin, chave = permissão do
// módulo. Grupos com várias telas parecidas viram um item com subitens, que só abrem no grupo
// em que a pessoa está. Cada ícone tem um gesto próprio no hover (.gesto-* em index.css).

type Acesso = "admin" | "permissao";
type Filho = { to: string; label: string; perm?: string };
type Item = { to: string; label: string; icon: LucideIcon; gesto: string; end?: boolean; acesso?: Acesso; filhos?: Filho[] };

const SECOES: { nome: string; itens: Item[] }[] = [
  {
    nome: "Trabalho",
    itens: [
      // "/" e "/meu-painel" são a mesma tela (Home removida em 2026-09-23).
      { to: "/", label: "Meu Painel", icon: LayoutDashboard, gesto: "gesto-pulo", end: true },
      { to: "/missoes", label: "Missões", icon: Target, gesto: "gesto-gira" },
      { to: "/helpdesks", label: "Helpdesks", icon: Wrench, gesto: "gesto-balanca" },
      { to: "/calendario", label: "Calendário", icon: CalendarDays, gesto: "gesto-amassa" },
    ],
  },
  {
    nome: "Resultados",
    itens: [
      { to: "/performance", label: "Overview", icon: TrendingUp, gesto: "gesto-anda" },
      { to: "/reuniao-resultados", label: "Reunião de Resultados", icon: ClipboardList, gesto: "gesto-pulo" },
      { to: "/suporte-estrategico", label: "Suporte Estratégico", icon: HandCoins, gesto: "gesto-cresce" },
      {
        to: "/csat",
        label: "Pesquisas",
        icon: Star,
        gesto: "gesto-gira",
        acesso: "permissao",
        filhos: [
          { to: "/csat", label: "CSAT", perm: "csat" },
          { to: "/nps", label: "NPS", perm: "nps" },
          { to: "/reclame-aqui", label: "Reclame Aqui", perm: "reclame_aqui" },
        ],
      },
    ],
  },
  {
    nome: "Conteúdo",
    itens: [
      { to: "/atualizacoes", label: "Atualizações", icon: Megaphone, gesto: "gesto-balanca" },
      {
        to: "/cursos",
        label: "Materiais",
        icon: BookOpen,
        gesto: "gesto-amassa",
        filhos: [
          { to: "/cursos", label: "Cursos" },
          { to: "/documentacao", label: "Documentação" },
          { to: "/outros-links", label: "Outros Links" },
        ],
      },
    ],
  },
];

const CONFIGURACOES: Item = { to: "/admin", label: "Configurações", icon: Settings, gesto: "gesto-gira", acesso: "admin" };

function rotaAtiva(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to || pathname === "/meu-painel";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function Selo({ acesso }: { acesso?: Acesso }) {
  if (!acesso) return null;
  const Icone = acesso === "admin" ? Crown : KeyRound;
  return (
    <span
      className={cn(
        "absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-forest-800 dark:ring-forest-950",
        acesso === "admin" ? "bg-amber-400 text-amber-700" : "bg-sky-400 text-white"
      )}
      title={acesso === "admin" ? "Só administradores" : "Precisa de permissão do módulo"}
    >
      <Icone size={8} strokeWidth={3} />
    </span>
  );
}

function ItemMenu({ item, filhos, collapsed, ordem }: { item: Item; filhos?: Filho[]; collapsed: boolean; ordem: number }) {
  const { pathname } = useLocation();
  const ativo = filhos ? filhos.some((f) => rotaAtiva(pathname, f.to)) : rotaAtiva(pathname, item.to, item.end);
  const Icone = item.icon;
  const destino = filhos?.[0]?.to ?? item.to;
  return (
    <div>
      <Link
        to={destino}
        aria-current={ativo ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          ativo ? "font-semibold text-forest-800" : "text-white/60 hover:bg-white/10 hover:text-white"
        )}
      >
        {/* Marcador do item ativo desliza de um item pro outro. */}
        {ativo && (
          <motion.span
            layoutId="menu-ativo"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "absolute inset-0 rounded-xl",
              item.acesso === "admin"
                ? "bg-amber-400 shadow-[0_8px_22px_-8px_rgba(246,200,25,0.8)]"
                : "bg-white shadow-[0_8px_22px_-8px_rgba(50,169,160,0.9),0_0_0_1px_rgba(255,255,255,0.5)]"
            )}
          />
        )}
        <span className="relative shrink-0">
          <Icone size={18} className={item.gesto} />
          <Selo acesso={item.acesso} />
        </span>
        {!collapsed && (
          // Textos entram em sequência quando o menu abre.
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: 0.04 + ordem * 0.02, ease: [0.4, 0, 0.2, 1] }}
            className="relative truncate"
          >
            {item.label}
          </motion.span>
        )}
      </Link>
      {!collapsed && ativo && filhos && filhos.length > 1 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="ml-[22px] mt-1 space-y-0.5 overflow-hidden border-l border-white/10 pl-3"
        >
          {filhos.map((f) => {
            const filhoAtivo = rotaAtiva(pathname, f.to);
            return (
              <Link
                key={f.to}
                to={f.to}
                aria-current={filhoAtivo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                  filhoAtivo ? "font-semibold text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", filhoAtivo ? "bg-forest-300" : "bg-white/25")} />
                {f.label}
              </Link>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-2 my-2 border-t border-white/10" />;
  return (
    <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40 first:mt-0">
      {children}
    </p>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const [fixado, setFixado] = useState(false);
  const { isAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  // Subitens com permissão: só os que a pessoa pode abrir; o item some se não sobrar nenhum.
  const visiveis = (item: Item) => item.filhos?.filter((f) => !f.perm || hasPermission(f.perm));
  let ordem = 0;

  return (
    <aside
      onMouseEnter={() => !fixado && setCollapsed(false)}
      onMouseLeave={() => !fixado && setCollapsed(true)}
      className={cn(
        "flex h-screen flex-col overflow-hidden bg-forest-800 text-white transition-[width] duration-300 ease-out dark:bg-forest-950",
        collapsed ? "w-[72px]" : "w-60 shadow-float"
      )}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <img src={logoGreenn} alt="Greenn" className="h-9 w-9 shrink-0" />
        <span
          className={cn(
            "whitespace-nowrap font-display text-sm font-bold tracking-tight text-white transition-opacity duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}
        >
          Hub SAC Greenn
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-dark px-2 py-2">
        {SECOES.map((secao) => (
          <div key={secao.nome} className="space-y-1">
            <SectionLabel collapsed={collapsed}>{secao.nome}</SectionLabel>
            {secao.itens.map((item) => {
              const filhos = visiveis(item);
              if (filhos && filhos.length === 0) return null;
              return <ItemMenu key={item.to + item.label} item={item} filhos={filhos} collapsed={collapsed} ordem={ordem++} />;
            })}
          </div>
        ))}
      </nav>

      {isAdmin && (
        <div className="px-2 pb-1">
          <div className="mx-2 mb-2 border-t border-white/10" />
          <ItemMenu item={CONFIGURACOES} collapsed={collapsed} ordem={ordem++} />
        </div>
      )}

      <button
        onClick={() => {
          setFixado((f) => {
            const novo = !f;
            setCollapsed(!novo);
            return novo;
          });
        }}
        title={fixado ? "Desafixar sidebar" : "Fixar sidebar expandida"}
        className="m-2 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-white/50 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white active:scale-[0.97]"
      >
        {fixado ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
        <span className={cn("whitespace-nowrap transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>
          {fixado ? "Desafixar" : "Fixar expandida"}
        </span>
      </button>
    </aside>
  );
}
