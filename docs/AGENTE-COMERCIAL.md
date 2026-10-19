# Agente comercial de graduação ("Comercial — Graduação")

Modelo de agente de IA desenhado em blocos (o mesmo quadro do chatbot) que atende leads de graduação, consulta dados acadêmicos reais,
mantém o CRM sozinho e entrega o lead ao consultor com um resumo. Chave do modelo: `graduacao_comercial_cruzeiro`.

## Como criar e publicar
1. Agentes de IA → **Novo agente** → **Modelo por segmento** → Comercial — Graduação. Deixe marcado "Preparar o funil do CRM": o sistema
   reconhece as colunas que já existem e cria só as que faltam (nada é renomeado, movido ou apagado).
2. O agente nasce **desligado** e o desenho como **rascunho**. Abra os blocos, clique em **Testar** (o simulador mostra o que a IA fez
   em cada turno), **Publique** e, por fim, ligue o agente.
3. Pontos que a equipe precisa preencher (sem isso o agente diz que vai confirmar, nunca inventa):
   - Agentes de IA → **Regras do MEC**: por curso (e por período de ingresso) se é impactado, aulas ao vivo, práticas presenciais,
     cronograma e o texto aprovado.
   - Base de conhecimento do agente: docentes, reconhecimento e matrícula (só há textos prontos para tutoria, plataforma, estágio
     remunerado, mudança do MEC e análise curricular).
   - Preço do modelo (aba Consumo) para ver o custo em dólares.
   - Agentes de IA → **Funil do CRM**: conferir qual coluna cada passo usa.

## O que é código e o que é IA
A IA só entende a mensagem (intenção, dados) e escreve a resposta. Quem decide é o sistema, sempre igual:
- **Respostas sem IA**: a abertura (com o próximo dado que falta), o pedido de uma pessoa e a pergunta de valor/bolsa/matrícula/proposta.
- **Funil**: o lead só anda para frente (Contato iniciado → Em atendimento → Qualificado → Aguardando histórico/Análise curricular →
  Análise concluída → Pronto para proposta). Atendimento humano, Follow-up e Sem interesse podem ser entrados de qualquer coluna antes
  da proposta. Uma coluna que a equipe escolheu à mão é respeitada.
- **Matriculado**: só a matrícula confirmada pelo sistema preenche. O agente não tem como mover para lá (nem por bloco, nem por regra).
- **Temperatura, pontuação, próxima ação, tarefas (sem repetir), nota e resumo para o consultor**: regras puras (`CommercialServices/Rules.ts`).
- **Valores, bolsas, cronogramas e percentuais do MEC nunca saem do agente**: ferramentas devolvem só o que está cadastrado, e uma
  resposta com valor em reais é trocada pelo encaminhamento ao consultor.

## Gasto de IA
Uma chamada principal por turno (a segunda só quando uma consulta precisa de resposta), identidade curta, 4–8 mensagens relidas, resumo
persistido, trechos da base só do assunto da pergunta e cache das consultas de cursos/grades/regras (invalida sozinho ao editar os dados).
O painel **Funil comercial** mostra chamadas, ferramentas, cache, respostas sem IA, tokens por conversa/lead qualificado/lead pronto e custo.

## Onde cada coisa aparece
- Cartão do CRM e ficha do lead: temperatura, pontuação, próxima ação e o resumo para o consultor.
- Painel da conversa: o mesmo cartão "Atendimento com IA".
- Agentes de IA → agente → **Funil comercial**: funil por passo e uso da IA.
- Marcos fora da conversa: proposta enviada, cobrança da matrícula, matrícula confirmada e análise curricular concluída pela equipe
  (nesse caso o lead recebe um aviso e a resposta dele abre a explicação).

## Quem assume a conversa (transferência para o comercial do polo)
Toda passagem do agente para uma pessoa (pedido de atendente, hora da proposta, pergunta sem resposta, reclamação, erro da IA, limites)
passa por um único serviço, `CommercialServices/Router.ts`:
1. **Polo**: o do lead; se não houver, o que a cidade informada indica (sem acento, com frase e erro de digitação) e que passa a ser gravado no lead.
2. **Fila**: a fila comercial do polo; sem equipe, a **fila de reserva** (Agentes de IA → *Quem assume*; padrão: a primeira fila comercial com consultores);
   sem nenhuma, a conversa fica pendente na fila do polo e a gestão é avisada. Nunca fica sem destino.
3. **Consultor**: o dono do lead, se for do polo; senão o rodízio da fila.
4. **Aviso na hora** (toast + som para o consultor, a fila ou a gestão) e tarefa "Atender lead encaminhado pelo agente de IA"
   (15 min no expediente; no primeiro quarto de hora do próximo expediente quando fora dele). Fora do horário o lead recebe quando a equipe retorna.
5. **Registro**: evento "Agente de IA → Comercial do polo X (consultor)" com o motivo, colunas `Tickets.handoffAt/handoffReason`, métrica `handoff_<motivo>`.
6. **Se ninguém atender** (padrão 15 min úteis): aviso ao consultor/fila/gestão; no segundo prazo a conversa passa ao próximo consultor da fila
   (`workers/HandoffSla.ts`). Conversas paradas do agente por 7 dias viram "Sem resposta" com tarefa (`workers/StaleRuns.ts`).

Motivos: `human_request`, `proposal`, `unknown`, `limit_turns`, `limit_tokens`, `error`, `complaint`, `media`, `loop`, `other`.

## O que o agente nunca diz (e como falha com segurança)
- `Guards.ts` barra, em toda resposta, valores em qualquer forma, "% de bolsa/desconto", gratuidade, promessa de aproveitamento e qualquer
  número, porcentagem, data ou horário que não esteja no resultado das ferramentas, na base aprovada ou na mensagem da pessoa
  (valor/bolsa → encaminha para a proposta; o resto → "vou confirmar" e a pergunta vai para a equipe). Cada bloqueio vira a métrica `agent_guard`.
- Erro do provedor (sem chave, 401, 429, queda): uma nova tentativa; falhando, o lead é avisado, a conversa vai ao comercial do polo com o motivo
  `error`, o responsável pela IA recebe um WhatsApp e a falha entra nas métricas (`agent_error`).
- Reclamação, pagamento/boleto/estorno, termos jurídicos, número errado, mesmo pedido pela terceira vez e três perguntas seguidas sem resposta
  vão direto para uma pessoa, sem chamar o modelo.
- Mensagem do lead durante uma resposta em andamento é respondida em seguida (marca de "última mensagem respondida" na execução).
- Áudios: com a opção ligada e a chave da OpenAI, são transcritos; senão o agente pede que a pessoa escreva e, no segundo áudio, chama um consultor.
  Histórico em PDF é reconhecido pelo tipo do arquivo (nome com espaço ou legenda funcionam); imagem pede o PDF.
- Chaves das ferramentas externas (cabeçalhos) nunca voltam inteiras ao navegador, não vão em cópias do fluxo e não acompanham a ferramenta
  para outro endereço.
