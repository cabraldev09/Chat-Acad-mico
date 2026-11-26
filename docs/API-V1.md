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
| `POST /messages/send` | `messages:send` | só para número de lead desses polos (`403 ERR_API_TOKEN_POLO`); a rota antiga `/api/messages/send` segue a mesma regra e ainda exige conexão de um desses polos (veja abaixo) |
| `GET /indicadores?de=&ate=&polo=` | `indicators:read` | só esses polos; `polo` fora deles: `403 ERR_API_TOKEN_POLO` |
| `GET /leituras?limite=` e `POST /leituras/:id` | `readings:work` | só leituras de leads desses polos (as sem polo ficam para tokens de todos os polos) |
| `POST /insights` | `insights:write` | grava para a gestão geral; **não é filtrada por polo** (veja "Recomendações do OpenBot") |

### Rota antiga `POST /api/messages/send` (legado)

Continua existindo para as integrações antigas (corpo: `number`, `body`, `whatsappId` opcional, `medias` opcional), mas agora passa
pelo mesmo portão de `POST /api/v1/messages/send`, **antes** de salvar arquivo, criar contato ou abrir conversa:

- limite por token, o mesmo balde da v1 (120 por minuto; acima disso `429` com `Retry-After`);
- escopo `messages:send` (sem ele, `403 ERR_API_TOKEN_SCOPE` e nada é criado nem enviado);
- token com polos: o número precisa ser de um lead desses polos e a conexão (`whatsappId`, ou a padrão se omitido) precisa atender uma
  fila de um desses polos; senão `403 ERR_API_TOKEN_POLO` (conexão que não existe: `404 ERR_NO_WAPP_FOUND`).

Tokens de todos os polos e o token antigo de Configurações (acesso total) enviam como antes. A rota nova é a v1: prefira-a.

As respostas trazem só os campos que a integração usa: lead sem CPF, endereço, notas nem histórico; conversa sem texto.
Tokens de todos os polos (sem polo escolhido) continuam com as respostas de antes em `POST /leads` (`201/200` com `id`) e
`POST /contacts` (`201/200` com `id` e `created`), por compatibilidade com as integrações em uso.

### Recomendações do OpenBot para a gestão (`POST /insights`)

Escopo `insights:write` ("Gravar avisos e recomendações para a gestão"). O OpenBot grava avisos sobre a operação inteira (por exemplo,
"a origem X caiu 40% na semana"); **só a administração** os vê: um aviso no sino (marcado "OpenBot") e o bloco "Recomendações do
OpenBot" em Estatísticas → Agora, abaixo de "Alertas e oportunidades". Coordenação, consultor e tutor não recebem nem veem.
Token com polos escolhidos também grava; as recomendações **não** são filtradas por polo (são da gestão geral).

Corpo (exemplo fictício):

```json
{ "kind": "indicador", "level": "warning", "title": "Origem Instagram caiu 40% na semana",
  "body": "Os contatos da origem Instagram caíram 40% em relação à semana anterior.",
  "link": "/estatisticas", "dedupeKey": "origem-instagram:2026-11-26", "expiresInDays": 7 }
```

- `kind`: `indicador`, `oportunidade`, `risco` ou `operacao`. `level`: `info` (padrão), `warning` ou `urgent`.
- `title` até 120 e `body` até 400 caracteres, **texto puro** (a tela não lê HTML nem Markdown). `link` opcional: só um caminho interno da
  lista (`/crm`, `/crm/painel`, `/crm/tarefas`, `/crm/matriculas`, `/crm/metas`, `/crm/metas-polos`, `/crm/retencao`, `/estatisticas`,
  `/estatisticas/captacao`, `/estatisticas/tutoria`, `/gestao-comercial`, `/connections`, `/reports`, `/integrations`); endereço externo,
  `javascript:` ou outro caminho: `400 ERR_INSIGHT_INVALID_LINK`.
- `dedupeKey` (obrigatório, até 160: letras, números, `:`, `.`, `_`, `-`; convenção `tema:AAAA-MM-DD`): o mesmo assunto em vigor vale uma
  vez só. Repetir a chave devolve `200 {"duplicado": true}` sem criar linha nem aviso (o conteúdo não muda). Um assunto novo usa chave nova.
  `expiresInDays` de 1 a 30 (padrão 7).
- **Sem dado pessoal, conferido no servidor:** título ou texto com telefone (8 dígitos seguidos ou escrito com separadores), e-mail ou
  qualquer `@`, CPF, RGM ou endereço da internet: `400 ERR_INSIGHT_PERSONAL_DATA` e nada é gravado. Totais, percentuais e números com
  separador de milhar passam ("1.250.000"). É a última defesa: envie só agregados.
- Resposta `201 {"aceito": true}` (sem id). Limites: os 120 por minuto de todo token, mais **30 gravações por hora por token** (`429
  ERR_TOO_MANY_REQUESTS`) e no máximo **20 recomendações em vigor** no painel (`429 ERR_INSIGHT_LIMIT` com `Retry-After`).
