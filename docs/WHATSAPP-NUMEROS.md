# Números de WhatsApp: oficial central + carteira do consultor

## A decisão
- **Conversa com cliente acontece nos números oficiais**, pela API Oficial (Cloud API) da Meta: um número por polo, ou um número institucional.
  - Esses números não são banidos.
  - Aceitam campanhas e mensagens fora da janela de 24h, por meio de modelos aprovados.
  - A gestão vê todas as conversas.
- **O cliente é do consultor ("carteira")**: quem já foi atendido volta direto para o mesmo consultor quando escreve de novo, mesmo no número compartilhado.
  - O consultor assina as mensagens com o próprio nome. A opção "Assinar" do campo de mensagem vem ligada.
- **O WhatsApp corporativo do consultor (QR code)** fica só para quem ainda não migrou. É uma conexão não oficial e corre risco de banimento, principalmente com contatos frios e envios em volume.

## Quem cria e quem vê as conexões
- **A gestão** (`admin` e `coordenacao`) adiciona, edita e apaga conexões, incluindo o Instagram.
- **Número próprio por QR Code (desde 25/11/2026):** consultor, tutor e relacionamento conectam o próprio WhatsApp em Conexões,
  no botão **"Conectar meu WhatsApp"** (`POST /whatsapp/mine`, `canConnectOwnQr`).
  - É um número por pessoa (`ERR_QR_ALREADY_HAS`) e respeita o limite de números QR do servidor (`WHATSAPP_MAX_QR`).
  - O número nasce com o nome "WhatsApp de <primeiro nome>", em proteção "rígida" contra bloqueio, e vira o número de envio da pessoa.
  - A tela avisa que é conexão não oficial: sem envio em massa e sem contato frio. Campanhas grandes e avisos da tutoria saem pelo oficial.
- **Número QR Code de uma pessoa:** ao criar um WhatsApp por QR Code, a gestão escolhe em **"Responsável pelo número"** o consultor
  ou tutor. O número vira dele:
  - as conversas que chegam nele vão para ele;
  - vira o número de envio dele.

  A gestão pode trocar o responsável ou devolver o número à empresa depois.
- **Conexões para quem não é da gestão:** o item aparece no menu para quem tem ou pode ter um número QR Code próprio.
  - A tela mostra só esse número. A pessoa lê o QR Code com o celular, reconecta, desconecta e escolhe quais grupos viram conversas.
  - Os números da empresa, o Instagram e os botões de adicionar, editar e apagar não aparecem.
  - Sem número próprio, a tela mostra o cartão "Conectar meu WhatsApp".
- **No servidor:**
  - `POST /whatsapp`, `DELETE /whatsapp/:id` e `/channels/instagram/authorize` são só da gestão;
  - `POST /whatsapp/mine` cria o número QR da própria pessoa (consultor, tutor, relacionamento e a gestão);
  - as rotas de sessão (`/whatsappsession/:id`) e `PUT /whatsapp/:id` aceitam a gestão e o dono do número QR (`canManageWhatsapp`);
  - no `PUT`, o dono só muda os grupos (`groupsMode` e `allowedGroups`).

## Como a carteira funciona
- **Dono do cliente**: é o **responsável no CRM**, se ele já conversou com o cliente. Se não, é **quem atendeu por último**.
- **Quando o cliente escreve de novo** num número compartilhado (sem dono), a conversa vai direto para esse consultor: sem robô, sem fluxo e sem rodízio.
  - Fica registrado o evento "returned_to_owner".
  - Vale também fora do horário do consultor. Nesse caso o cliente recebe um aviso, no máximo a cada 6 horas, dizendo quando o consultor responde.
  - O texto do aviso é editável em Configurações → Atendimento e CRM.
- **O que não tira o cliente do dono:**
  - o rodízio da fila;
  - o 2º alerta do prazo de atendimento: ele só avisa de novo;
  - a redistribuição de quem não tem número próprio: no número oficial não é preciso ter número próprio.
