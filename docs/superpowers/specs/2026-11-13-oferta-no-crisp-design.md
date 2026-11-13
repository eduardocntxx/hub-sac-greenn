# Oferta no Crisp — desenho e plano

Data: 13/11/2026. Status: proposta, aguardando validação do Eduardo e do Felipe.
Maquete: artefato "Oferta pronta no Crisp" (privado do Eduardo).

## 1. Por que

Na RR de 13/11 o SE decidiu que ajudar o produtor a vender mais (TPV) vem antes de pedir avaliação. O playbook de
fechamento do Felipe diz como: no fim de todo atendimento de produtor, já com o chamado resolvido, o atendente aponta
uma ferramenta que o produtor não usa (problema), o resultado médio dela em porcentagem (impacto) e oferece configurar
junto (solução). No máximo 2 ferramentas por atendimento, cada oferta marcada com uma tag `oferta-*` no Crisp.

O que trava hoje é a logística, não a vontade: para cada produtor o atendente sai do Crisp, procura o produtor no
Greenn OS, lê o que está desligado, abre o gerador do Felipe, marca, copia, volta e marca a tag. O time não tem esse
tempo.

**Sucesso** = o atendente faz a oferta com um clique, sem sair do Crisp, em quase todo atendimento de produtor.

## 2. O que o atendente vê

Uma seção nova no painel lateral do Crisp, logo abaixo do AskGreenn, que já abre preenchida quando a conversa é de
produtor:

- **Não usa**: até 2 ferramentas, já marcadas, com uma linha de "por quê" (ex.: "R$ 4.870 em Pix/boleto pendente em
  12 meses"). Os valores em R$ são só para o atendente; na mensagem vão só as porcentagens do playbook.
- As outras ferramentas do playbook aparecem desmarcadas, para o atendente incluir se souber que fazem sentido.
- **Enviar oferta**: manda a mensagem de fechamento do Felipe em nome do atendente, só com as ferramentas marcadas, e
  marca as tags `oferta-*` na conversa.
- O texto da mensagem fica visível no painel para quem quiser copiar e editar antes de mandar pelo campo de resposta.

Quem é produtor é decidido pelo Greenn OS (o e-mail da conversa tem conta de produtor lá), não pelo tipo de cliente do
Crisp, que às vezes chega atrasado. Estados sem oferta: "Não achei este e-mail no Greenn OS (se for comprador, é
normal)"; "Já usa as ferramentas que o Greenn OS enxerga"; erro com a mensagem do que falhou. Nunca bloqueia o
atendimento.

Por que no painel e não numa nota automática: a nota do Crisp é só texto (sem botão) e poluiria toda conversa de
produtor. O painel fica ao lado do "Enviar CSAT", que o atendente já clica no fim da conversa, que é o momento exato
em que o playbook pede a oferta.

## 3. O que o Crisp permite (conferido nos docs em 13/11)

| Lugar | Dá | Não dá |
|---|---|---|
| Nota privada | texto | botão |
| Painel lateral, widget iframe | página nossa, recebe `website_id`, `session_id` e `token` na URL; altura de 300 px, expansível | escrever no campo de resposta do atendente |
| Mensagem com botões (picker) | existe | é vista pelo cliente, não serve para a equipe |

Por isso o botão envia a mensagem direto pela API, e quem quer editar copia do painel.

## 4. Como funciona

```
Crisp (painel, iframe) ──session_id──▶ Edge Function crisp-oferta (Hub)
                                          ├─ crisp_conversations: e-mail do cliente da conversa
                                          ├─ Greenn OS: produtor pelo e-mail → uso da plataforma
                                          ├─ escolhe até 2 ferramentas e monta a mensagem
                                          └─ (Enviar) API do Crisp: mensagem + tags; grava em ofertas_crisp
```

- **Página do painel**: HTML estático servido pela Vercel numa rota própria (ex. `/crisp/oferta`), fora do login do
  Hub. Precisa de uma exceção no `vercel.json` só para essa rota: hoje todas as rotas mandam `frame-ancestors 'none'`
  e `X-Frame-Options: DENY`; a rota do painel passa a aceitar `frame-ancestors https://app.crisp.chat` e a carregar o
  SDK do widget do Crisp. As outras rotas continuam como estão. (Edge Function não serve: o Supabase entrega HTML
  como texto puro no domínio padrão.)
- **Edge Function `crisp-oferta`** (`supabase/functions/`, mesmo padrão da `sync-migracoes`, publicada com
  `--no-verify-jwt`), duas ações:
  - `diagnostico`: recebe o `session_id`, lê o e-mail do cliente em `crisp_conversations` (já está no Hub, sem
    chamar o Crisp), busca o produtor no Greenn OS e devolve as ferramentas, o porquê e o texto.
  - `enviar`: recebe o `session_id`, as ferramentas marcadas e o nome do operador (o SDK do widget entrega), envia a
    mensagem pela API do Crisp, adiciona as tags e grava uma linha em `ofertas_crisp`.
  - Autorização: a chamada só vale com o `token` que o Crisp passa ao iframe, conferido com o do nosso site.
    Como conferir exatamente está no item 7.
