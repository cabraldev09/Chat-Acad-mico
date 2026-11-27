# Proposta de bolsa

O estúdio da proposta abre pelo lead: na ficha, botão **Gerar proposta** ou aba **Propostas**, e no cartão do lead na conversa.
O servidor fica em `backend/src/controllers/ProposalController.ts` e a tela em `frontend/src/pages/CRM/ProposalStudio.js`.

## Dados obrigatórios

| Momento | O que precisa |
|---|---|
| Salvar o rascunho | Nada além de um valor válido. O consultor pode sair e voltar depois. |
| Baixar o PDF ou enviar ao candidato | Forma de ingresso, curso e o vencimento da 1ª mensalidade (vem da turma). |
| Gerar a taxa de matrícula | CPF do lead (`EnrollmentPayments.ts`). |

Se faltar algum dado, o servidor responde `ERR_PROPOSAL_NEEDS_ADMISSION`, `ERR_PROPOSAL_NEEDS_COURSE` ou
`ERR_PROPOSAL_NEEDS_DUE_DATE`. A tela mostra o que falta e desliga os botões.

Ao salvar, a forma de ingresso, o curso e o período da proposta também vão para o lead, nos campos que estiverem vazios.

## Calendário de entradas

Fica em Configurações, no bloco de automação do CRM, em **Calendário de entradas (turmas)**. A configuração se chama
`crm_entry_calendar` e o código está em `backend/src/services/CrmServices/EntryCalendar.ts`.

Cada turma tem:
- período, por exemplo 2027/1;
- nome, por exemplo Fevereiro;
- início e fim das matrículas, e o início dos veteranos;
- prazo do boleto;
- liberação das disciplinas no AVA;
- parcelas do 1º semestre.

As regras:
- O dia da matrícula define a turma (`turmaFor`).
  - Um dia entre dois períodos fica com a próxima turma.
  - Depois da última turma, não há turma, e o consultor informa as datas.
- A 1ª mensalidade vence no prazo do boleto da turma. A 2ª vence no dia de vencimento do modelo, no mês seguinte (`dueDatesOf`).
- A turma define o período (ano e semestre) e o número de parcelas do semestre.
- A tela e a lista mostram as turmas ordenadas pelo prazo do boleto, com esse prazo em destaque.

Sem calendário salvo, vale o de 2027/1:

| Turma | Matrículas | Prazo do boleto | AVA | Parcelas |
|---|---|---|---|---|
| Fevereiro | 17/11/2026 a 01/02/2027 (veteranos a partir de 07/12/2026) | 01/02/2027 | 02/02/2027 | 6 |
| Março | 03/02 a 01/03/2027 | 01/03/2027 | 02/03/2027 | 5 |
| Abril | 03/03 a 01/04/2027 | 01/04/2027 | 02/04/2027 | 4 |
| Maio | 03/04 a 03/05/2027 | 03/05/2027 | 04/05/2027 | 3 |

A turma e a liberação no AVA aparecem no PDF e no resumo do WhatsApp.

## Mensalidade bruta travada

- A mensalidade bruta é o valor do curso no catálogo. O consultor não muda, e o servidor ignora outro valor.
- A gestão (`admin` e `coordenacao`) pode destravar e informar outro valor. Um valor destravado continua quando o consultor
  edita o rascunho depois.
- Curso sem valor cadastrado: só a gestão gera a proposta (`ERR_PROPOSAL_COURSE_NO_PRICE`).
- A bolsa e a 1ª mensalidade continuam editáveis. Mudar uma ajusta a outra.

## Bolsa de ingresso e projeção

O desconto total aplicado à mensalidade e a bolsa de ingresso são campos diferentes. A mensalidade negociada de R$ 147,35,
com bruta de R$ 756,30, corresponde a 80,52% de desconto total. Ela pode ter bolsa de ingresso de 30% no primeiro semestre
e 20% do segundo em diante: a diferença de 10 pontos entra no ajuste da projeção, sem substituir a mensalidade negociada.
Abrir, editar e salvar o rascunho preserva esses valores separados.

Com início em 2026.2, reajuste semestral de 2% e anual de 5% a 11%, o exemplo projeta R$ 172,40 a R$ 181,24 em 2027.1,
R$ 175,85 a R$ 184,87 em 2027.2 e R$ 188,16 a R$ 208,90 em 2028.1. As regras vêm do modelo e continuam editáveis.

## Salvar e sair

- **Salvar:** grava e continua no estúdio. O rodapé mostra "Salvo às 14:32".
- **Salvar e sair:** grava e fecha.
- Fechar com alterações não salvas pergunta: salvar e sair, sair sem salvar ou continuar editando.
- Os balões do WhatsApp editados são salvos com o rascunho e voltam ao reabrir.
- A proposta enviada abre só para leitura. "Duplicar para editar" cria um rascunho novo.

## Várias propostas por lead

