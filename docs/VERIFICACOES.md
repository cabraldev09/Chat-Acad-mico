# Verificações antes de publicar

Rode tudo isto antes de enviar ao GitHub e de atualizar a VPS. Qualquer falha impede a publicação.

| O que | Comando | Pasta |
|---|---|---|
| Tipos do backend | `npm run build` | `backend` |
| Testes de unidade (motor de análise, proposta, e-mails) | `npx vitest run` | `backend` |
| Testes de ponta a ponta (API inteira com WhatsApp/Telegram/Efí simulados) | `NODE_ENV=test CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" CHROME_ARGS="--no-sandbox --disable-setuid-sandbox" LOGIN_RATE_MAX=100 node scripts/channels-e2e.js` | `backend` |
| Textos em português e códigos de erro traduzidos | `node scripts/i18n-check.js` | `backend` |
| Esquema do banco (depois de criar uma migração) | `node scripts/build-schema.js` | `backend` |
| Auditoria de rotas por perfil | `node scripts/audit-routes.js` | `backend` |
| **Leitura tardia de evento (erro "reading 'value'")** | `node scripts/check-lazy-events.js` | `frontend` |
| Build do frontend | `npx vite build` | `frontend` |
| Varredura de todas as telas, 4 perfis, digitando nos formulários | `node scripts/smoke-pages.js admin coordenacao consultor tutor` (API em 8080 e `vite preview` em 3000) | `frontend` |

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
