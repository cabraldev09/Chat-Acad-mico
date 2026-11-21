# Continuar o plano (passagem de trabalho entre sessões do Claude)

Atualizado em 20/11/2026. Este arquivo existe para que outra sessão ou conta do Claude continue de onde a anterior parou, sem depender do histórico do chat.

## 1. Onde está o código

| O quê | Onde |
|---|---|
| Já no `main` | Até o PR #98. A seção 2 (modelos da Meta, contato da tutoria, curso primeiro, rascunho, prontidão, perfis) entrou no #95; os #96–#98 vieram de outra sessão |
| Este PR (afiliado no número oficial, semana do time, formulário de usuário) | Branch `claude/system-agent-analysis-improvements-n0anpw`, ver a seção 7 |

**Próxima tarefa:** acompanhar o CI do PR aberto a partir desta branch, mesclar e conferir no servidor (seção 7).

## 2. O que entrou no PR #95

### Modelos da Meta, todos na categoria Utilidade e protegidos
- Tela **Configurações → Modelos da Meta**: `frontend/src/pages/SettingsHub/MetaTemplates.js`.
- Backend em `backend/src/services/CampaignServices/Templates.ts`:
  - `TEMPLATE_PACK`, `createTemplate`, `sendTemplatePack`, `allTemplates`, `linkApproved`;
  - o controller é `controllers/MetaTemplatesController.ts`;
  - as rotas são `GET/POST /meta/templates` e `POST /meta/templates/pack`, só para gestores.
- Todo modelo vai como `category: "UTILITY"` com `allow_category_change: false`: se a Meta achar que é Marketing, recusa em vez de cobrar como Marketing.
- O modelo aprovado entra sozinho na configuração correspondente, e só se ela estiver vazia:
  - `atendimento_template_name`
  - `tutoria_template_name`
  - `boas_vindas_template_name`
- Workflow `.github/workflows/meta-modelos.yml`, que roda `backend/scripts/meta-modelos.js` no contêiner `chat-academico-api-1`. Só funciona depois que estiver no `main`. **Depois do merge e do deploy, disparar esse workflow** para enviar o pacote. A opção "só status" apenas lê a situação dos modelos.

### Matrícula: tutor do polo ou outro tutor, e o número da tutoria para o aluno
- `backend/src/services/CrmServices/EnrollLead.ts`:
  - `chosenTutor()`: se o tutor escolhido for de outro polo, entra na fila de tutoria do polo da matrícula e a equipe recebe um aviso;
  - a edição de uma matrícula confirmada continua aceitando só tutores do polo.
- `GET /tutors` (`PoloController.allTutors`) e a opção "Outro tutor" em `frontend/src/pages/CRM/EnrollDialog.js`.
- `backend/src/services/CrmServices/TutoriaContact.ts` envia ao aluno, na conversa do consultor (`ticketId` fixo, sem reabrir conversa):
  - o texto com o nome do tutor e o pedido para agendar a ambientação;
  - o cartão de contato, quando o número é de QR;
  - o modelo `boas_vindas_matricula` quando a conversa está fora das 24 horas;
  - `byPerson: true`, para não ser barrado pelo horário de atendimento.
- Configuração `tutoria_numero` em Configurações → Tutoria.

### Processo único, com o curso primeiro
- `Rules.ts`: `setQuestionOrder` e `getQuestionOrder`; `nextQuestionOf` segue a ordem do Processo do copiloto.
- A ordem é carregada na subida (`server.ts`) e atualizada ao salvar o copiloto (`CopilotServices/Settings.ts`).
- O "oi" pergunta o curso. O roteiro do agente (`AiAgentController.script`) segue a mesma ordem.

### Rascunho do agente
- As mudanças ficam em `persona.draft`, pelas rotas `PUT` e `DELETE /ai-agents/:id/draft`.
- `POST /ai-agents/:id/test` com `useDraft: true` testa o rascunho, só em memória.
- "Publicar" é o PUT normal: limpa o rascunho e registra o histórico.
- Interface: `AgentEditor.js` (faixa do rascunho e botões) e `TestTab.js` (opção "usar o rascunho" no teste simples).

### Proteção para o uso do time
- **Workers:** StaleRuns, AiReactivation, HandoffSla e ChatbotReminder filtram no SQL e ordenam pelo mais antigo.
- **FlowRunner:** trava contra rodadas sobrepostas.
- **DataRetention:** usa o fuso da empresa.
- **CloudHealth:** o limite de e-mails fica guardado em configuração (`cloud_alert_at_<id>`).
- **Campanha** (`CampaignRunner`): recusa previsível vira `failed`, e não `uncertain`.
- **Prontidão do sistema:** `GET /system/readiness`, com o serviço `services/SystemServices/Readiness.ts` e a tela `SettingsHub/Readiness.js`.

### Perfis
- **Menu** (`layout/MainListItems.js`):
  - Contatos e Metas ficam só para a gestão;
  - Funil e Painel do CRM também aparecem para o tutor;
  - "Estatísticas" vira "Meus números" para a equipe.
- **Escopo** (`middleware/scope.ts`): o tutor vê também os leads em que ele é o dono (`ownerId`).
- **Estatísticas da tutoria:**
  - `GET /onboarding/stats?period=semana|mes|ciclo|90`;
  - o tutor vê só os próprios dados (`scope: "mine"`);
  - "ciclo" é a meta (`Goal`) em andamento, por exemplo 2027.1, de 17/11/2026 a 03/05/2027;
  - a página `/estatisticas/tutoria` deixou de ser só para gestores.

