import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useIsPresent, type Variants } from "framer-motion";
import { raizDaRota, reduzirMovimento, tipoDaTransicao, type Lado, type TipoTransicao } from "@/lib/animacoes";
import { entrouPeloLogin, limparEntradaDoLogin, marcarTransicao } from "@/lib/transicaoAtiva";

// Troca de tela "Mergulho suave" (escolhida em 2026-11-23, versão contida do Mergulho 2 da
// Central de Tickets): indo pra uma tela fora do menu, a atual afunda e a nova vem da frente
// com mola; voltando, o contrário; entre itens do menu, gira num cilindro pro lado do item.
// Nada fica com transform/filter/perspective depois da troca: o relatório da Reunião de
// Resultados usa position:fixed e quebraria dentro de um ancestral transformado.

type Info = { tipo: TipoTransicao; lado: Lado; ativo: boolean };

const TransicaoContext = createContext<Info>({ tipo: "trocar", lado: "direita", ativo: false });
/** Tipo da troca em curso; `ativo` é true enquanto ela acontece (quem anima por conta própria espera). */
export const useTransicao = () => useContext(TransicaoContext);

const DURACAO_MS = 900;
const MOLA = { type: "spring", stiffness: 260, damping: 28, mass: 1 } as const;
const ORIGEM_Y = "280px";
const GIRO = 12;
const SAIDA = { duration: 0.3, ease: [0.55, 0, 0.45, 1] } as const;

const VARIANTES: Variants = {
  entrar: ({ tipo, lado }: Info) =>
    tipo === "trocar"
      ? { rotateY: lado === "direita" ? GIRO : -GIRO, opacity: 0, filter: "blur(3px) brightness(0.6)", originY: ORIGEM_Y, originZ: -1400 }
      : tipo === "avancar"
        ? { z: 140, rotateX: -3, y: -8, opacity: 0, filter: "blur(6px) brightness(1.1)", originY: ORIGEM_Y, originZ: 0 }
        : { z: -190, rotateX: 4, y: 0, opacity: 0, filter: "blur(4px) brightness(0.85)", originY: ORIGEM_Y, originZ: 0 },
  centro: {
    z: 0,
    rotateX: 0,
    rotateY: 0,
    y: 0,
    opacity: 1,
    filter: "blur(0px) brightness(1)",
    transition: { ...MOLA, delay: 0.05, opacity: { duration: 0.35, delay: 0.05 }, filter: { duration: 0.35, delay: 0.05 } },
    transitionEnd: { filter: "none" },
  },
  sair: ({ tipo, lado }: Info) =>
    tipo === "trocar"
      ? { rotateY: lado === "direita" ? -GIRO : GIRO, opacity: 0, filter: "blur(3px) brightness(0.6)", originY: ORIGEM_Y, originZ: -1400, transition: { duration: 0.35, ease: [0.55, 0, 0.35, 1] } }
      : tipo === "avancar"
        ? { z: -190, rotateX: 4, opacity: 0, filter: "blur(4px) brightness(0.85)", originY: ORIGEM_Y, originZ: 0, transition: SAIDA }
        : { z: 130, rotateX: -4, y: -10, opacity: 0, filter: "blur(6px) brightness(1.1)", originY: ORIGEM_Y, originZ: 0, transition: SAIDA },
};

/** Saída da rota que congela na última tela quando ela está saindo (senão a tela velha
 * renderizaria a rota nova durante a animação). */
export function OutletDaTela() {
  const outlet = useOutlet();
  const presente = useIsPresent();
  const ultimo = useRef(outlet);
  if (presente) ultimo.current = outlet;
  return <>{ultimo.current}</>;
}

export function TransicaoTela({ embrulho }: { embrulho: (filho: ReactNode, chave: string) => ReactNode }) {
  const location = useLocation();
  const navegacao = useNavigationType();
  const raiz = raizDaRota(location.pathname);

  // Estado derivado na própria renderização: a tela nova já monta sabendo o tipo da troca.
  // Logo depois do login, a primeira tela entra "avançando" (o login mergulha no app).
  const [info, setInfo] = useState<Info & { raiz: string; caminho: string }>(() => ({
    tipo: "avancar", lado: "direita", ativo: entrouPeloLogin() && !reduzirMovimento(), raiz, caminho: location.pathname,
  }));
  const [primeiraComAnimacao] = useState(info.ativo);
  useEffect(() => limparEntradaDoLogin(), []);
  if (info.raiz !== raiz) {
    const t = tipoDaTransicao(info.caminho, location.pathname, navegacao === "POP");
    setInfo({ ...t, ativo: !reduzirMovimento(), raiz, caminho: location.pathname });
  } else if (info.caminho !== location.pathname) {
    setInfo({ ...info, caminho: location.pathname });
  }

  useEffect(() => {
    if (!info.ativo) return;
    marcarTransicao();
    document.querySelector("main")?.scrollTo({ top: 0 });
    const t = setTimeout(() => setInfo((i) => ({ ...i, ativo: false })), DURACAO_MS);
    return () => clearTimeout(t);
  }, [info.ativo, info.raiz]);

  return (
    <TransicaoContext.Provider value={info}>
      <div className="relative" style={info.ativo ? { perspective: "1100px", perspectiveOrigin: `50% ${ORIGEM_Y}` } : undefined}>
        <AnimatePresence initial={primeiraComAnimacao} mode="popLayout" custom={info}>
          <motion.div
            key={raiz}
            custom={info}
            variants={VARIANTES}
            initial="entrar"
            animate="centro"
            exit="sair"
            className="relative z-[1] rounded-[28px] bg-sand-bg print:m-0"
          >
            {embrulho(<OutletDaTela />, location.pathname)}
          </motion.div>
        </AnimatePresence>
      </div>
    </TransicaoContext.Provider>
  );
}
