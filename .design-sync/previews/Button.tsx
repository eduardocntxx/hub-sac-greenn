import { Button } from "hub-sac-greenn";
import { Download, Plus } from "lucide-react";

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-3 p-4">
    <Button variant="primary">Salvar avaliação</Button>
    <Button variant="secondary">Cancelar</Button>
    <Button variant="ghost">Ver detalhes</Button>
    <Button variant="danger">Excluir chamado</Button>
  </div>
);

export const Tamanhos = () => (
  <div className="flex flex-wrap items-center gap-3 p-4">
    <Button size="sm"><Plus size={14} /> Nova missão</Button>
    <Button size="md"><Download size={16} /> Baixar PPTX</Button>
    <Button size="md" disabled>Carregando dados...</Button>
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="flex flex-wrap items-center gap-3 bg-sand-bg p-4">
      <Button variant="primary">Salvar avaliação</Button>
      <Button variant="secondary">Cancelar</Button>
      <Button variant="ghost">Ver detalhes</Button>
      <Button variant="danger">Excluir chamado</Button>
    </div>
  </div>
);
