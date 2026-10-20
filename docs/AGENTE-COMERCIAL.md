# Agente comercial de graduação ("Comercial") e agente de atendimento

Modelo de agente de IA desenhado em blocos (o mesmo quadro do chatbot) que atende leads de graduação, consulta dados acadêmicos reais,
mantém o CRM sozinho e entrega o lead ao consultor com um resumo. Chave do modelo: `graduacao_comercial_cruzeiro`.

## Um só agente
- **Comercial** (`graduacao_comercial_cruzeiro`): faz toda a qualificação, tira as dúvidas do curso e, na hora da proposta, passa ao consultor do polo, que gera a proposta comercial. **Também é a porta de entrada de quem já é aluno**: quando a pessoa precisa da **tutoria** (acesso, plataforma, atividades, provas, prazos) ou da **secretaria** (declarações, histórico, certificado, diploma, rematrícula, trancamento), o agente não vende nada: pergunta a cidade (uma vez, se o polo não é conhecido) e chama a fila de tutoria ou de secretaria **do polo** (`Router.routeToCommercial`, motivo `tutoring`/`secretary`). O reconhecimento é do sistema (`Rules.supportIntent`, sem modelo) e do modelo (intents `support_tutoring`/`support_secretary`). O modelo "Atendimento" deixou de existir; um agente que já tenha sido criado a partir dele continua funcionando e pode ser apagado na lista de agentes.
Mensagens saem **em blocos curtos** (`CommercialServices/Blocks.ts`: até 5 balões, ~300 caracteres, a pergunta sozinha no final), em tom humano e profissional, para não aparecer "Ler mais" no WhatsApp.

## Central do agente
Agentes de IA → **Abrir central** (`/ai-agents/:id/central?secao=…`; `/melhorar` redireciona). Cinco seções: **Início** (o que fazer agora, saúde do agente, 4 números de 7 dias, perguntas sem resposta), **Ensinar** (perguntas sem resposta, o que o agente sabe e "Adicionar conhecimento": PDF, texto, página da web, resposta pronta), **Testar**, **Resultados** (funil, entregas por motivo, custos recolhidos) e **Ajustes** (jeito de atender, o que descobrir do cliente, ações automáticas, quem assume, cidades dos polos, etapas do CRM, regras do MEC, chave de IA). Dados: `GET /ai-agents/:id/central` (o `/improve` continua).

## Como criar e publicar
1. Agentes de IA → **Novo agente** → **Modelo por segmento** → Comercial. Deixe marcado "Preparar o funil do CRM": o sistema
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
2. **Fila**: a fila comercial do polo; sem equipe, a **fila central** (Agentes de IA → *Quem assume*; padrão: a primeira fila comercial com consultores);
   sem nenhuma, a conversa fica pendente na fila do polo e a gestão é avisada. Nunca fica sem destino. **Polo sem consultor**: a conversa **continua na fila do polo**
   (não vai para outro polo) e só a gestão é avisada; a fila central vale apenas quando o polo é desconhecido ou não tem fila comercial.
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

## Funcionamento seguro (vários servidores, chaves e conexão)
- **Vários servidores**: a execução do agente é reivindicada no banco (`Tickets.aiClaimAt`, `FlowServices/Claim.ts`, validade de 120 s); duas instâncias nunca respondem a mesma mensagem.
- **Chaves de API cifradas** (`helpers/SecretSettings.ts`, AES-256-GCM, prefixo `enc:v1:`): a chave do agente e as chaves em Configurações são gravadas cifradas; as antigas são cifradas na subida (`sealStoredKeys`). Exige `SECRET_KEY` estável.
- **Conexão do WhatsApp**: `workers/WhatsappWatchdog.ts` e o monitoramento em `wwebjs.ts` reabrem sozinhos uma sessão que fica "abrindo" por mais de 4 min ou que para de responder (pulso de 90 s), com tentativas e aviso quando desiste.
- **Escopo por conexão** (`helpers/ConnectionScope.ts`): grupos e comunidades só aparecem para quem é dono da conexão; conversas privadas de número pessoal de outra pessoa não aparecem (lista, abrir pelo id, Comunidades e Contatos). Administração e coordenação veem tudo.