- **Transferência:** por padrão, a transferência manual passa o cliente para o novo consultor. Marque **"Só este atendimento"** para cobrir uma ausência sem tirar o cliente da carteira.
- **Desligar:** Configurações → Atendimento e CRM → "Cliente que volta a escrever fala com o mesmo consultor".

## Montagem na Meta (uma vez)
1. Use **um app** no Meta for Developers e **uma conta do WhatsApp Business (WABA)** verificada no nome da instituição.
2. Cadastre cada número (polo ou institucional) na WABA. No Chat, cada número vira uma conexão "API Oficial", com o Phone Number ID dele.
3. Use um **token permanente** de "usuário do sistema", no Business Manager → Usuários do sistema, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. Token temporário expira em 24h, e a conexão fica vermelha.
   - **Sem token permanente** (a Meta às vezes trava a verificação da conta ao gerar o do usuário do sistema): use o token de 24 h de Casos de uso → WhatsApp → Configuração da API e preencha também o **App ID** e o **App Secret** do mesmo app na conexão. Ao conectar, o Chat troca o token por um de **60 dias**; a validade aparece na conexão e, nos últimos 7 dias, um aviso pede um token novo.
4. Configure **um único webhook** no app, com a URL de qualquer uma das conexões (`/webhooks/meta/<id>`), o Verify Token dela e o campo `messages` assinado.
   - Os eventos de todos os números do mesmo app são entregues à conexão certa pelo `phone_number_id`.
   - Todas as conexões do app precisam ter o **mesmo App Secret**.
5. A cada 10 minutos o sistema confere cada número na Meta.
   - **Token expirado ou permissão removida:** a conexão aparece como desconectada, com o motivo.
   - **Qualidade amarela ou vermelha:** aparece um aviso abaixo do status, em Conexões.

## Janela de 24h e modelos
- Dentro de 24h desde a última mensagem do cliente, o consultor escreve livremente.
- Fora dela, só com **modelo aprovado** pela Meta. Exemplo: "Olá {{1}}, aqui é {{2}} da Cruzeiro do Sul Virtual. Podemos continuar sua matrícula?"
  - O envio de modelos precisa ser liberado pelo administrador (`outbound_allow_templates`).
- Para retomar o contato com clientes da carteira, crie modelos de reengajamento na Meta.

## Migração de um consultor do QR para o oficial
1. Avise os clientes ativos pelo número antigo: "A partir de agora falamos pelo número oficial (XX) XXXX-XXXX."
2. Os clientes que escreverem no número oficial caem com o consultor que já os atendia, pela carteira. O CRM guarda o responsável.
3. Deixe o QR conectado só para responder durante a transição. Depois, desconecte.

## Custos
- A Meta cobra por mensagem entregue, pela categoria do modelo. No Brasil (tabela de 2026-11): Utilidade cerca de US$ 0,0068
  e Marketing cerca de US$ 0,0625, umas 9 vezes mais.
- Respostas livres dentro das 24 h (serviço): cada número oficial tem 1.000 grátis por mês; acima disso, cada uma é cobrada.
- O custo é por mensagem, não por número: um número a mais não encarece e traz mais 1.000 respostas grátis.
- QR Code não paga a Meta, mas disparo em massa por QR derruba o número. O sistema limita o QR a poucos contatos frios por dia.
- Transcrição dos áudios das conversas da equipe (oficial e QR): não é cobrança da Meta, é da OpenAI. Estimativa: cerca de
  US$ 0,006 por minuto de áudio; com o teto padrão de 120 minutos por dia, no máximo cerca de US$ 0,72 por dia. Regras em
  `IA-E-CONVERSAS.md` (Retomada, passagem para a equipe e áudio).

