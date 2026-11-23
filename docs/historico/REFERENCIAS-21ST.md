# Referências visuais do 21st.dev (painéis de estatísticas)

Seleção feita no catálogo do 21st.dev (21/11/2026) para o trabalho em andamento:

- KPIs com conversas e pessoas;
- SalesInsights;
- revisão diária com coaching;
- Tutoria.

**Como usar.** O sistema é React 16 com Material UI v4 e Recharts 2; não usa shadcn, Tailwind nem framer-motion.

- **Não instale** os componentes (`npx shadcn add ...`): eles servem de referência de layout, de hierarquia e de comportamento.
- **Reescreva** cada um com o que já existe:
  - o kit `frontend/src/components/charts/index.js`: `ChartCard`, `Trend`, `Delta`, `FunnelBars`, `RankBars`, `ProgressBar`, `Ring`, `EmptyState`;
  - os cartões `.ui-card`;
  - os tokens de cor `--c-*`, `--surface`, `--line` e `--text-1/2`.
- **Sem lib nova.**
- **Toda tela:**
  - trata carregando (esqueleto), vazio e erro;
  - funciona em 390 px;
  - respeita `prefers-reduced-motion`.

Para abrir um link, entre na página do componente: a prévia e o vídeo mostram o comportamento.

---

## 1. KPIs: conversas e pessoas contatadas no lugar de mensagens

**O que mostrar em cada cartão:**
- o número grande;
- o rótulo curto em `--text-2`;
- a variação contra o período anterior, verde ou vermelha conforme o que é bom para aquele número (com `Delta inverse` quando menos é melhor);
- uma linha fina de tendência por dia (`Trend`).

**Referências:**
- **KPI Tile**, a mais próxima do que queremos: número que rola até o valor novo, seta da variação, sparkline com o valor do dia sob o mouse ou nas setas do teclado, e estados de carregando e vazio. https://21st.dev/@osagi/components/kpi-tile
- **Stat Card**: a variação muda de cor pelo sentido do que é boa notícia, o que serve para "tempo de primeira resposta", em que cair é bom. https://21st.dev/@aadixc0de/components/stat-card
- **Tweenly Chart KPI**: tem uma barra de meta opcional, boa para "pessoas contatadas x meta do dia". https://21st.dev/@mirukullacode/components/tweenly-chart-kpi
- **Count Up Animation**: só o efeito do número contando, no formato `pt-BR` (`Intl`). https://21st.dev/@wensity/components/count-up-animation

**Regra de número:**
- "Conversas" = tickets com pelo menos uma mensagem no período.
- "Pessoas contatadas" = contatos distintos que receberam mensagem da equipe ou da IA.
- Mensagens soltas deixam de ser o número principal.
- Cada cartão traz a explicação do `useDefinitions`.

## 2. SalesInsights + `GET /analytics/commercial` + foto do processo na matrícula

**Layout:**
- uma grade "bento", com cartões de tamanhos diferentes;
- no alto, os KPIs;
- no meio, o funil e a tendência;
- embaixo, os insights em texto.