## Regras do MEC (padrão pela Portaria 378/2025) e grades
- **Padrão por área** (`CommercialServices/MecDefaults.ts`, tela Agentes de IA → Regras do MEC → *Padrão por área*): só presencial (Direito, Enfermagem, Medicina, Odontologia, Psicologia, art. 5º); semipresencial com 40% presencial (Saúde e Bem-Estar, Engenharias, Agricultura/Veterinária, art. 8º); com 30% (licenciaturas, Ciências Naturais, Matemática e Estatística, art. 7º); os demais cursos não mudam (art. 10). O curso é classificado pelo nome e pelo grau da grade (`MecAreas.ts`); a equipe ajusta a área uma vez e aplica a todos os cursos (`/mec-defaults`). No primeiro start os cursos sem regra recebem o padrão e os agentes comerciais ganham o texto da Portaria na base (`MecDoc.ts`).
- **Grades**: o texto enviado ao aluno (`analysis/services/commercial-grades/reader.ts`) lista só os estágios reais (componentes "Estágio …"; o tipo "Estágio" do SIAA também marca Ambientação Digital, Plano de Carreira, Seminários etc.), com o total dessas horas, carga horária, TCC e extensão. Cada matriz é lida de novo do próprio PDF uma vez por versão do leitor (`refreshGradesOnce`) ou por `POST /grades/refresh`.

## Área do tutor (Ambientação)
O tutor que inicia ou conclui um aluno sem tutor o assume (a conversa fica aberta no nome dele); filtros, "aluno respondeu", checklist (primeiro acesso, AVA, contatos do polo, documentos), boas-vindas pelo card, lembrete ao tutor antes das 24 h, aviso e tarefa aos administradores após 24 h e painel de gestão (`GET /onboarding/stats`).

## Atender todos os leads e entregar ao polo certo
- **Qualquer hora**: com um agente de IA ativo no número, ele atende também fora do expediente (o texto de "fora do horário" fica só para números sem agente); a entrega informa quando a equipe responde e cria a tarefa do próximo expediente (`Router.ts`).
- **Cidades de cada polo** (Polos → editar → "Cidades atendidas"; tabela `PoloCoverages`): `PoloServices/ResolvePolo.ts` é o único lugar que decide o polo (cobertura, cidade do polo, só estado, erro de digitação). Cidade em mais de um polo → o agente pergunta qual é o mais perto; cidade que nenhum polo atende → pergunta o estado; sem polo no estado (ou só EAD) → **fila central** (*Quem assume*).
- **Roteamento cedo**: assim que o polo é descoberto a conversa já fica na fila comercial do polo e o dono do lead vira um consultor dele (`Router.assignToPolo`); o agente continua conversando.
- **Pronto para o consultor**: lead qualificado (curso, cidade/polo, ingresso, curso apresentado; transferência espera a análise ser explicada) é entregue depois de `ai_qualified_replies` respostas (padrão 2; 0 desliga), com a mensagem "já tenho o que preciso" e o motivo `qualified`.

## Conversão: o que o agente descobre, como trata dúvidas e como retoma quem sumiu
- **Qualificação leve** (`registrar_turno`): prazo para decidir, turno, motivação, melhor horário, se trabalha e como pretende pagar — gravados nos campos do lead e na pontuação (quem decide agora/esta semana fica quente).
- **Objeções**: tipo (preço, tempo, confiança, outra instituição, família, distância, dúvida sobre EAD) e contagem; o guia "Como tratar objeções" vem da base; após 3 objeções a conversa vai ao consultor (`objection`). "É golpe?" é dúvida (vai ao agente); ter sido enganado é reclamação (vai a uma pessoa).
- **Agendar retorno** (`agendar_contato`): o agente combina dia e horário e cria a tarefa "Retornar ao lead no horário combinado" para o consultor do polo.
- **Resumo ao consultor**: origem/campanha, o que o lead contou, tipos de objeção, últimas falas e o próximo passo sugerido; no CRM, selo e filtro "Prontos para o consultor" (`LeadCommercials.readyForConsultant`).
- **Retomar quem sumiu** (`workers/AiReactivation.ts`): até 2 lembretes (3 h e 9 h depois), só com a janela de 24 h aberta, em horário comercial, sem opt-out, e só se uma pessoa não assumiu; `ai_reactivation=0` desliga. Áudio é transcrito por padrão quando há chave da OpenAI.

## Medir (aba Resultados da Central)
Além do funil: quantos leads **entraram** no sistema (evento `lead_created`, por qualquer porta) contra os atendidos pelo agente; funil **por polo** e **por origem** (pelo lead, cada lead uma vez por etapa); **motivo de perda** estruturado na coluna "Sem interesse" (preço, outra instituição, horário, desistência) a partir da objeção que apareceu (`Ports.lostReasonOf`); tempo e pendências de resposta da equipe só das conversas **deste** agente; e "conversas atendidas" por agente.
