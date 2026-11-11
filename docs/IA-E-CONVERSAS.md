# IA, chatbot e conversas: como funciona (e o que não dá para fazer)

## Agente de IA
**Menu → Agentes de IA → Novo agente.** As abas são Instruções e limites, Base de conhecimento,
Aprendizado, Qualificação, Funções, Consumo, Testar agente e Automação e retomada.

### Como o gasto fica baixo
| O que o sistema faz | Efeito |
|---|---|
| Espera o aluno terminar de escrever (4 s por padrão) e responde **uma vez** a várias mensagens seguidas | menos chamadas |
| **FAQ sem IA**, quando ativada pelo administrador em Automação e retomada, envia a resposta aprovada com um próximo passo | sem tokens nessas respostas; mensagens do canal ainda podem ser cobradas |
| A base é dividida em trechos e só os **3 ou 4 mais parecidos com a pergunta** vão ao modelo (busca de texto em português no Postgres) | prompt pequeno |
| Instruções fixas ficam antes do contexto variável; Anthropic recebe marcação explícita de cache | permite aproveitar cache conforme o modelo e as condições do provedor |
| Memória configurável de 6 a 24 falas (padrão 12) e **resumo** atualizado a cada 4 respostas, nos dois provedores | contexto limitado, preservando o resumo anterior |
| Modelo pequeno por padrão (`claude-haiku-5-5`) e respostas de até 350 tokens | custo por resposta baixo |
| Limite diário verificado antes de cada rodada; no máximo duas rodadas de ferramentas e uma resposta final | interrompe novas chamadas ao atingir o limite; chamadas em andamento e conversas simultâneas podem ultrapassá-lo |

A aba **Consumo** mostra tokens do dia, da semana, por dia e quantas conversas foram atendidas. O custo em dólar só aparece se
você cadastrar o preço do modelo em Configurações (`ai_price_<modelo>` = `entrada,saída` por milhão de tokens): o sistema não
inventa preços. A estimativa inclui os testes e considera o modelo usado em cada chamada. Tarifas específicas de cache e cobranças da Meta não entram na estimativa. Os tokens de cache dos dois provedores entram na contagem; testes são cobrados, mas ficam fora do limite diário de atendimento.

### O que o agente faz sozinho
* Responde só com o que está na base ou nas ferramentas: **buscar curso** (catálogo e mensalidade de tabela), **listar polos**,
  **simular bolsa** (estimativa, somente se habilitada pelo administrador e com percentual explicitamente informado pelo aluno) e **salvar dados do aluno** (nome, cidade, curso, modalidade, forma de ingresso, semestre).
* Nunca afirma mensalidade fixa até o fim do curso nem regressão de bolsa (regra fixa do prompt e aviso nas ferramentas).
* Quando os campos obrigatórios (aba Qualificação) estão preenchidos: atualiza o lead, anota o resumo no histórico da
  conversa, cria uma tarefa para o consultor e **passa a conversa para a fila comercial do polo do aluno**, respeitando a regra de
  distribuição da fila (rodízio ou menos ocupado).
* Quando o aluno pede uma pessoa, o assunto foge da base, o limite diário acaba ou algo falha: passa para a equipe, nunca fica mudo.

### O agente aprende com você (aba Aprendizado)
1. Se o agente não achar a resposta, ele diz ao aluno que vai confirmar, **guarda a pergunta** e passa a conversa para a equipe.
2. Se você preencheu **WhatsApp para receber os avisos** (aba Instruções e limites), recebe uma mensagem: "o agente não soube responder…".
3. Quando alguém da equipe responde ao aluno, a resposta vira uma **sugestão** em *Aprendizado → Para revisar* (e você recebe outro aviso no WhatsApp, até 20 por hora).
4. Você edita e clica em **Aprovar e ensinar**. A partir daí o agente usa a resposta: como conhecimento (padrão) ou sempre com o mesmo texto.
5. Nada é aprendido sem a sua aprovação. Também dá para ensinar direto: na aba *Testar agente*, use **Corrigir esta resposta**.

Na aba *Base de conhecimento*, **Testar uma pergunta** mostra quais trechos o agente leria, e cada resposta do teste informa em quais documentos ela se baseou.

### Limites honestos
* OpenAI e Anthropic usam ferramentas, resumo e as mesmas orientações. A resposta depende do modelo; testes automáticos não garantem aderência absoluta a instruções livres nem conversão comercial.
* A busca é por palavras (não por significado). Perguntas com sinônimos pouco comuns podem não achar o trecho; cadastre uma
  pergunta frequente com as variações.
* PDF escaneado (imagem) não tem texto para ler: cole o texto.
* A proposta em rascunho feita pela IA ainda não existe: hoje a IA entrega os dados e o resumo, e o consultor monta a proposta.

