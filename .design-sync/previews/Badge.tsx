import { Badge } from "hub-sac-greenn";

export const Tons = () => (
  <div className="flex flex-wrap items-center gap-2 p-4">
    <Badge tone="neutral">Rascunho</Badge>
    <Badge tone="success">Resolvido</Badge>
    <Badge tone="warning">Pendente</Badge>
    <Badge tone="danger">257 parados há +48h</Badge>
    <Badge tone="info">WhatsApp</Badge>
    <Badge tone="ausencia">Férias</Badge>
    <Badge tone="brand">Administrador</Badge>
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="flex flex-wrap items-center gap-2 bg-sand-bg p-4">
      <Badge tone="neutral">Rascunho</Badge>
      <Badge tone="success">Resolvido</Badge>
      <Badge tone="warning">Pendente</Badge>
      <Badge tone="danger">257 parados há +48h</Badge>
      <Badge tone="info">WhatsApp</Badge>
      <Badge tone="ausencia">Férias</Badge>
      <Badge tone="brand">Administrador</Badge>
    </div>
  </div>
);
