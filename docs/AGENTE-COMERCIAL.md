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