### Automação e retomada
* **Conduzir para a matrícula**: habilitado por padrão. A IA responde à dúvida antes de qualificar e o sistema acrescenta uma pergunta específica quando a resposta termina sem pergunta. Ao completar a qualificação, avisa a transferência e registra o encaminhamento para a equipe.
* **FAQ sem IA**: desligada por padrão, pois o texto pronto não é adaptado às instruções. Desligada, a FAQ correspondente serve como fonte para a resposta do modelo.
* **Simulação de bolsa**: desligada por padrão; mesmo ligada, não confirma oferta, pagamento ou matrícula.
* **Retomada**: o administrador ativa, define de 5 a 1.380 minutos e escreve a mensagem (até 600 caracteres). Há uma tentativa por período sem resposta, sem chamada à IA. Uma nova mensagem do lead libera outra tentativa futura.
* A rotina verifica candidatos a cada minuto, em lotes de 50 por agente, dentro do horário da conexão e nas primeiras **23 horas desde a última mensagem do lead** (margem antes da janela de 24 horas). Não reabre conversas com templates. A cobrança da mensagem depende da Meta e do canal; não há promessa de gratuidade.
* Não envia retomada para contatos que recusaram mensagens, atendimentos encerrados, grupos, histórico, leads ganhos/perdidos, atendimentos assumidos por humanos ou fluxos em andamento. Uma atualização condicional evita duplicação entre workers; falha de envio não é repetida automaticamente, pois a entrega pode ter ocorrido.
* A recusa explícita no atendimento com IA desativa a automação e registra `optOut`. Orientações comerciais ficam em **Regras do atendimento**; fatos, cursos e respostas aprovadas ficam na base de conhecimento. Abrir **Testar agente** salva as orientações atuais antes do teste.

### Verificação antes de usar com leads reais
Execute `cd backend && npm run test:ai` para testar o fluxo com dependências simuladas, sem banco, tokens pagos ou mensagens reais. Os builds de backend e frontend também precisam passar. No painel, valide as orientações da sua instituição com exemplos de preço, objeção, dados já informados, pedido de atendente e informação desconhecida. As mudanças no código precisam ser publicadas e a retomada precisa ser ativada no agente para valer em produção.

