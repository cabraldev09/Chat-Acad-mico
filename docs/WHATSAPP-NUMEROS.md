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
