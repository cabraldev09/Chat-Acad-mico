# API v1 (integrações)

Rotas em `/api/v1` (`backend/src/routes/apiV1Routes.ts`), autenticadas por token no cabeçalho `Authorization: Bearer <token>`
(`middleware/isAuthApi.ts`). Os tokens são criados pelo administrador em **API e webhooks** (`/integrations`).

## Tokens

- Cada token tem **escopos** (o que pode fazer), **polos** (opcional: sem polo escolhido, lê todos) e **validade** (1 a 365 dias,
  90 se não escolher). Sem escopo o token não é criado.
- O token aparece **uma única vez**, na criação. O banco guarda só o **SHA-256** (`ApiTokens.tokenHash`) e os 9 primeiros caracteres
  (`tokenPrefix`) para reconhecer na tela. A coluna `token` fica vazia.
- Token vencido recebe `401 ERR_API_TOKEN_EXPIRED`. Sem o escopo da rota: `403 ERR_API_TOKEN_SCOPE`.
- O último uso (`lastUsedAt`) e o **uso por rota** (`ApiTokens.usage`: método e rota, quantas vezes e a última vez; nunca a consulta, o
  corpo, o IP ou dados de pessoas, `helpers/ApiUsage.ts`) são gravados no máximo uma vez por minuto por token. A tela API e webhooks
  mostra "Usado em: …"; o token de Configurações mostra o mesmo em Configurações → Integração.
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
| `POST /leads` | `leads:write` | o lead nasce num dos polos do token (`poloId` no corpo; obrigatório se o token tem mais de um polo, `422 ERR_API_TOKEN_POLO_REQUIRED`; `poloId` fora dos polos `403`), já antes de qualquer aviso, webhook (`lead.created` traz `poloId`) ou fluxo; a cidade não muda esse polo; sem `ownerId`, o rodízio só usa consultores dos polos do token. `stageId` só de etapa aberta (`422 ERR_API_STAGE_NOT_ALLOWED`) e `ownerId` só de quem está nos polos do token (`422 ERR_API_OWNER_NOT_ALLOWED`). **A resposta é sempre `202 {"aceito": true}`**, seja pessoa nova, do próprio polo ou de outro polo (por telefone, e-mail ou CPF): o token não descobre quem existe. A pessoa de outro polo (ou sem polo) não é alterada, e a administração recebe o aviso "possível lead duplicado" |
| `GET /contacts` | `contacts:read` | só contatos que são lead desses polos |
| `POST /contacts` | `contacts:write` | cria contato novo; só altera contato que é lead dos polos do token (os outros não são alterados, e a administração é avisada); **a resposta é sempre `202 {"aceito": true}`** |
| `GET /tickets` | `tickets:read` | só conversas das filas desses polos; sem o texto das mensagens |
| `GET /connections` | `connections:read` | todas (sem dado pessoal) |
| `POST /messages/send` | `messages:send` | só para número de lead desses polos (`403 ERR_API_TOKEN_POLO`) |
| `GET /indicadores?de=&ate=&polo=` | `indicators:read` | só esses polos; `polo` fora deles: `403 ERR_API_TOKEN_POLO` |

As respostas trazem só os campos que a integração usa: lead sem CPF, endereço, notas nem histórico; conversa sem texto.
Tokens de todos os polos (sem polo escolhido) continuam com as respostas de antes em `POST /leads` (`201/200` com `id`) e
`POST /contacts` (`201/200` com `id` e `created`), por compatibilidade com as integrações em uso.

## Migração dos tokens antigos (sem parar integração)

1. Em API e webhooks, veja os tokens marcados "antigo" e o "Usado em" de cada um; em Configurações → Integração, o do token de
   Configurações. Isso diz qual integração depende de qual token e de quais rotas.
2. Para cada integração, crie um token novo com só os escopos dessas rotas, os polos dela e validade (até 365 dias).
3. Troque o token na integração e confira, no dia seguinte, que o antigo parou de ser usado (o "Último uso" não muda mais).
4. Exclua o token antigo. Quando o token de Configurações não tiver uso recente, desligue-o.
5. Ninguém precisa ver o token antigo: ele existe só como hash.

