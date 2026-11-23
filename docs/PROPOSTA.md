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

## Testes

- `tests/analysis/unit/entry-calendar.test.ts`: turmas, limites dos períodos, parcelas e vencimentos.
- `scripts/channels-e2e.js`, seção "proposals": obrigatórios, troca de curso, calendário, valor travado, balões salvos e duas
  propostas no mesmo lead.