Referências: [instruções e contexto na OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering), [cache de prompts](https://developers.openai.com/api/docs/guides/prompt-caching) e [política de mensagens do WhatsApp](https://whatsappbusiness.com/policy/).

## Chatbot de menus
Além de submenu, texto, fila, atendente, IA e encerrar, há passos que **seguem o fluxo**: *perguntar e guardar a resposta*,
*perguntar o polo e enviar à equipe dele*, *mover o lead de etapa*, *etiquetar* e *avisar outro sistema (webhook)*. O botão
**Testar o fluxo** simula a conversa sem enviar nada. Quem larga o menu pela metade recebe **um** lembrete depois de 30 minutos
(configuração `chatbot_reminder_minutes`, 0 desliga), dentro do horário comercial e da janela de atendimento.

## Conversas
* **Fixar** (até 5, pessoal) e **Arquivar** (some da caixa para todos; a próxima mensagem do contato traz de volta). Menu da
  setinha no item da lista e botões no cabeçalho da conversa; a aba *Arquivadas* mostra as arquivadas.
* **Listas e permissões**: cada pessoa vê as próprias conversas e as que aguardam atendimento nas suas filas. Consultor e tutor
  não veem as conversas um do outro, nem na lista.

### "Digitando…" e reações por canal
| Canal | Atendente → contato: digitando | Contato → atendente: digitando | Reações (enviar) | Reações (receber) |
|---|---|---|---|---|
| WhatsApp por QR Code | sim | **não** (o WhatsApp não informa) | sim | sim |
| WhatsApp Cloud API | não (a API não oferece sem responder uma mensagem) | **não** | sim | sim |
| Telegram | sim | **não** (bots não recebem) | sim (emojis aceitos pelo Telegram) | sim |
| Messenger | sim | **não** | sim (👍 ❤️ 😂 😮 😢 😡) | sim |
| Instagram | sim | **não** | só ❤️ | sim |
| Chat do site | sim | sim | não | não |

Os canais que dizem **não** não entregam o evento a sistemas de atendimento. Não é uma limitação deste sistema.

## Operação e custos

Em **Configurações → Operação e custos**, administração e coordenação configuram prazos de resposta, escalonamento, fila de fallback e tarefas comerciais. Somente a administração altera limites financeiros e autoriza templates. O administrador também consulta encaminhamentos sem responsável, entregas a conferir, capacidade dos atendentes e estimativas de consumo.

- Cada período sem resposta é acompanhado, mesmo depois do primeiro contato humano. Um alerta inicial e um escalonamento são registrados por período. Horário comercial, grupos, contatos de equipe e contatos que recusaram mensagens são respeitados.
- A distribuição automática considera pausa de recebimento e capacidade de conversas abertas. Zero significa sem limite. Se ninguém estiver disponível, a conversa fica visível na lista de atendimentos sem responsável; o sistema tenta distribuir novamente. A pessoa também pode pausar o recebimento em **Meu dia**.
- Tarefas automáticas e manuais atualizam `nextFollowUpAt`; conclusão e exclusão recalculam a próxima pendência. A migração recalcula os registros existentes.
- Propostas enviadas e abertas sem retorno, e cobranças pendentes, criam uma única tarefa por evento. Respostas do candidato, conclusão, recusa de contato e pagamento interrompem o acompanhamento correspondente. Esses acompanhamentos não enviam mensagens por conta própria.
- A tela **Meu dia** reúne pessoas aguardando resposta, tarefas, propostas e cobranças. A equipe abre o lead para decidir a próxima ação.

### Autorizações de envio

Inbox, IA, campanhas, agendamentos e cobranças passam pela mesma validação. Um contato que pediu para parar não recebe novos envios, exceto a confirmação de saída. Mensagens automáticas respeitam o horário da conexão; a confirmação de saída e o aviso de fora do horário são exceções de serviço. A janela de Meta é verificada por contato e conexão. Fora da janela, o WhatsApp Cloud exige um template aprovado; templates ficam bloqueados até autorização administrativa. Instagram e Messenger não recebem essa exceção de WhatsApp.

Cada tentativa autorizada tem um registro persistido. Campanhas e agendamentos usam identificadores estáveis. Mensagens que ficaram em envio durante uma interrupção passam para conferência; não voltam automaticamente à fila. Em **Conferir entregas**, o gestor verifica a conversa e registra entrega ou falha. Para reenviar, cria um novo envio deliberadamente. A revisão não apaga a reserva de custo de uma tentativa ambígua, pois não comprova a cobrança do provedor.

### Orçamento

Os limites globais são opcionais (zero = ilimitado). A administração recebe alertas ao atingir 80% e 100% dos valores configurados, considerando valores utilizados e reservados. O limite global de IA inclui atendimento, resumo e testes. Antes da chamada, o sistema reserva uma margem conservadora baseada nos bytes do pedido e no limite de saída; pedidos concorrentes não podem reservar o mesmo saldo. Ao registrar o consumo, a reserva é liberada na mesma transação. Chamadas de resultado incerto conservam a reserva até o fim do dia.

Preços por modelo continuam em **Agentes de IA → Consumo**. Um orçamento em dólares depende de preços cadastrados; consumo do dia sem preço impede autorizar um novo gasto por esse orçamento. Tarifas estimadas de serviço e de templates Meta são configuradas separadamente. São estimativas de controle, sem importação ou conciliação automática das faturas. Categoria, destino, cache e tarifas reais podem diferir dos valores cadastrados. Indicadores por matrícula/qualificado comparam totais do dia, sem afirmar atribuição causal.

### Anexos privados

Arquivos em `/public` agora exigem links assinados com validade de uma hora. Links de mensagens também verificam se a mensagem foi excluída. A tela renova anexos quando necessário; usuários autenticados só renovam anexos de conversas a que têm acesso. Logos e fotos locais também recebem URLs assinadas. Links antigos sem assinatura deixam de funcionar: reabra o cadastro/conversa para obter o endereço atualizado.

O administrador pode revogar um arquivo pelo nome em **Operação e custos**; isso bloqueia novos acessos, inclusive com links ainda válidos. Downloads já realizados não podem ser recolhidos.

### Publicação

A migração `20261110000001-operational-continuity` adiciona disponibilidade/capacidade, marcadores de alerta, chaves de tarefas e registros de envio/reserva. As tabelas novas usam RLS sem acesso pelo cliente Supabase. Publique backend e frontend juntos, aplique a migração e só então habilite as opções de envio desejadas.

`npm run test:ai`, `npm run test:security`, `npm run test:channels`, i18n, build e lint são verificações de publicação. A integração cria e remove um banco PostgreSQL temporário e usa provedores simulados. Railway e o atualizador da VPS conferem os jobs `verificar` e `integracao` da revisão exata antes de publicar. O bloqueio precisa ser instalado no servidor e as regras de proteção da branch precisam exigir esses jobs. Um serviço externo que publica por conta própria, como a Vercel, precisa respeitar os mesmos checks nas configurações da conta.
