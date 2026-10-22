# Verificações antes de publicar

Rode tudo isto antes de enviar ao GitHub e de atualizar a VPS. Qualquer falha impede a publicação.

| O que | Comando | Pasta |
|---|---|---|
| Tipos do backend | `npm run build` | `backend` |
| Testes de unidade (motor de análise, proposta, e-mails) | `npx vitest run` | `backend` |
| Testes de ponta a ponta (API inteira com WhatsApp/Telegram/Efí simulados) | `NODE_ENV=test CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" CHROME_ARGS="--no-sandbox --disable-setuid-sandbox" LOGIN_RATE_MAX=100 node scripts/channels-e2e.js` | `backend` |
| Responsabilidade pela conversa (visualizar não assume; enviar atribui de forma atômica; ninguém toma a conversa de outro; IA silenciada; concorrência e idempotência) | `NODE_ENV=test npm run test:assign` | `backend` |
| Estatísticas e Centro de Gestão Comercial (mesmos números nas duas telas, permissões, tempo real) | `NODE_ENV=test npm run test:analytics` | `backend` |
| Textos em português e códigos de erro traduzidos | `node scripts/i18n-check.js` | `backend` |
| Esquema do banco (depois de criar uma migração) | `node scripts/build-schema.js` | `backend` |
| Auditoria de rotas por perfil | `node scripts/audit-routes.js` | `backend` |
| **Leitura tardia de evento (erro "reading 'value'")** | `node scripts/check-lazy-events.js` | `frontend` |
| Menu lateral sem ícone repetido | `node scripts/check-menu-icons.js` | `frontend` |
| Build do frontend | `npx vite build` | `frontend` |
| Varredura de todas as telas, 4 perfis + a Central do Afiliado pública (abas, QR Code e arte em Story e Feed), digitando nos formulários | `node scripts/smoke-pages.js portal admin coordenacao consultor tutor` (API em 8080 e `vite preview` em 3000) | `frontend` |

## Por que existe a verificação de leitura tardia de evento

O React 16 reaproveita o objeto de evento depois que o tratador termina. Ler `e.target.value` dentro de uma função
que roda depois (um `setX(x => ...)`, um `setTimeout`, um `.then`, ou depois de um `await`) dá
`Cannot read properties of null (reading 'value')` e derruba a tela. Foi a causa da queda de Afiliados.

Correção: ler o valor antes (`const v = e.target.value; setF(x => ({ ...x, [k]: v }))`) ou chamar `e.persist()` no
começo do tratador. Uma linha que está correta de propósito pode levar o comentário `// lazy-event-ok`.

## Quedas que ficam registradas

Toda tela que cai, parte de tela (aba, grupo de configurações, bloco) que cai e erro que escapa do React
(promessa sem tratamento, erro de script) é gravado em Configurações → Erros de tela, com o mesmo código curto que a
pessoa vê na tela.

## Regras de interface que já quebraram

- Diálogos novos entram pelo componente `Portal` de `pages/Analysis/orig.js` (desenham direto no `body`). Dentro de uma
  página animada, `position: fixed` é medido a partir da página, e o diálogo sai do lugar.
- Os ícones vêm do `lucide-react` 0.292: `HelpCircle` (não `CircleHelp`), `User` (não `UserRound`).
- Resposta de API que não é o formato esperado (um `200` com HTML durante um deploy) não pode derrubar a tela:
  normalize ao receber (`Array.isArray(x) ? x : []`).

## O que o GitHub roda sozinho (`.github/workflows/checks.yml`)

A cada envio para `main` e a cada pull request:

| Trabalho | O que faz |
|---|---|
| `verificar` | `tsc`, textos em português, auditoria de rotas, testes de unidade, build do frontend, verificador de leitura tardia de evento e variáveis inexistentes (ESLint `no-undef`) |
| `api-ponta-a-ponta` | `channels-e2e.js`: a API inteira contra WhatsApp/Telegram/Efí simulados, num banco descartável (Postgres 16) |
| `api-ponta-a-ponta` (2º passo) | `assign-e2e.js`: atribuição, envio humano, concorrência, outbox e tempo real da responsabilidade pela conversa |
| `telas` | sobe a API e o build de produção do frontend e roda `smoke-pages.js` como administrador, coordenação, consultor e tutor, digitando nos formulários; falha se alguma tela cair, der erro de script ou 5xx |

Quando um trabalho falha, o relatório da varredura e o fim do registro da API aparecem no final do trabalho `telas`.

## Regras que já evitaram queda de tela

- **Uma conexão em tempo real por conjunto de salas.** `openSocket(chave)` (`services/socket-io.js`) devolve uma
  alça sobre uma conexão compartilhada. Quem entra nas mesmas salas usa a mesma chave: `"notification"`,
  `` `tickets:${status}` ``, `` `chat:${ticketId}` ``; quem não entra em sala usa a conexão `"global"` (sem argumento).
  Não junte chaves diferentes: o servidor entrega eventos por sala e as listas de conversas dependem disso. No console,
  `window.__socketStats()` mostra as conexões abertas e quantos componentes usam cada uma.
- **Listas de usuários inteiras:** `/users` responde 20 por vez; use `fetchAllUsers()` (`utils/fetchAllUsers.js`) em
  qualquer seletor.
- **Coordenação = administração** nas guardas do servidor: use `isManagerRole(...)`, não `profile === "admin"`. Só
  administradores são protegidos da coordenação (criar, promover, editar e excluir).
- **Status ou formato que a tela não conhece não derruba a tela:** use `statusMap[x] || padrão`, `data.contact || {}`,
  `Array.isArray(x) ? x : []`.
- **Sondagens** (`setInterval`) só rodam com a aba visível.

## Erros de tela por versão

Configurações → Erros de tela → Resumo agrupa a mesma falha (tela + mensagem), mostra quantas vezes, quantas pessoas e
em quais versões do código. "Esconder o que só aconteceu em versões antigas" separa defeito vivo de aba que ficou aberta
antes da atualização. "Marcar como corrigido" guarda a decisão da equipe.