Como o sistema controla:
- Cada envio guarda a categoria (`OutboundDeliveries.category`) e o custo estimado pela tabela `ChannelServices/MetaRates.ts`
  (`estimateSendUsd`). A categoria de cada modelo vem da Meta e é guardada quando os modelos são lidos ou quando a Meta avisa que
  mudou (`template_category_update`). Modelo de categoria desconhecida conta como Marketing.
- **Teto do mês** (`outbound_monthly_usd`, padrão US$ 148, cerca de R$ 800): campanha que passaria dele não começa; ao chegar nele
  os envios pagos param e a campanha pausa (`ERR_OUTBOUND_MONTH_BUDGET`). Em 80% e 100% a gestão recebe aviso.
- **Marketing em campanhas** fica desligado (`outbound_allow_marketing`): um modelo que a Meta classificou como Marketing não começa.
- Tudo isso fica em Configurações → Custos: a aba WhatsApp oficial mostra o mês contra o teto, a aba Limites de gasto tem o teto,
  a cotação do dólar e os preços digitados (vazio usa a tabela).
- **Cota de disparos por pessoa** (`send_quota_monthly`, padrão 200 mensagens por mês; 0 desliga): conta as mensagens das campanhas
  e dos avisos que a pessoa criou no mês (enviadas, a caminho e as que esperam numa campanha em andamento; rascunho, pausada,
  cancelada e bloqueada antes de sair não contam). Passou da cota, a prévia do aviso e a conferência da campanha mostram
  `ERR_SEND_QUOTA` e o botão "Pedir liberação à gestão" (`SendReleases`, um pedido aguardando por vez). A gestão aprova ou recusa em
  Estatísticas → Disparos, e o que aprova soma à cota daquele mês. Administradores e coordenação não têm cota
  (`CampaignServices/SendQuota.ts`). Uma campanha agendada que não cabe mais na cota pausa na hora de começar.
- **Objetivo do disparo** (`Campaigns.objective`): obrigatório em toda campanha nova; o aviso da tutoria preenche sozinho.
- **Quem gastou** (`OutboundDeliveries.userId`, `AiUsage.userId`): cada mensagem da Meta e cada chamada da IA guarda quem a
  provocou. Vale a pessoa logada no pedido (`helpers/Actor.ts`, posto em `isAuth`), o criador da campanha (`CampaignRunner`) e
  quem agendou a mensagem (`Scheduler`). O que ninguém pediu (respostas automáticas, auditorias, rotinas) fica como "Automação".
  As sessões por QR Code começam sem pessoa, para não herdar quem as ligou. O relatório é `GET /operations/costs-by-user` (gestão),
  e a aba Disparos mostra disparos, mensagens, cota e o gasto da Meta e da IA de cada pessoa no período. As mensagens da Meta de
  antes disso ganharam a pessoa pela chave do envio (migração `20261230000001`); as chamadas antigas da IA ficam como Automação.

## Estratégia para os 8 polos (fase 1)

| Uso | Canal | Por quê |
|---|---|---|
| Avisos da tutoria (atividades e provas) | Número oficial da Tutoria, um para os 8 polos | Aviso é Utilidade (barato). Em massa por QR perderia o número. |
| Dúvidas dos alunos e secretaria | O mesmo número da Tutoria | O aluno guarda um número só; 1.000 respostas grátis por mês. |
| Leads que chegam e IA | O número oficial atual (Atendimento) | Já existe; 1.000 respostas grátis por mês. |
| Consultor chamando indicação | Número próprio (QR) de cada consultor, 1 a 1 | Sem custo; volume baixo, dentro dos limites do QR. |
| Retomar lead frio pelo oficial | Só modelo aprovado, dentro do teto | Marketing é a mensagem cara. |

