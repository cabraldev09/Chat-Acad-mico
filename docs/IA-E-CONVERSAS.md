# IA, chatbot e conversas: como funciona (e o que não dá para fazer)

## Agente de IA
**Menu → Agentes de IA → Novo agente.** Cada agente tem cinco abas: Persona e limites, Base de conhecimento,
Qualificação, Consumo e Testar agente.

### Como o gasto fica baixo
| O que o sistema faz | Efeito |
|---|---|
| Espera o aluno terminar de escrever (4 s por padrão) e responde **uma vez** a várias mensagens seguidas | menos chamadas |
| **Perguntas frequentes** (aba Base de conhecimento) são respondidas sem chamar a IA | custo zero nessas perguntas |
| A base é dividida em trechos e só os **3 ou 4 mais parecidos com a pergunta** vão ao modelo (busca de texto em português no Postgres) | prompt pequeno |
| O bloco fixo do prompt (persona e regras) usa **cache do provedor** | as chamadas seguintes custam uma fração |
| Memória curta: 6 últimas falas + **resumo** atualizado a cada 8 respostas | prompt não cresce |
| Modelo pequeno por padrão (`claude-haiku-5-5`) e respostas de até 350 tokens | custo por resposta baixo |
| **Limite diário de tokens** e **máximo de respostas por conversa**: ao atingir, a conversa vai para a equipe | sem surpresas |

A aba **Consumo** mostra tokens do dia, da semana, por dia e quantas conversas foram atendidas. O custo em dólar só aparece se
você cadastrar o preço do modelo em Configurações (`ai_price_<modelo>` = `entrada,saída` por milhão de tokens): o sistema não
inventa preços.

### O que o agente faz sozinho
* Responde só com o que está na base ou nas ferramentas: **buscar curso** (catálogo e mensalidade de tabela), **listar polos**,
  **simular bolsa** (estimativa) e **salvar dados do aluno** (nome, cidade, curso, modalidade, forma de ingresso, semestre).
* Nunca afirma mensalidade fixa até o fim do curso nem regressão de bolsa (regra fixa do prompt e aviso nas ferramentas).
* Quando os campos obrigatórios (aba Qualificação) estão preenchidos: atualiza o lead, anota o resumo no histórico da
  conversa, cria uma tarefa para o consultor e **passa a conversa para a fila comercial do polo do aluno**, respeitando a regra de
  distribuição da fila (rodízio ou menos ocupado).
* Quando o aluno pede uma pessoa, o assunto foge da base, o limite diário acaba ou algo falha: passa para a equipe, nunca fica mudo.

### O agente aprende com você (aba Aprendizado)
1. Se o agente não achar a resposta, ele diz ao aluno que vai confirmar, **guarda a pergunta** e passa a conversa para a equipe.
2. Se você preencheu **WhatsApp para receber os avisos** (aba Persona e limites), recebe uma mensagem: "o agente não soube responder…".
3. Quando alguém da equipe responde ao aluno, a resposta vira uma **sugestão** em *Aprendizado → Para revisar* (e você recebe outro aviso no WhatsApp, até 20 por hora).
4. Você edita e clica em **Aprovar e ensinar**. A partir daí o agente usa a resposta: como conhecimento (padrão) ou sempre com o mesmo texto.
5. Nada é aprendido sem a sua aprovação. Também dá para ensinar direto: na aba *Testar agente*, use **Corrigir esta resposta**.

Na aba *Base de conhecimento*, **Testar uma pergunta** mostra quais trechos o agente leria, e cada resposta do teste informa em quais documentos ela se baseou.

### Limites honestos
* Com provedor OpenAI o agente responde com base de conhecimento, mas **sem ferramentas** e sem cache.
* A busca é por palavras (não por significado). Perguntas com sinônimos pouco comuns podem não achar o trecho; cadastre uma
  pergunta frequente com as variações.
* PDF escaneado (imagem) não tem texto para ler: cole o texto.
* A proposta em rascunho feita pela IA ainda não existe: hoje a IA entrega os dados e o resumo, e o consultor monta a proposta.

## Chatbot de menus
Além de submenu, texto, fila, atendente, IA e encerrar, há passos que **seguem o fluxo**: *perguntar e guardar a resposta*,
*perguntar o polo e enviar à equipe dele*, *mover o lead de etapa*, *etiquetar* e *avisar outro sistema (webhook)*. O botão
**Testar o fluxo** simula a conversa sem enviar nada. Quem larga o menu pela metade recebe **um** lembrete depois de 30 minutos
(configuração `chatbot_reminder_minutes`, 0 desliga).

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
