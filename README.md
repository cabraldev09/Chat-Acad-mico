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

## Testes

`npm --prefix backend run test:channels` sobe o backend com um banco descartável e servidores falsos do Telegram e da Graph API
da Meta, e verifica canais, assinatura de webhooks, mídia, chatbot, CRM e campanhas com modelo (46 verificações).

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