## 3. Estado dos testes

- **Unitários:** 618 passando (`cd backend && npx vitest run tests/analysis tests/channels`).
- **tsc, i18n e auditoria de rotas:** passando.
- **Ponta a ponta (`backend/scripts/channels-e2e.js`)**: na última rodada local completa, 228 de 236. Depois disso, dois testes foram ajustados à regra nova:
  - o agente com o curso primeiro (cenário "MA");
  - o tutor lendo os próprios números em `/onboarding/stats`.

  Suspeita, ainda não confirmada: as outras seis falhas seriam efeito em cascata do primeiro teste do agente, que parou no meio e deixou o agente ligado (menus do chatbot, fluxos visuais, botões e a regra do MEC para Biomedicina). **A rodada que conferiria isso foi interrompida.** Rodar de novo, localmente ou no CI.
- **Rodar a suíte localmente** (Postgres 16 já instalado no contêiner da nuvem):
  ```bash
  D=/var/tmp/pgdata; mkdir -p $D && chown postgres:postgres $D
  su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/initdb -D $D -A trust -U postgres"   # só na primeira vez
  su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D -l $D/log -o '-p 5432 -k /tmp' start"
  cd backend && npm run build && PGUSER=postgres PGHOST=localhost LOGIN_RATE_MAX=100 NODE_ENV=test node scripts/channels-e2e.js
  ```

## 4. O que falta do plano

1. **PR desta branch:** abrir, deixar o CI verde e mesclar.
2. **Depois do deploy:**
   - disparar "Enviar modelos para a Meta";
   - ligar "Autorizar envios com templates aprovados" em Configurações → Operação e custos;
   - preencher o número da Tutoria;
   - acompanhar a tela Prontidão do sistema.
3. **Painel do CRM e Estatísticas:** hoje os dois têm papéis diferentes:
   - **Painel do CRM:** a ação do dia (novos para conferir, pontos de atenção);
   - **Estatísticas / Meus números:** a evolução.

   Ainda dá para enxugar: tirar do Painel o bloco "Resultados do período", que repete o que está nas Estatísticas, e colocar no lugar um link para "Meus números". Fazer só se o usuário confirmar.
4. **Rascunho do agente comercial:** o agente comercial é testado pelo motor real (`/flows/:id/simulate`), que ainda ignora `persona.draft`. Hoje o rascunho só vale no teste simples.
5. **Cursos do site:** o site bloqueia a coleta automática. Pedir ao usuário a planilha ou a página salva.
6. **Relatório final no chat** para o usuário:
   - o que está ótimo;
   - o que falha ou pode falhar;
   - o que configurar antes de colocar o time;
   - um guia rápido por perfil: consultor, tutor, coordenação e administrador.

## 5. Descrição sugerida para o PR

Título: *Modelos da Meta em Utilidade, contato da tutoria na matrícula, processo com o curso primeiro, rascunho do agente, prontidão e perfis enxutos*

O conteúdo é a seção 2 deste arquivo, mais a seção 3 (testes).

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

## 7. Afiliado no número oficial, semana do time e formulário de usuário (20/11)

- **Semana do time:**
  - seg–qui 08h–18h, sex 08h–17h, sem fim de semana: `standardWeek()` em `backend/src/helpers/BusinessTime.ts`, `frontend/src/utils/workWeek.js`;
  - a migração `20261222000003-standard-week.ts` liga o horário da empresa com essa semana e dá a mesma semana a quem não tinha horário ou estava no padrão antigo (seg–sex 08–17); o horário anterior da empresa fica em `business_hours_before_20261120`;
  - num banco sem usuários (os testes) a migração não faz nada.
- **Formulário de usuário** (`frontend/src/components/UserModal/index.js`):
  - horário por dia, para consultor, tutor e relacionamento; não apaga mais o horário por dia salvo em Gestão Comercial;
  - "Número que a pessoa usa" vem com o número oficial da equipe (tutoria para tutor, atendimento para os outros); o backend recusa uma conexão que não existe;
  - "Celular da pessoa (opcional)" no lugar do "WhatsApp de contato".
- **Afiliado:**
  - o portal manda para o número oficial (`affiliate_support_phone` ou a conexão oficial de atendimento), com a mensagem pronta e o nome do consultor;
  - quem escreve no número oficial e é afiliado (reconhecido com e sem o 9) vai direto para `Affiliate.ownerId`, sem IA, sem rodízio e sem virar lead (`FindOrCreateTicketService.routeAffiliate`, `LeadCore.ensureLead`);
  - um cartão de contato enviado ao número oficial vira indicação do consultor (`helpers/CloudContacts.ts`, `channels/meta.ts`).
- **Prontidão:** novos itens "Horário de cada pessoa", "Número de cada pessoa", "Afiliados com consultor" e "Afiliados fora do funil", este com o botão "Tirar do funil" (`POST /system/affiliate-leads/clean`).
- **Depois do deploy:**
  - conferir em Configurações → Atendimento e horário;
  - um afiliado de teste escreve no número oficial e cai na conversa do consultor dele;
  - rodar "Tirar do funil" em Prontidão.
