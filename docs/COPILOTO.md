# Copiloto do consultor

Em **Configurações → Copiloto**, a administração e a coordenação controlam a disponibilidade, o agente usado nas sugestões, os limites e o processo comercial. No atendimento, o botão de ajustes abre a revisão do processo da equipe.

O roteiro começa disponível para todas as conexões, inclusive futuras. As sugestões pagas começam desligadas; a gestão escolhe quando ativá-las. É possível excluir uma conexão ou dar a ela um limite diferente do padrão. O roteiro não ativa o atendimento automático do agente.

Os limites diários abrangem a equipe, cada consultor e cada conexão. Zero significa ilimitado. O dia segue o fuso configurado no sistema. Uma reserva persistida antes da geração impede ultrapassar os limites com abas simultâneas ou reinícios. Falhas continuam contadas porque o provedor pode ter processado a chamada. Repetir um pedido para a mesma mensagem e progresso reutiliza o resultado. Alterar a configuração ou o progresso permite uma nova sugestão, sujeita aos mesmos limites.

As sugestões são contabilizadas como `copilot` no consumo de IA e também respeitam os limites de tokens do agente e do sistema. Ferramentas rodam em simulação: pedir uma sugestão não envia mensagens nem altera o lead. O consultor revisa o texto e decide entre editar e enviar. O envio passa pelas mesmas regras do canal que uma mensagem normal.

O processo padrão acompanha forma de ingresso, curso, cidade/polo, formato/MEC, grade/tutoria/estágio, dúvidas, dados para bolsa, proposta e matrícula. O gestor pode renomear, reordenar, adicionar e remover etapas, definir objetivos e mensagens prontas. A matrícula permanece na última posição e depende do registro real no CRM. Salvar uma edição antiga após outra revisão retorna conflito, evitando sobrescrever silenciosamente o trabalho de outro gestor.

O progresso combina a leitura das mensagens recentes e dos dados do CRM com ajustes explícitos do consultor. Concluir/reabrir uma etapa persiste por conversa; “Usar detecção automática” remove o ajuste. Uma marca no checklist não cria matrícula. Contatos ainda sem lead recebem o roteiro e a indicação de cadastro no CRM.

Para desligar apenas o consumo de IA, desative as sugestões. O roteiro e seus textos prontos continuam funcionando, inclusive após atingir o limite diário. Grupos, históricos e conversas encerradas ficam fora do painel comercial.

## Resumo do cliente com IA
- Mostra o **histórico inteiro do cliente**, não só desta conversa: as últimas 60 mensagens de todos os atendimentos, com quem atendeu.
- Devolve: resumo, interesse, pendências, objeções, próximo passo e uma mensagem sugerida.
- **Quando é feito:**
  - sozinho, quando quem atende abre uma conversa de cliente que já tinha histórico, que chegou por transferência ou que voltou pela carteira;
  - nos outros casos, pelo botão "Resumir histórico".
- Fica guardado na conversa e só é refeito quando chega mensagem nova.
- Conta nos mesmos limites diários das sugestões.
- Rotas: `POST/GET /tickets/:id/copilot/brief`.

## Sugestão de resposta
- Usa as últimas 20 mensagens e o resumo do cliente, quando houver.
- Variações: Outra versão, Mais curta, Mais formal, Mais calorosa. Cada uma conta no limite.
- Mostra "Baseado em:" com os títulos da base de conhecimento usados.
- **Não há envio de um clique para texto da IA.** "Usar e editar" coloca o texto na caixa de mensagem, e o consultor revisa e envia. O "Enviar" direto continua só para o texto pronto do gestor.
- **Medição:**
  - a sugestão levada para a caixa fica marcada como "taken";
  - a próxima mensagem do consultor na conversa, em até 15 minutos, marca a sugestão como `used` (90% ou mais das palavras), `edited` (30% ou mais) ou `discarded`.
- 👍 / 👎 em sugestões e resumos. No 👎, um motivo opcional.
- Configurações → Copiloto → **Uso pela equipe**: sugestões, resumos, taxa de "enviada como veio" e de "editada", e os 👍/👎 por consultor (`GET /copilot/usage`).
- O custo aparece em Agentes de IA, nas chamadas do tipo `copilot`. Essas chamadas não contam como "conversas atendidas" pelo agente.