**Referências:**
- **Analytics Bento**: grade de cartões com linha de tendência, tooltips e contagem animada, em claro e escuro, só com SVG. https://21st.dev/@romanvasnev/components/analytics-bento
- **Insight Cards**: cartão com rótulo, valor, mini barras, variação e **uma nota escrita pela IA**. É o formato de "SalesInsights": número + frase curta do que fazer. https://21st.dev/@arihantcodes_1f7b8c4d/components/insight-cards
- **Funil:**
  - **Conversion Funnel Area Chart**, onde se vê em que etapa as pessoas saem (https://21st.dev/@ahmedmayara/components/conversion-funnel-area-chart);
  - **Funnel Chart**, com rótulos em cada etapa (https://21st.dev/@bklitai/components/funnel-chart).
  - Implementar com o `FunnelBars` do kit, que já existe: a referência é só para o visual da queda entre etapas.
- **Metric Trend Chart**: troca de métrica no mesmo gráfico (conversas, propostas, matrículas), comparação com o período anterior e marcações de evento, por exemplo "campanha enviada". https://21st.dev/@wrapcoders/components/metric-switcher-trend-chart-demo

**Foto do processo na matrícula** (em que etapa cada matrícula estava ao fechar):
- **Process Timeline**, a mais limpa: etapas verticais com check nas concluídas e número nas pendentes. https://21st.dev/@shadcnui-blocks/components/timeline-05
- **Steps**: versão horizontal com estados concluída, atual, próxima e erro, boa para a linha do tempo dentro do cartão do lead. https://21st.dev/@adit-firdaus/components/steps
- Reaproveitar as mesmas 13 etapas e os mesmos nomes do copiloto (`CommercialServices/Process.ts`, `STEP_LABEL`), para o gestor ver o mesmo processo que o consultor vê.

## 3. Revisão diária pela IA + coaching

**Formato:**
- uma lista de pontos do dia por consultor, cada um com o que aconteceu, o exemplo da conversa e uma sugestão de como fazer melhor;
- botões para "útil / não útil" e "marcar como visto".

**Referências:**
- **AI Task List**: lista com estados pendente, em andamento, feito e falhou, mudando no lugar. Serve para o checklist da revisão ("respondeu em até 5 min", "enviou a grade", "pediu nome e CPF"). https://21st.dev/@educalvolpz/components/ai-task-list
- **Approval Card**: cartão de decisão humana (aceitar ou recusar uma sugestão da IA). Serve para o coordenador validar o coaching antes de ir ao consultor. https://21st.dev/@syeddhasnainn/components/approval-card
- **AI Citations**: cada afirmação com um "chip" da fonte. Na revisão, o chip abre a conversa e a mensagem citadas, para o coaching nunca ficar sem prova. https://21st.dev/@kokonutd/components/ai-citations
- **Classificação da equipe**, se fizer sentido mostrar:
  - **Leaderboard Table**: posição, avatar, pontuação, sequência de dias e subida ou descida na semana (https://21st.dev/@arihantcodes_1f7b8c4d/components/leaderboard-table);
  - usar com cuidado: o foco é coaching, não exposição. Sugestão: cada consultor vê só a própria posição, e o gestor vê todos.

**Regras do projeto:**
- textos sem emoji, curtos e em português;
- a IA nunca inventa números: cada ponto da revisão sai de dados reais (tempo de resposta, etapas do copiloto, mensagens);
- a revisão conta no limite diário de tokens (`dailyTokenCap`).

## 4. `GET /analytics/tutoria`

**O que mostrar:**
- alunos na ambientação, com acesso enviado e sem acesso;
- tempo da matrícula ao primeiro contato do tutor;
- retenção;
- conversas por tutor.

**Referências:**
- **Heat Calendar**: grade de intensidade por dia, com leitura ao passar o mouse e seleção de período que soma os dias. Serve para "contatos do tutor por dia" ou "atividade dos alunos". https://21st.dev/@starc007/components/heat-calendar
- **Progress Metric Card**: número grande com curva de progresso ou barras, para "% de alunos com acesso enviado". https://21st.dev/@makviesainte/components/progress-metric-card
- **Ring / ProgressBar** do kit, para a meta de ambientação de cada tutor.

## Efeitos (para todos os painéis)

- **Esqueleto ao carregar:**
  - **Loading Animations Demo**, um painel inteiro em esqueleto que vira o conteúdo (https://21st.dev/@daiwiikharihar/components/loading-animations-demo);
  - **Skeleton Loader** (https://21st.dev/@animbits/components/loaders-skeleton).
  - Usar o `Skeleton` do MUI v4 (`@material-ui/lab`) no lugar de um novo.
- **Número contando, linha que se desenha e cartões que aparecem em sequência:** no máximo 300 ms, e nada disso com `prefers-reduced-motion`.
- **Não usar:** brilhos, gradientes fortes ou efeitos 3D. O sistema segue o estilo plano dos tokens (`dash.css` "sem efeitos").