**Avisos da tutoria** (tela Alunos da tutoria, botão Enviar aviso; tutor, coordenação e admin): dois por aluno por mês em vez de
quatro, o resumo das atividades (`aviso_atividades_mes`) e o lembrete na semana da prova (`lembrete_prova`), ambos de Utilidade.
A tela mostra quantos recebem, o custo e o que bloqueia antes de enviar, e pede confirmação. O envio usa a fila de campanhas pelo
número da Tutoria (`TutoriaServices/Notices.ts`). O tutor só alcança os próprios alunos. Para 1.600 alunos, 3.200 avisos ficam
perto de US$ 22 (cerca de R$ 120) por mês.

Para ligar: conectar o número oficial da Tutoria (Função do número = Tutoria), mandar o pacote de modelos para aprovação em
Modelos da Meta e autorizar o envio com modelos.

## Fora do escopo por enquanto
- **Coexistência:** o consultor usar o app WhatsApp Business no mesmo número oficial. Só faz sentido se cada consultor tiver um número oficial próprio.
- **Sincronização automática dos modelos da Meta:** hoje o nome do modelo é digitado à mão.

## Dois números: Atendimento (consultores) e Tutoria (tutores)
- Cada número oficial tem uma **Função**, marcada em Conexões → editar o número → "Função do número":
  - **Atendimento / Matrículas:** usado pelos consultores;
  - **Tutoria:** usado pelos tutores, para os alunos matriculados.
- **Cada perfil atende só pelo seu número.**
  - O consultor não responde nem recebe conversa da tutoria, e o tutor não responde nem recebe conversa comercial. Os dois casos dão erro (`ERR_WRONG_SIDE`, `ERR_USER_WRONG_SIDE`).
  - Gestores (coordenação e admin) atendem os dois lados.
- **Carteira por lado:**
  - no número da Tutoria, o aluno cai com o **tutor dele** (definido na matrícula);
  - no de Atendimento, com o **consultor dono** no CRM.
- **Histórico separado:** cada lado vê só as próprias conversas. O resumo da IA também lê só o próprio lado.
- **"Chamar a tutoria" / "Chamar o consultor"**, na barra da conversa:
  - abre ou acha a conversa do aluno no número do outro lado, com o responsável de lá;
  - o recado e um resumo da IA vão junto;
  - a conversa de origem continua com quem estava.
  - A IA do número de matrículas faz o mesmo quando o assunto é acadêmico e avisa o aluno de que a tutoria vai falar pelo número da Tutoria.
- **Mensagem de abertura:** fora das 24h, o número oficial só pode iniciar uma conversa com um modelo aprovado.
  - Configure em Configurações → Tutoria: nome do modelo e idioma, um para cada lado.
  - Parâmetros: {{1}} = primeiro nome do aluno, {{2}} = primeiro nome de quem escreve.
- **Meus alunos** (menu da tutoria): a carteira do tutor, com:
  - primeiro contato atrasado;
  - aluno sem contato há N dias (`tutoria_idle_days`, padrão 15);
  - chamados do comercial ainda sem resposta;
  - mensagens não lidas;
  - janela de 24h fechada.
  - Ações: abrir a conversa no número da Tutoria e enviar a abertura.

## Primeira abordagem do tutor
- Quando a conversa chega ao tutor e ninguém respondeu ainda, aparece um aviso no topo com o texto de apresentação pronto. O sistema
  **nunca envia sozinho**: o tutor clica em "Usar texto de apresentação", confere e envia.
- **Aluno com matrícula:** o aviso mostra curso, polo, RGM, data da matrícula, consultor e a observação do consultor (por exemplo
  "Prefere à noite"). O texto padrão responde ao aluno, apresenta o tutor, cita o polo e o curso e convida para a ambientação, com uma
  pergunta só:
  > Olá, Ana, que bom que você chamou! Eu sou João, tutor(a) da Cruzeiro do Sul Virtual no polo Porto Velho, e vou acompanhar você no curso de Pedagogia. O primeiro passo é a sua ambientação, a apresentação da plataforma de estudos. Qual o melhor dia e horário para falarmos?
