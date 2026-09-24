import { EmptyState, Button } from "hub-sac-greenn";
import { Inbox } from "lucide-react";

export const Padrao = () => (
  <div className="w-[480px] p-4">
    <EmptyState
      icon={Inbox}
      title="Nenhuma avaliação no período"
      description="Quando os clientes responderem a pesquisa de CSAT, as avaliações aparecem aqui."
      action={<Button size="sm" variant="secondary">Mudar período</Button>}
    />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="w-[480px] bg-sand-bg p-4">
      <EmptyState
        icon={Inbox}
        title="Nenhuma avaliação no período"
        description="Quando os clientes responderem a pesquisa de CSAT, as avaliações aparecem aqui."
      />
    </div>
  </div>
);
