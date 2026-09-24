import { Kpi } from "hub-sac-greenn";
import { MessageCircle, Clock, Star } from "lucide-react";

export const Indicadores = () => (
  <div className="grid w-[720px] grid-cols-3 gap-4 p-4">
    <Kpi label="Total de chamados" value="2.273" delta={-2.9} icon={MessageCircle} />
    <Kpi label="1ª resposta (mediana)" value="24min" delta={-87} invertDeltaColor icon={Clock} />
    <Kpi label="CSAT positivo" value="89,5%" delta={4.2} meta="notas 4 e 5" icon={Star} valueClassName="text-forest-600" />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="grid w-[720px] grid-cols-3 gap-4 bg-sand-bg p-4">
      <Kpi label="Total de chamados" value="2.273" delta={-2.9} icon={MessageCircle} />
      <Kpi label="1ª resposta (mediana)" value="24min" delta={-87} invertDeltaColor icon={Clock} />
      <Kpi label="CSAT positivo" value="89,5%" delta={4.2} meta="notas 4 e 5" icon={Star} />
    </div>
  </div>
);