**Backups com chaves antigas:** os dumps do banco feitos antes da migração `20270101000102` têm os tokens antigos e o token de
Configurações em texto. Eles ficam em `/opt/backups` (dono `root`, permissão 600), saem pela rotação de backups e podem existir na
cópia externa (`deploy/vps/offsite.sh`). A medida que resolve: depois da troca acima, excluir os tokens antigos e trocar o token de
Configurações. A partir daí os dumps antigos têm só chaves que não valem mais. Até lá, os backups devem ser tratados como segredo.

## Indicadores consolidados (`GET /indicadores`)

Para o OpenBot: **só totais e códigos**, sem nome, telefone, e-mail, CPF, RGM, nota ou texto de conversa
(`services/IndicatorServices/Indicators.ts`). Período `de`/`ate` (AAAA-MM-DD) de até **93 dias** (`400 ERR_API_PERIOD_TOO_LONG`);
`polo` opcional. Sem limite de polo no token, vem também o grupo `poloId: null` (leads ainda sem polo).

Datas inexistentes (por exemplo `2026-02-31`) recebem `400 ERR_INVALID_PERIOD`.

Por polo (`poloId`, `codigo`):

| Bloco | Regra (a mesma da tela) |
|---|---|
| `leads.porOrigem`, `leads.porEtapa` | Painel do CRM / Captação (`/crm/metrics`): leads criados no período, sem histórico |
| `primeiraResposta.medianaMinutos` | mediana, em horário comercial, de criação até o primeiro contato, dos mesmos leads |
| `followUps.vencidos`, `followUps.tarefasVencidas` | follow-up já passado (lead aberto) e tarefas abertas vencidas (agora, não do período) |
| `matriculasRealizadas` | `EnrollmentController.index` (Matrículas realizadas): total, dentro da meta, com print |
| `metas` | meta do **semestre atual** (`buildPoloBoard`), não do período pedido: `doCrm` e `ajustesManuais` (total, sem mês, por mês) separados, canceladas. **`metas.feito` = `doCrm` + `ajustesManuais.total`** (inclui o que foi digitado à mão nas Metas); para conversão use `matriculasRealizadas` ou `doCrm` |
| `revisaoConsultores` | `ConsultantReviews` do período, por código do consultor: objeções levantadas/tratadas, etapas com dificuldade e puladas |

**`origem` e `etapa` são texto livre** (`Leads.source`, gravado também pela API e pela importação; o nome da etapa é digitado na
configuração do funil). A garantia de nenhum dado pessoal vale para os campos e para as pessoas da base, não para um texto que
alguém digite como origem ou etapa.

`conexoes`: id, canal, função (`atendimento`, `tutoria`, `pessoal`…), conectado, estado, qualidade (verde/amarela/vermelha, lida do
aviso da conexão) e validade do token da Meta (data e dias). Nunca o nome da conexão nem o token. Com polos no token, só as conexões
que atendem filas desses polos.

## Testes

- Unidade: `backend/tests/channels/api-tokens.test.ts` (hash, escopos, validação do token novo).
- Ponta a ponta (`channels-e2e.js`, "API tokens: scopes, polos, validity…"): token só de leitura recebe 403 em `/messages/send`;
  token do polo A não vê lead do polo B; a mesma resposta `202` para pessoa nova, do polo e de outro polo (telefone e CPF), com a de
  outro polo intacta e o aviso à administração; lead novo nasce no polo do token mesmo com cidade de outro polo; uso por rota
  gravado sem dados de pessoas; token vencido recebe 401; nenhum token em texto no banco; migração dos antigos; token de
  Configurações ligado e desligado, com as rotas usadas.
- Indicadores: `tests/channels/indicators-query.test.ts` (período e polo) e o ponta a ponta "API indicators" (nenhum campo pessoal
  nem nome, telefone, e-mail, CPF ou RGM de pessoa da base na resposta; escopo e polos; os números batem com Captação, Painel do CRM
  e Matrículas realizadas no mesmo período).

## Reverter

Voltar o código (git revert) **não** devolve os tokens em texto: depois de reverter, os tokens precisam ser criados de novo. O token de
Configurações não muda.
