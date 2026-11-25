# API v1 (integrações)

Rotas em `/api/v1` (`backend/src/routes/apiV1Routes.ts`), autenticadas por token no cabeçalho `Authorization: Bearer <token>`
(`middleware/isAuthApi.ts`). Os tokens são criados pelo administrador em **API e webhooks** (`/integrations`).

## Tokens

- Cada token tem **escopos** (o que pode fazer), **polos** (opcional: sem polo escolhido, lê todos) e **validade** (1 a 365 dias,
  90 se não escolher). Sem escopo o token não é criado.
- O token aparece **uma única vez**, na criação. O banco guarda só o **SHA-256** (`ApiTokens.tokenHash`) e os 9 primeiros caracteres
  (`tokenPrefix`) para reconhecer na tela. A coluna `token` fica vazia.
- Token vencido recebe `401 ERR_API_TOKEN_EXPIRED`. Sem o escopo da rota: `403 ERR_API_TOKEN_SCOPE`.
- O último uso (`lastUsedAt`) é gravado no máximo uma vez por minuto por token.
- **Tokens antigos** (criados antes dos escopos): a migração `20270101000102-hash-api-tokens` troca o texto pelo hash e dá acesso
  total (`["*"]`, sem validade, sem limite de polo), marcados `legacy` ("antigo" na tela). Recomendação: trocar cada um por um token novo
  com só o que a integração usa e excluir o antigo.
- **Token único de Configurações** (`Settings.userApiToken`): continua aceito, com acesso total, enquanto a chave
  `api_legacy_token_enabled` estiver ligada (padrão: ligada, para não parar integração desconhecida). O administrador desliga em
  Configurações → Geral → Integração, que mostra o aviso e o último uso. Rotas: `GET/PUT /api-tokens/legacy` (só administrador).

## Escopos e rotas

| Rota | Escopo | Com polos no token |
|---|---|---|
| `GET /leads` | `leads:read` | só leads desses polos |
| `POST /leads` | `leads:write` | o lead fica num dos polos do token (`poloId` no corpo; obrigatório se o token tem mais de um polo, `422 ERR_API_TOKEN_POLO_REQUIRED`; fora dos polos `403`); a mesma pessoa já cadastrada em outro polo (ou sem polo) recebe `403` e nada é gravado nela; `stageId` só de etapa aberta (`422 ERR_API_STAGE_NOT_ALLOWED`) e `ownerId` só de quem está nos polos do token (`422 ERR_API_OWNER_NOT_ALLOWED`). A resposta traz só `id`, `stageId` e `poloId` |
| `GET /contacts` | `contacts:read` | só contatos que são lead desses polos |
| `POST /contacts` | `contacts:write` | cria contato novo; só altera contato que é lead dos polos do token (de outro polo, ou que não é lead deles: `403 ERR_API_TOKEN_POLO`); a resposta traz só `id` e `created` |
| `GET /tickets` | `tickets:read` | só conversas das filas desses polos; sem o texto das mensagens |
| `GET /connections` | `connections:read` | todas (sem dado pessoal) |
| `POST /messages/send` | `messages:send` | só para número de lead desses polos (`403 ERR_API_TOKEN_POLO`) |
| (indicadores consolidados) | `indicators:read` | escopo já disponível; a rota `GET /indicadores` vem em PR próprio |

As respostas trazem só os campos que a integração usa: lead sem CPF, endereço, notas nem histórico; conversa sem texto.

## Testes

- Unidade: `backend/tests/channels/api-tokens.test.ts` (hash, escopos, validação do token novo).
- Ponta a ponta (`channels-e2e.js`, "API tokens: scopes, polos, validity…"): token só de leitura recebe 403 em `/messages/send`;
  token do polo A não vê lead do polo B; token vencido recebe 401; nenhum token em texto no banco; migração dos antigos; token de
  Configurações ligado e desligado.

## Reverter

Voltar o código (git revert) **não** devolve os tokens em texto: depois de reverter, os tokens precisam ser criados de novo. O token de
Configurações não muda.