- **Tabela `ofertas_crisp`** (Hub): `crisp_session_id`, `produtor_id`, `ferramentas`, `operador`, `enviado_em`. RLS
  sem acesso para `anon`/`authenticated`, só a função grava. É o que permite medir a taxa de ativação depois da Black
  (produtor + ferramenta + data da oferta), que as tags sozinhas não dão.
- **Segredos** (cadastrados pelo Eduardo no painel do Hub, nunca no código): token do Greenn OS e chave do plugin
  do Crisp.

## 5. Regras de escolha (validar com o Felipe)

Janela de 12 meses, a mesma do "Onde atuar" do Greenn OS. Produtor com menos de **10 pedidos** no período não recebe
sugestão (sem venda, não há ticket para subir).

| Ferramenta | "Não usa" quando | Peso para ordenar |
|---|---|---|
| Closer AI | nenhum produto com Closer AI ativo | R$ em Pix/boleto pendente e cartão recusado |
| Order Bump | nenhum pedido com bump | pedidos sem bump |
| Upsell one-click | nenhuma venda de upsell | pedidos sem upsell |

Ordem: a que deixa mais dinheiro na mesa primeiro; no máximo 2 marcadas. Checkout personalizado, Vitrine (Club) e
Vision AI aparecem desmarcadas, sem diagnóstico, até o Greenn OS mostrar esses dados.

A mensagem é o modelo do playbook: abertura fixa ("Eu poderia te mandar a pesquisa de avaliação agora…"), um bloco
por ferramenta (o que é, impacto em %, link do passo a passo) e o fechamento "Bora configurar agora?". Sem IA: texto
fixo, igual ao gerador do Felipe.

## 6. Fora do escopo

- Nota automática na conversa e qualquer uso de IA.
- Escrever no campo de resposta do atendente (o Crisp não permite).
- Indicadores (taxa de ativação, ticket dos ativados): a tabela já guarda o necessário; o painel fica para depois da
  Black.
- Mexer no AskGreenn ou no fluxo do CSAT: a seção nova é de um plugin separado.

## 7. Dependências e riscos

1. **Acesso aos dados do Greenn OS (bloqueante).** A API dele só responde com o login do navegador. Precisa de um
   token de serviço ou de acesso à mesma base que ele lê, com o Rafa. Sem isso o painel não sabe o que está
   desligado e não vale construir.
2. **Plugin do Crisp com widget iframe.** Criar um plugin privado no Marketplace do Crisp (quem tem a conta de
   desenvolvedor do plugin atual) e instalar no site. Conferir como validar o `token` que o Crisp passa ao iframe.
3. **Em nome de quem a mensagem sai.** A API aceita um apelido (`nickname`) no envio; confirmar se aparece para o
   produtor como o atendente que clicou. Se não aparecer, sai como "Equipe Greenn".
4. **E-mail do Crisp diferente do da conta Greenn.** O painel mostra "Não achei este e-mail" e não sugere nada errado.
5. **Tempo do produtor.** A ferramenta tira o trabalho de fazer a oferta, não o de configurar junto quando o produtor
   topa. Isso é decisão do Felipe.
6. **Prazo.** Black em 27/11; nada novo sobe em 26/11. Disputa espaço com o placar da fila (16/11) e o Compliance
   (17 a 25/11).

## 8. Plano

| Quando | O quê | Quem |
|---|---|---|
| até 17/11 | Pedir ao Rafa o acesso aos dados do Greenn OS (token ou base) | Eduardo |
| até 17/11 | Validar com o Felipe as regras do item 5 e pegar os links de passo a passo de Order Bump, Upsell, Vitrine e Vision | Eduardo |
| até 17/11 | Criar o plugin privado no Marketplace do Crisp e cadastrar os segredos no painel do Hub | Eduardo |
| +2 dias do acesso | Fase 1, só leitura: `crisp-oferta` (diagnóstico), página do painel e exceção no `vercel.json`. Testar com 2 ou 3 atendentes em conversas reais | Claude |
| +1 dia | Fase 2: botão Enviar oferta, tags e `ofertas_crisp`. Teste ponta a ponta numa conversa de teste | Claude |
| até 25/11 | No ar para o time todo | — |
| depois da Black | Taxa de ativação (ligou a ferramenta em até 7 dias) e as 3 ferramentas que faltam, quando o Greenn OS mostrar | — |

**Ponto de corte:** sem o acesso ao Greenn OS até 19/11, não entra antes da Black. Nesse caso, fica para dezembro, que
é o mês que o Felipe quer usar para subir o TPV.

## 9. Testes

- A regra de escolha é uma função pura (dados de uso → ferramentas + texto), com testes `deno test` cobrindo: nenhuma
  venda, tudo ligado, só Closer desligado, as três desligadas (corta em 2), produtor não encontrado.
- Ponta a ponta numa conversa de teste do Eduardo, com a conta de teste do Greenn OS, antes de liberar para o time.
- Conferir que a rota do painel abre dentro do Crisp e que as outras rotas do Hub continuam bloqueando iframe.
