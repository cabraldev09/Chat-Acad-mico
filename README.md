# Chat Acadêmico

Plataforma de atendimento multicanal baseada no [Whaticket Community](https://github.com/canove/whaticket-community) (MIT),
com recursos de plano pago construídos do zero: canais extras, chatbot, IA, campanhas, estatísticas e uma interface nova.

## Recursos

| Recurso | Onde |
|---|---|
| Multicanal: WhatsApp (QR), WhatsApp Cloud API, Messenger, Instagram, Telegram, Chat web | Conexões → Adicionar |
| Chatbot por fluxo (menus, submenus, palavras-chave, transferir p/ fila/atendente, encerrar, passar p/ IA) | Chatbot |
| Agentes de IA (Anthropic/OpenAI) com base de conhecimento e transferência p/ humano | Agentes de IA |
| Atribuição automática (rodízio / menos ocupado) por fila | Filas |
| Horário de atendimento e mensagem fora do horário | Conexões → editar |
| Etiquetas e mensagens agendadas | Etiquetas / Agendamentos |
| Campanhas em massa (listas, CSV, variáveis, intervalos, relatório) | Campanhas |
| Estatísticas e monitor ao vivo | Estatísticas / Monitor ao vivo |
| API com tokens e webhooks de saída assinados (HMAC) | API & Webhooks |

## CRM de captação (ensino superior)

Funil de matrícula pensado para acompanhar leads do ensino superior, integrado ao atendimento:

* **Todo contato que escreve vira lead** automaticamente, em qualquer canal (grupos não entram). Contatos já existentes são
  cadastrados na inicialização; sem duplicar (telefone, e-mail ou contato).
* **Funil Kanban** com arrastar-e-soltar (Novo lead → Primeiro contato → Qualificado → Visita/aula experimental → Proposta →
  Matrícula em andamento → Matriculado / Perdido). Etapas e cursos editáveis. Motivo obrigatório ao marcar como perdido.
* **Ficha do lead**: curso, modalidade, turno, ingresso, forma de pagamento, ENEM, origem/UTM, linha do tempo, tarefas com
  lembrete em tempo real, pontuação (0–100) explicável e botão que abre a conversa.
* **Distribuição** em rodízio entre consultores; o primeiro atendimento move o lead de etapa e mede o tempo até o 1º contato.
* **Captação**: formulário público com consentimento LGPD (embutível por `iframe`, grava UTMs), importação por CSV e
  `POST /api/v1/leads` para RD Station, Zapier/Make, landing pages.
* **Painel**: conversão, funil acumulado, origem, cursos, motivos de perda, desempenho por consultor, alertas (sem 1º contato,
  tarefas atrasadas, leads esfriando). Webhooks: `lead.created`, `lead.stage_changed`, `lead.won`, `lead.lost`.

## Propostas de bolsa

Depois de qualificar o lead, o consultor gera a **proposta de bolsa** direto da ficha (botão "Gerar proposta"):

1. Escolhe o curso (traz mensalidade bruta e semestres do catálogo) e o modelo.
2. Ajusta a **primeira mensalidade ou a bolsa %**: um recalcula o outro. A **prévia do documento é atualizada ao vivo**.
3. Baixa o **PDF**, copia o link ou **envia ao candidato pelo mesmo canal da conversa** (WhatsApp, Telegram…). O lead vai para
   "Proposta enviada" e o atendimento fica com o consultor. O sistema registra quando o candidato abre o link.

O documento traz: mensalidade bruta, bolsa aplicada, primeira mensalidade, taxa de matrícula, vencimento e parcelas, faixas de
pontualidade (até o dia 10 / dias 11–25 / após o vencimento), projeção por semestre nos cenários de reajuste anual mínimo e teto,
produtos e total. As regras (matrícula, pontualidade, reajustes, bolsa 1º semestre × demais, textos) ficam em **Configurar CRM →
Modelos de proposta**; instituições (nome, CNPJ, logo) e o catálogo de cursos (com importação por CSV) também ficam lá.
Propostas já enviadas guardam uma cópia dos valores e textos: mudar o modelo não altera o que o candidato recebeu.
Gerar PDF exige o Google Chrome (`CHROME_BIN`).

## Qualificação do lead

Além de curso, forma e período de ingresso, a ficha registra o **momento de decisão** (quer matricular agora, esta semana, este mês,
só pesquisando) e o **objetivo com o curso**. O momento de decisão pesa na pontuação do lead e destaca no funil quem quer matricular agora.

## Ingresso por transferência e projeção

A ficha do lead tem **forma de ingresso** (vestibular, ENEM, transferência, portador de diploma, aproveitamento) e, nas formas que
permitem, o **semestre do curso em que o aluno ingressa**. A proposta projeta apenas os semestres que ele ainda vai cursar, com o
calendário a partir do período de ingresso. Quando a transferência exige **semestres de adaptação** (ou dependências), eles se somam ao que
falta no currículo e a projeção pode passar da duração normal do curso; o consultor também pode ajustar o total direto na proposta. O
administrador define os períodos captados e o padrão em Configurar CRM → Automação.

## Taxa de matrícula por PIX (Efí)

Com o **CPF** do candidato na ficha, a aba **Matrícula** gera uma cobrança PIX imediata na Efí (QR Code e copia e cola) e pode
enviá-la pelo canal da conversa. O pagamento é detectado de duas formas: pelo **webhook** da Efí e por **consulta periódica** das
cobranças abertas (funciona em localhost, sem URL pública). Nenhum aviso é aceito sem confirmar a cobrança na própria Efí. Ao
confirmar, o lead avança de etapa (configurável), a equipe é avisada e o evento `payment.paid` sai nos webhooks.

Configuração (admin): Configurar CRM → Pagamentos (Efí): ambiente, Client ID/Secret, chave PIX e o certificado `.p12`
(guardado em `backend/secrets/`, fora do Git). O CPF não aparece em listas e só a ficha detalhada o exibe.

## Testes

`npm --prefix backend run test:channels` sobe o backend com um banco descartável e servidores falsos do Telegram e da Graph API
da Meta, e verifica canais, assinatura de webhooks, mídia, chatbot, CRM e campanhas com modelo (68 verificações, incluindo a conferência célula a célula das propostas de referência e o fluxo PIX contra uma Efí simulada).

## Rodando localmente (macOS)

Requisitos: Node 22, MariaDB/MySQL e Google Chrome (usado pelo `whatsapp-web.js`).

```bash
brew install node@22 mariadb && brew services start mariadb
mariadb -e "CREATE DATABASE whaticket CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"

cp backend/.env.example backend/.env   # ajuste DB_*, JWT_*, CHROME_BIN e PORT=8080
cp frontend/.env.example frontend/.env
(cd backend && npm install && npm run build && npx sequelize db:migrate && npx sequelize db:seed:all)
(cd frontend && npm install)

./start-local.sh      # frontend em :3000, backend em :8080
./stop-local.sh
```

Login inicial: `admin@whaticket.com` / `admin` — **troque a senha**.

## Configuração por canal

* **Telegram**: crie um bot no @BotFather e cole o token. Funciona em localhost.
* **Chat web**: sem credenciais; a tela da conexão mostra o código para colar no site e um link de teste.
* **WhatsApp Cloud / Messenger / Instagram**: precisam de um app na Meta e de URL pública HTTPS. Em localhost use um túnel
  e defina `PUBLIC_URL=https://...` em `backend/.env`. Cole a URL de webhook mostrada na conexão no painel da Meta.
  O **App Secret** é obrigatório (valida a assinatura dos webhooks).
* **IA**: informe a chave em Agentes de IA (ou uma chave por agente).

## Interface

React 16 + Material-UI v4 com tema próprio (Catalina Blue `#0B4279`, Cerulean `#0693E3`, Gorse `#FEF84C`),
ícones Lucide e logotipos oficiais dos canais (Simple Icons).

## Licença

MIT, herdada do projeto original.
