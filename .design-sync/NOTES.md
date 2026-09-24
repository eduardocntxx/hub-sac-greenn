# Notas do design-sync

- 2026-09-24: o usuário pediu pra remodelar o visual do Hub pelo preview do Claude Design (Verdee: verde-azulado #009488, Plus Jakarta Sans, modo claro e escuro) ANTES de sincronizar. A sincronização envia os componentes já no visual Verdee.
- O Hub é um app, não uma biblioteca: não tem Storybook nem `dist/` de componentes. A fonte dos componentes é `src/components/ui`.
- Pacote sintetizado de `src/components/ui` (sem dist). O conversor precisa achar `node_modules/hub-sac-greenn`: use o node_modules isolado `.design-sync/.cache/nm` (links pra cada pacote de `node_modules/` + `hub-sac-greenn -> raiz do repo`). Recriar numa máquina nova:
  `NM=.design-sync/.cache/nm; rm -rf $NM; mkdir -p $NM; for e in node_modules/* node_modules/.bin; do ln -s "$(pwd)/$e" "$NM/$(basename $e)"; done; ln -s "$(pwd)" $NM/hub-sac-greenn`
  e rodar os scripts com `--node-modules $NM` (nunca `--entry`: com entry o conversor vira "só tokens").
- CSS do design system = Tailwind compilado do próprio Hub (`dist/assets/index-*.css`) + @import do Google Fonts, gerado em `.design-sync/hub-styles.css` pelo `buildCmd` da config. Rodar o buildCmd antes de todo sync.
- Navegador: sem Chromium do Playwright; usar o Chrome do sistema com `DS_CHROMIUM_PATH=/usr/bin/google-chrome`. Playwright instalado em `.ds-sync` com `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- Fonte do corpo: o `body` recebe `font-body` pelo próprio `src/index.css` (antes só vinha de uma classe no index.html e as prévias saíam em fonte genérica).
- Bug corrigido no caminho: `SegmentedControl` sem `isolate` escondia a pílula do item ativo atrás do fundo (texto branco invisível no claro).
- Versionados (decisão do usuário, 2026-09-24): config.json, NOTES.md, conventions.md e previews/. Ignorados no `.gitignore`: `.cache/` (inclui o node_modules isolado `nm`), `learnings/`, `node_modules`, `*.log` e `hub-styles.css` (gerado pelo buildCmd).

## Known render warns
- Captura por história (`package-capture`) de `EmptyState` e `Dialog` sai vazia: eles têm animação de entrada do framer-motion (opacity 0 → 1) e a captura fotografa antes de terminar. O card real (screenshot do `package-validate`) renderiza certo; notas dadas por ele.

## Re-sync risks
- `hub-styles.css` é derivado do build do app: classe usada só nas prévias e em nenhuma tela do Hub não entra no CSS (Tailwind só compila o que o app usa). Se uma prévia nova usar classe inédita, ela sai sem estilo.
- `Dialog` mostrado como card único (`cardMode: single`) dentro de um contêiner com `transform` que vira o "viewport" do pop-up; a variante escura não é mostrada.
- `Kpi`, `SegmentedControl` e `SortableHeader` em `cardMode: column` por serem largos.
