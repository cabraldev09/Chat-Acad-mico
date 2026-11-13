# Números de WhatsApp: oficial central + carteira do consultor

## A decisão
- **Conversa com cliente acontece nos números oficiais**, pela API Oficial (Cloud API) da Meta: um número por polo, ou um número institucional.
  - Esses números não são banidos.
  - Aceitam campanhas e mensagens fora da janela de 24h, por meio de modelos aprovados.
  - A gestão vê todas as conversas.
- **O cliente é do consultor ("carteira")**: quem já foi atendido volta direto para o mesmo consultor quando escreve de novo, mesmo no número compartilhado.
  - O consultor assina as mensagens com o próprio nome. A opção "Assinar" do campo de mensagem vem ligada.
- **O WhatsApp corporativo do consultor (QR code)** fica só para quem ainda não migrou. É uma conexão não oficial e corre risco de banimento, principalmente com contatos frios e envios em volume.

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
- A Meta cobra por conversa ou mensagem, de acordo com a categoria: serviço, marketing ou utilidade.
- As respostas do consultor a uma mensagem do cliente (serviço) dentro da janela costumam ser gratuitas ou baratas.
- Disparos de marketing custam mais.
- As estimativas e os limites diários do sistema ficam em Configurações → Operação e custos.

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