- O administrador pode **dispensar** cada uma na tela (`PUT /openbot-insights/:id/resolve`, só administrador): some do painel e a linha
  fica. Dispensadas ou vencidas há mais de 30 dias são apagadas pela limpeza noturna.
- Erros do corpo: `ERR_INSIGHT_INVALID_KIND`, `_LEVEL`, `_TITLE`, `_BODY`, `_DEDUPE`, `_LINK`, `_EXPIRY` (todos `400`).
- **Recomendação ao dono:** criar para o OpenBot um token novo só com `indicators:read` e `insights:write` (hoje o token "API Open Bot" tem
  acesso total, risco aceito em 25/11). A troca depende de decisão do dono; esta rota não a exige.

### Mudança de contrato (tokens com polos)

**A partir desta versão, um token com polos escolhidos não recebe mais o id do que foi criado** em `POST /leads` e `POST /contacts`:

| Rota | Antes (token com polos) | Agora (token com polos) | Token de todos os polos, antigo ou de Configurações |
|---|---|---|---|
| `POST /leads` | `201` (novo) ou `200` (já existia) com `{ created, lead: { id, stageId, poloId } }` | sempre `202 {"aceito": true}`, sem id | sem mudança (`201/200` com o lead) |
| `POST /contacts` | `201/200` com `{ id, created }` | sempre `202 {"aceito": true}`, sem id | sem mudança (`201/200` com `id` e `created`) |

- **Por quê:** com o id (ou a diferença entre `201` e `200`) o token descobria se a pessoa já existia, inclusive em outro polo.
- **O que a integração precisa fazer:** tratar `202` como sucesso e não depender do id na resposta. Para achar o lead depois, use
  `GET /leads` (só os leads dos polos do token) com o telefone ou o e-mail enviados.
- **Quem avisar:** o responsável por cada integração que usa um token com polos e lê o id da resposta. Os tokens de todos os polos,
  os antigos e o de Configurações continuam com a resposta de antes (e, por isso, ainda permitem descobrir se a pessoa existe).

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

**Segredo dos códigos dos consultores:** o HMAC usa `API_PSEUDONYM_SECRET` (recomendado: um segredo próprio, longo e aleatório)
ou, na falta dele, o `JWT_SECRET`. **Sem nenhum dos dois, a rota falha fechada:** `503 ERR_API_PSEUDONYM_SECRET_MISSING`, antes de
ler qualquer número (com chave vazia, os códigos poderiam ser refeitos testando os ids). Trocar o segredo troca todos os códigos.

Por polo (`poloId`, `codigo`):

| Bloco | Regra (a mesma da tela) |
|---|---|
| `leads.porOrigem`, `leads.porEtapa` | Painel do CRM / Captação (`/crm/metrics`): leads criados no período, sem histórico |
| `primeiraResposta.medianaMinutos` | mediana, em horário comercial, de criação até o primeiro contato, dos mesmos leads |
| `followUps.vencidos`, `followUps.tarefasVencidas` | follow-up já passado (lead aberto) e tarefas abertas vencidas (agora, não do período) |
| `matriculasRealizadas` | `EnrollmentController.index` (Matrículas realizadas): total, dentro da meta, com print |
| `metas` | meta do **semestre atual** (`buildPoloBoard`), não do período pedido: `doCrm` e `ajustesManuais` (total, sem mês, por mês) separados, canceladas. **`metas.feito` = `doCrm` + `ajustesManuais.total`** (inclui o que foi digitado à mão nas Metas); para conversão use `matriculasRealizadas` ou `doCrm` |
| `revisaoConsultores` | `ConsultantReviews` do período, por **código opaco do consultor** (`c_` + 10 caracteres, HMAC com o segredo do servidor): o mesmo consultor tem o mesmo código no mesmo token e outro código em outro token; nunca o id nem o nome. Objeções levantadas/tratadas, etapas com dificuldade e puladas |

**`origem` e `etapa` são texto livre** (`Leads.source`, gravado também pela API e pela importação; o nome da etapa é digitado na
configuração do funil). A garantia de nenhum dado pessoal vale para os campos e para as pessoas da base, não para um texto que
alguém digite como origem ou etapa.

**Limites e cache:**
- Toda rota de `/api/v1` aceita até **120 chamadas por minuto por token** (`API_V1_RATE_MAX`). Os indicadores aceitam até
  **20 por minuto** (`API_V1_INDICATORS_RATE_MAX`). Acima disso: `429 ERR_TOO_MANY_REQUESTS` com `Retry-After`. O limite de um
  token não afeta outro.
- A mesma pergunta (token, período e polo) é respondida do cache por **60 s** (`API_INDICATORS_CACHE_MS`; `geradoEm` mostra quando
  foi calculada). A chave do cache leva o token, os escopos e os polos: um token nunca recebe a resposta calculada para outro.
- **Desempenho:** cada lista é agrupada por polo uma vez (não por polo × linhas). Com um polo pedido, Matrículas realizadas lê só esse
  polo. A revisão dos consultores lê só os leads dos polos pedidos.

