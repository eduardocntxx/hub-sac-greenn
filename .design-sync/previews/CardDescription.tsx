import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "hub-sac-greenn";

export const Composicao = () => (
  <div className="w-[420px] p-4">
    <Card>
      <CardHeader>
        <CardTitle>Ranking de atendentes</CardTitle>
        <CardDescription>Humanos por chamados na semana, tempos em horas úteis.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-ink">
          <span className="font-semibold">Ana Franca</span>
          <span className="tabular-nums">244 chamados</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-ink">
          <span className="font-semibold">Vittor Fernandes</span>
          <span className="tabular-nums">228 chamados</span>
        </div>
      </CardContent>
    </Card>
  </div>
);

export const ComDestaque = () => (
  <div className="w-[420px] p-4">
    <Card accent>
      <CardHeader>
        <CardTitle>Evolução diária de conversas</CardTitle>
        <CardDescription>Faixa verde no topo marca o card principal da tela.</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge tone="success">+3,6 p.p. vs semana anterior</Badge>
      </CardContent>
    </Card>
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="w-[420px] bg-sand-bg p-4">
      <Card>
        <CardHeader>
          <CardTitle>Ranking de atendentes</CardTitle>
          <CardDescription>Humanos por chamados na semana.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-ink">
            <span className="font-semibold">Ana Franca</span>
            <span className="tabular-nums">244 chamados</span>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);