- **Nova proposta** fica sempre disponível, na ficha e dentro do estúdio. Serve, por exemplo, para outro curso ou outra condição.
- A lista mostra de cada proposta:
  - curso;
  - turma;
  - 1º vencimento;
  - situação (Rascunho, Enviada ou Vista).
- A taxa de matrícula usa a última proposta enviada e, sem nenhuma enviada, o último rascunho. A lista marca qual vale.
- Só a gestão apaga uma proposta já enviada.

## Propostas parceladas, taxas e formas de pagamento

Usadas na SESTED (técnico regular, técnico por competência, pós e profissionalizante) e na pós-graduação da Cruzeiro.
O modelo de proposta tem o campo **Tipo**: "Graduação" (a projeção por semestre de sempre) ou "Parcelada".

**Parcelada:**
- N parcelas de valor fixo, sem reajuste e sem projeção por semestre.
- O número de parcelas vem, nesta ordem:
  1. da coluna "Parcelas" do curso;
  2. da tabela "Parcelas pela duração" do modelo, uma linha por duração (`6=12`, `9=15`, `12=18`), com a "Duração (meses)" do curso;
  3. do "Total de parcelas do curso (fixo)" do modelo;
  4. senão, uma por mês da duração.
- O consultor pode mudar o número de parcelas e a mensalidade das demais. A 1ª mensalidade continua com valor próprio ou isenta.
- **Taxa de matrícula:** vem do curso ou do modelo; o consultor edita ou isenta.
- **Taxa de certificação:** valor único, pago ao concluir o curso. Vem do curso ou do modelo; o consultor escolhe Cobrar, Isenta
  ou "O curso não tem", e edita o valor.
- **Parcela única:** vem ligada quando o curso tem "Parcela única" (profissionalizante); o consultor liga e desliga. Aparecem as
  formas de pagamento:
  - boleto: o valor cheio;
  - Pix: digitar a % de desconto ou o valor final; um atualiza o outro;
  - cartão: vezes e juros % ao mês. Repassando os juros ao aluno, a parcela segue a tabela Price
    (`valor × i / (1 − (1 + i)^−n)`); sem repassar, é o valor dividido pelas vezes. A tela e o PDF mostram a parcela e o total.
- Os padrões de Pix e cartão ficam no modelo ("Formas de pagamento (parcela única)").

**Qual modelo a proposta usa sozinha:** o consultor pode trocar no estúdio; sem escolha, vale, nesta ordem:
1. o modelo ligado à universidade do curso e ao nível do curso (campo "Níveis de curso" do modelo);
2. um modelo para o nível do curso;
3. o modelo padrão.

Um modelo sem níveis serve para todos. Assim, a graduação da Cruzeiro continua no modelo de graduação, e a pós vai para o da pós.

**Modelos criados na instalação** (só se ainda não existirem, com as taxas e % zerados para a gestão preencher):
"Pós-graduação Cruzeiro" (6=12, 9=15, 12=18; níveis Pós-graduação e MBA), "SESTED: técnicos e pós" (técnicos, pós e MBA) e
"SESTED: profissionalizante" (Profissionalizante).
Cada um fica ligado à universidade de nome parecido, se ela existir em Universidades.

**Planilha de cursos** (Configurações do CRM, Cursos, Importar): além das colunas de sempre, "Duração (meses)", "Parcelas",
"Taxa de matrícula", "Taxa de certificação" e "Parcela única" (Sim ou Não). A coluna "Instituição" precisa ter o nome igual ao
cadastrado em Universidades.

## Testes

- `tests/analysis/unit/entry-calendar.test.ts`: turmas, limites dos períodos, parcelas e vencimentos.
- `tests/analysis/unit/proposal-installments.test.ts`: parcelas pela duração, proposta parcelada, Pix e cartão.
- `scripts/channels-e2e.js`, seção "proposals": obrigatórios, troca de curso, calendário, valor travado, balões salvos e duas
  propostas no mesmo lead.

## Proposta avulsa (sem lead)

Para quem não é lead seu: um colega envia ao lead dele, ou uma simulação para alguém fora do CRM.

- **Onde:** Funil de captação → **Proposta avulsa**. Basta o nome de quem vai receber; o curso, o modelo e os valores são os mesmos da proposta normal.
- **Nada muda no CRM:** não cria lead, não muda etapa, não entra no histórico de ninguém (`Proposals.leadId` vazio e `recipientName` com o nome).
- **Gerar link:** fecha a proposta como está e copia o link público (`/p/<código>`), para enviar por qualquer canal. O PDF sai pelo mesmo botão de sempre.
- **Quem vê:** quem fez; a gestão vê todas. Quando a pessoa abre o link, quem fez recebe um aviso.
- **Conversa sem lead:** em "Dados do contato", **Gerar proposta** cria o lead na hora (com quem gera como responsável) e abre a proposta, que vai pela conversa como sempre.