- **Contato sem matrícula no sistema** (alguém que escreveu no número da Tutoria e não tem matrícula): o aviso diz isso e o texto não
  fala de matrícula nem de ambientação, só apresenta o tutor e pede o RGM.
- **Texto da empresa e de cada tutor:** Configurações → Tutoria e Ambientação → "Meu texto de boas-vindas". Variáveis: `{{saudacao}}`
  ("Olá, Ana, que bom que você chamou!" quando o aluno escreveu primeiro, senão "Olá, Ana!"), `{{primeiro_nome}}`, `{{nome}}`,
  `{{tutor}}`, `{{polo}}`, `{{curso}}` e `{{instituicao}}`, preenchidas com os dados da matrícula. O trecho entre `[[` e `]]` só aparece
  quando todas as variáveis dentro dele têm valor: `[[ no polo {{polo}}]]` some se o aluno ainda não tem polo.
- Código: `backend/src/helpers/OnboardingWelcome.ts` (`fillWelcome`, `welcomeFacts`) e `GET /tickets/:id/welcome`.

## Criar o número da Tutoria
### 1. O número
- **Mais fácil e garantido: um chip pré-pago** de qualquer operadora, de preferência com DDD 69 (cerca de R$ 15). Ele só serve para receber o código uma vez; não precisa ficar num celular depois.
- **Alternativa virtual:** um **número fixo virtual brasileiro** de operadora VoIP (por exemplo Nvoip ou Telnyx), validado **por ligação**.
  - A Meta aceita fixo com código por voz, mas alguns números VoIP são recusados.
  - Durante a validação, desligue desvio de chamada e URA.
  - Evite números gratuitos ou compartilhados.
- **Regra da Meta:** o número **não pode estar em nenhum WhatsApp**, nem no app WhatsApp Business. Depois de ir para a API, ele não funciona mais no app.

### 2. Na Meta (uma vez)
1. Abra o Business Manager → WhatsApp Manager → **Números de telefone → Adicionar número de telefone**, na **mesma conta (WABA)** do número dos polos.
2. Preencha o nome de exibição (ex.: "Cruzeiro do Sul Virtual – Tutoria"), a categoria Educação e o fuso horário.
3. Valide por SMS (chip) ou por ligação (fixo ou VoIP).
4. Copie o **Phone Number ID** do novo número, na tela da API do app.
5. Garanta que o **token permanente** (usuário do sistema) tenha acesso ao novo número: Usuários do sistema → Atribuir ativos → a WABA.
6. Crie dois **modelos** na categoria **Utilidade**:
   - `abertura_tutoria`: "Olá, {{1}}! Aqui é {{2}}, da tutoria da Cruzeiro do Sul Virtual. Podemos falar sobre o seu curso?"
   - `abertura_atendimento`: "Olá, {{1}}! Aqui é {{2}}, da Cruzeiro do Sul Virtual. Podemos continuar seu atendimento?"
   - Espere a aprovação.

### 3. No Chat
1. Em **Conexões → Adicionar → WhatsApp (API Oficial)**, informe o Phone Number ID do novo número, o **mesmo** token de acesso, o **mesmo** App Secret e o **mesmo** Verify Token do número dos polos. Em **Função do número**, escolha **Tutoria**.
2. **Não crie outro webhook.** O app da Meta já envia para a URL do número dos polos, e o Chat entrega cada mensagem à conexão do número certo.
3. No número dos polos, marque **Função do número = Atendimento / Matrículas**.
4. Em **Configurações → Tutoria → Mensagem de abertura**, informe `abertura_tutoria` e `abertura_atendimento`, com idioma `pt_BR`.
5. Em **Operação e custos**, libere o envio de modelos (`outbound_allow_templates`).
6. Faça o teste: mande uma mensagem do seu celular para o número da Tutoria. A conversa deve aparecer para o tutor do aluno, ou na fila da tutoria do polo, e nunca para os consultores.