`conexoes`: id, canal, função (`atendimento`, `tutoria`, `pessoal`…), conectado, estado, qualidade (verde/amarela/vermelha, lida do
aviso da conexão) e validade do token da Meta (data e dias). Nunca o nome da conexão nem o token. Com polos no token, só as conexões
que atendem filas desses polos.

## Fila de leituras (`GET /leituras`, `POST /leituras/:id`): o OpenBot faz o trabalho que gastaria tokens
Em Integrações, "Leituras das conversas", a administração escolhe quem lê as conversas: a IA do sistema (o modelo mais barato) ou o
OpenBot pela API. Com o OpenBot, a IA do sistema lê só o que ficar esperando mais do que as horas escolhidas (padrão 6).

As leituras são de três tipos:
- `importacao`: uma conversa copiada do celular de um consultor (WhatsApp por QR Code). Diz se é lead, se já se matriculou, se parou ou desistiu e por quê.
- `resultado`: a conversa de um lead que se matriculou ou se perdeu. Diz o motivo, as objeções, o que ajudou e o que faltou.
- `revisao`: a revisão diária da conversa de um consultor. Diz as objeções e as etapas com dificuldade ou puladas.

**Pegar:** `GET /api/v1/leituras?limite=10` (até 50) devolve `{"leituras": [{"id", "tipo", "instrucoes", "conversa", "reservadaAte"}]}`.
- Cada leitura fica reservada para o token por 30 minutos.
- `conversa` vem pseudonimizada: nomes viram `[NOME]`; CPF, telefone, e-mail e qualquer número longo viram marcadores.
- Com as leituras desligadas (Integrações), a lista vem vazia.
- O texto não é guardado no sistema.

**Responder:** `POST /api/v1/leituras/:id` com `{"resposta": {...}, "modelo": "nome do modelo"}`, onde a resposta é o JSON que `instrucoes` pede.
- A resposta passa pela mesma validação e faz o mesmo que a resposta da IA do sistema: lead no funil com o resumo, matrícula com o RGM, "Matrícula a confirmar", Recuperação.
- Respostas de erro:
  - `422 ERR_READING_BAD_ANSWER`: a resposta está fora do formato; a leitura volta para a fila e, depois de 3 tentativas, é descartada;
  - `409 ERR_READING_NOT_CLAIMED`: a reserva venceu ou é de outro token;
  - `409 ERR_READING_DONE`: a leitura já foi respondida.

```bash
curl -H "Authorization: Bearer $TOKEN" "$API/api/v1/leituras?limite=5"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"resposta":{"e_lead":true,"situacao":"em_andamento","curso":"Pedagogia","etapa":"proposal","objecao":"nenhuma","motivo":"","resumo":"Quer Pedagogia e pediu a proposta.","proximo_passo":"Enviar a proposta"}}' \
  "$API/api/v1/leituras/123"
```

A tela de Integrações mostra quantas leituras cada um fez e quantos tokens o OpenBot economizou: a média de tokens das leituras da IA do
sistema vezes as leituras feitas pelo OpenBot. Mandar as conversas pseudonimizadas ao OpenBot é decisão do dono registrada pela coordenação em 26/11 (issue #201 e PR #205; ver `AGENTS.md`).

## Testes

- Unidade: `backend/tests/channels/api-tokens.test.ts` (hash, escopos, validação do token novo).
- Ponta a ponta (`channels-e2e.js`, "old route /api/messages/send…"): sem `messages:send` 403 sem criar nada; token do polo A envia ao lead do polo A pela conexão do polo A; lead de outro polo, conexão sem polo e conexão do outro polo: 403 sem criar contato; conexão inexistente 404; token de todos os polos envia; 429 acima do limite.
- Ponta a ponta (`channels-e2e.js`, "API tokens: scopes, polos, validity…"): token só de leitura recebe 403 em `/messages/send`;
  token do polo A não vê lead do polo B; a mesma resposta `202` para pessoa nova, do polo e de outro polo (telefone e CPF), com a de
  outro polo intacta e o aviso à administração; lead novo nasce no polo do token mesmo com cidade de outro polo; uso por rota
  gravado sem dados de pessoas; token vencido recebe 401; nenhum token em texto no banco; migração dos antigos; token de
  Configurações ligado e desligado, com as rotas usadas.
- Indicadores: `tests/channels/indicators-query.test.ts` (período, polo, código do consultor e a falha fechada sem segredo, na função e
  na rota) e o ponta a ponta "API indicators":
  consultor só como código; o mesmo código no mesmo token e outro em outro token; a segunda chamada igual vem do cache; a 21ª chamada
  no minuto recebe 429 e outro token não é afetado; nenhum campo pessoal
  nem nome, telefone, e-mail, CPF ou RGM de pessoa da base na resposta; escopo e polos; os números batem com Captação, Painel do CRM
  e Matrículas realizadas no mesmo período).

## Reverter

Voltar o código (git revert) **não** devolve os tokens em texto: depois de reverter, os tokens precisam ser criados de novo. O token de
Configurações não muda.
