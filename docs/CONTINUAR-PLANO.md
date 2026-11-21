# Continuar o plano (passagem de trabalho entre sessões do Claude)

Atualizado em 21/11/2026. Este arquivo existe para que outra sessão ou conta do Claude continue de onde a anterior parou, sem depender do histórico do chat.

## 1. Onde está o código

| O quê | Onde |
|---|---|
| Já no `main` e no servidor | Até o #111 (revisão por agentes: #104, #107, #108, #109; correção do teste da meia-noite: #111) |
| Dados reais das estatísticas (este PR) | Branch `claude/system-agent-analysis-improvements-n0anpw`: conversas e pessoas contatadas, `GET /analytics/commercial`, revisão diária pela IA (`ConsultantReviews`), treinamento sugerido, `GET /analytics/tutoria`. Detalhes em `docs/ANALYTICS.md` |

## 2. Próximas tarefas, em ordem

### PR 1b: Custos como a cobrança é de verdade (pedido do usuário com prints de Configurações → Custos)
- **Meta (`SettingsHub/MetaCosts.js` + `MetaCostsController`):**
  - um bloco "Como a Meta cobra": por modelo entregue, por categoria (Marketing, Utilidade, Autenticação); o atendimento na janela de 24 h é gratuito, e o modelo de Utilidade dentro da janela também;
  - a tarifa usada por categoria, com a data da tabela;
  - "Mensagens cobradas" vira "Modelos cobrados" por categoria.
  - Conferir os valores na página oficial de preços da Meta antes de colocar os padrões do Brasil.
- **IA (`SettingsHub/AiCosts.js` + `AiServices/Usage.ts`):**
  - preços padrão dos modelos conhecidos (por exemplo `gpt-4o-mini`), editáveis em `ai_price_<model>`, para o gasto não aparecer zerado;
  - gasto real pela API de custos da organização da OpenAI (`/v1/organization/costs`), que pede uma chave de administrador, guardada criptografada pelo formulário de chaves (nunca no chat);
  - "Quanto ainda tem": a OpenAI não tem API de saldo. O gestor informa o crédito ou orçamento do mês, e a tela mostra o restante e avisa aos 80%.

### PR 2: o painel novo em `/estatisticas` e o redesenho de Configurações (precisa do MCP do 21st.dev)
- **Antes de começar:** o usuário conecta o 21st.dev em https://claude.ai/customize/connectors e abre uma sessão nova.
- **Compatibilidade:** os componentes de lá costumam vir em Tailwind + shadcn para React 18. Aqui é React 16 + MUI v4, sem Tailwind. Use-os como referência e traduza para CSS com os tokens de `frontend/src/styles/ui.css` e o `recharts`, sem trazer Tailwind nem trocar o React.
- **`/estatisticas` deixa de redirecionar** (`pages/Statistics/index.js`, hoje `hubHome`) e vira o painel com as abas Comercial, Consultores, Tutoria e Atendimento:
  - lê `GET /analytics/commercial`, `GET /analytics/coaching` (+ `POST /analytics/coaching/text`) e `GET /analytics/tutoria`;
  - o consultor vê "Meus números" com os mesmos blocos, só dele.
- **Telas que viram abas:** `/estatisticas/tutoria`, `/estatisticas/captacao` e `/reports`, com redirecionamento das rotas antigas. `/gestao-comercial` fica só com a operação (equipe agora, alertas, polos, configuração).
- **Componentes únicos:** um só `Kpi`, `EmptyState` e `PeriodPicker` (hoje há vários: `components/analytics/kit.js`, `components/ui`, `components/charts`).
- **Toda a aba Configurações** mais limpa e configurável.
- **Telas:** carregando, vazio e erro em cada bloco; celular a 390 px sem rolagem lateral.

## 3. Decisões do usuário (21/11)
- **OpenBot (openbot.run):** investigado e não usado.
  - É um aplicativo de computador que roda o Codex/Claude com o login da assinatura.
  - Não tem uma API que devolva a resposta ao servidor.
  - A licença é PolyForm Noncommercial e o WhatsApp dele é não oficial.
  - O processo comercial usa a chave de API da OpenAI (agente com provider `openai`).
- **A IA pode ler as conversas dos consultores** uma vez por dia, sem CPF, telefone e nomes, com teto de gasto.
- **Estatísticas:** um painel novo no lugar, com as telas repetidas virando abas.

## 6. Como trabalhar neste repositório (lições da sessão anterior)

- **Branch e push:**
  - desenvolver na branch `claude/system-agent-analysis-improvements-n0anpw`;
  - o push com `--force` é bloqueado: depois de um merge por squash, usar `git fetch origin <branch> && git merge -s ours FETCH_HEAD` e então dar push;
  - para recomeçar a partir do `main`: guardar o trabalho com `git stash -u`, depois `git checkout -B <branch> origin/main` e `git stash pop`.
- **Merge:** squash, passando `expectedHeadSha` com o SHA completo (`git rev-parse HEAD`).
- **CI:** jobs `verificar`, `telas` (varredura das telas, incluindo celular 390×844), `api-ponta-a-ponta` (canais, responsabilidade, estatísticas) e Vercel.
- **Verificações rápidas:**
  - backend: `node_modules/.bin/tsc --noEmit -p .`, `node scripts/i18n-check.js`, `node scripts/audit-routes.js`;
  - frontend: `node scripts/check-menu-icons.js`.
- **Ícones:** `lucide-react` passa pelo `frontend/src/icons/phosphor-shim.js`, e o ícone precisa existir lá (por exemplo `AlertCircle`; não existe `CircleAlert`).
- **Sequelize:** depois de `Model.update` com `where`, a instância em memória fica velha. Use `instance.set(...)` antes de `instance.update(...)`; foi assim que o Scheduler travou em "enviando".
- **Segurança:**
  - nunca pedir nem colar tokens ou chaves no chat; usar o formulário seguro;
  - workflows imprimem só IDs públicos;
  - a chave de serviço do Supabase que foi exposta deve ser trocada.
