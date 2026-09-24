# Hub SAC Greenn — convenções (visual Verdee)

Design system do Hub SAC, o painel interno do time de Suporte da Greenn. Identidade Verdee: verde-azulado `#009488`, fonte Plus Jakarta Sans, cinzas esverdeados. Todo texto de interface é em português do Brasil.

## Montagem e temas
- Não precisa de provider. Os componentes vêm de `window.HubSac` (`HubSac.Button`, `HubSac.Card`...) e ficam estilizados só com `styles.css`, que traz a fonte, os tokens e as classes utilitárias.
- **Claro é o padrão.** Para o **modo escuro**, coloque a classe `dark` num elemento acima (no `<html>` ou num wrapper): os tokens trocam sozinhos e os componentes já têm as variantes `dark:`. Toda tela deve funcionar nos dois temas: use sempre os tokens abaixo, nunca cores fixas como `bg-white` ou `#fff`.
- Página: fundo `bg-sand-bg`; cards e painéis `bg-sand-surface` (ou o componente `Card`).

## Estilo: classes utilitárias (Tailwind compilado)
Só existem as classes presentes em `styles.css`. Não invente classes; confira no arquivo antes de usar uma nova.
- **Neutros (trocam no escuro):** `bg-sand-bg`, `bg-sand-surface`, `bg-sand-subtle`, `border-sand-line`, `border-sand-line-strong`, `text-ink`, e opacidades como `text-ink/50` e `text-ink/60` para texto secundário.
- **Marca (verde-azulado):** escala `forest-50` a `forest-900`: `bg-forest-500` (ação e destaque), `bg-forest-600` (botão primário), `text-forest-700`, fundos suaves `bg-forest-50`/`bg-forest-100`. No escuro, o par de fundo suave é `dark:bg-forest-500/15 dark:text-forest-300`.
- **Semânticas:** `rust-*` = erro/ruim (`text-rust-500`, `bg-rust-500`), `amber-*` = atenção (`bg-amber-50`, `text-amber-700`), `sky-*` = informação (`bg-sky-50`). Verde = bom, vermelho = ruim; nunca verde e vermelho só por matiz, mude também o texto.
- **Tipografia:** `font-display` nos títulos; tamanhos `text-kpi-lg` (número de indicador), `text-card-title`, `text-legenda`; `tabular-nums` em números alinhados.
- **Forma:** `rounded-xl`/`rounded-2xl`, `shadow-card`, `shadow-float` (pop-ups). Espaçamento com `gap-*` em flex e grid.

## Componentes
`Button` (variant `primary|secondary|ghost|danger`, size `sm|md`), `Badge` (tone `neutral|success|warning|danger|info|ausencia|brand`), `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent` (`accent` põe a faixa verde no topo), `Kpi` (indicador com `delta` em %, `invertDeltaColor` quando menor é melhor), `Avatar` (iniciais pelo `nome`), `EmptyState`, `Skeleton`/`CardSkeleton` (carregando), `SegmentedControl` (abas compactas), `SortableHeader` (cabeçalho de tabela ordenável, dentro de `<thead>`), `BarChart`/`HorizontalBarChart`, `DateRangePopover` (filtro de período), `Dialog` (pop-up; fecha com Escape ou clique fora), `PasswordInput`. A API de cada um está no `<Nome>.d.ts` e no `<Nome>.prompt.md`.

## Exemplo
```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, Kpi, Badge, Button } = window.HubSac;

<div className="dark">{/* tire "dark" para o tema claro */}
  <div className="flex flex-col gap-4 bg-sand-bg p-6">
    <div className="grid grid-cols-3 gap-4">
      <Kpi label="Total de chamados" value="2.273" delta={-2.9} />
      <Kpi label="1ª resposta (mediana)" value="24min" delta={-87} invertDeltaColor />
      <Kpi label="CSAT positivo" value="89,5%" delta={4.2} meta="notas 4 e 5" />
    </div>
    <Card>
      <CardHeader>
        <CardTitle>Atendido e não resolvido</CardTitle>
        <CardDescription>Conversas com resposta humana que continuam abertas.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-sm text-ink">Ana Franca</span>
        <Badge tone="danger">110 parados há +48h</Badge>
      </CardContent>
    </Card>
    <Button variant="primary">Ver conversas</Button>
  </div>
</div>
```
