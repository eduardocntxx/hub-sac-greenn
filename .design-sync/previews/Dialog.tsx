import type { ReactNode } from "react";
import { Dialog, Button, Badge } from "hub-sac-greenn";

// O Dialog é position: fixed (cobre a tela). O transform no contêiner vira o
// "viewport" dele, então o pop-up aparece dentro do card da prévia.
const Tela = ({ children, escuro }: { children: ReactNode; escuro?: boolean }) => (
  <div className={escuro ? "dark" : undefined}>
    <div style={{ transform: "translateZ(0)", width: 880, height: 500 }} className="relative overflow-hidden bg-sand-bg">
      {children}
    </div>
  </div>
);

const Conteudo = () => (
  <>
    <h3 className="font-display text-base font-bold text-ink">Avaliações ruins (nota 1–3)</h3>
    <p className="mt-1 text-xs text-ink/50">13 avaliações · 7 com comentário · pior nota primeiro</p>
    <div className="mt-4 rounded-xl border border-sand-line p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="danger">Nota 1</Badge>
        <span className="font-semibold text-ink">Vivian</span>
        <span className="text-ink/60">· Chat · 20/09 17:42</span>
      </div>
      <p className="mt-2 text-sm text-ink">Não recebi mais nenhuma resposta sobre o cancelamento e o reembolso.</p>
    </div>
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary">Fechar</Button>
      <Button>Ver chamado</Button>
    </div>
  </>
);

export const AvaliacoesRuins = () => (
  <Tela><Dialog onClose={() => {}}><Conteudo /></Dialog></Tela>
);
