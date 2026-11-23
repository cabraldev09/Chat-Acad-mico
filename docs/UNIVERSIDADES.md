# Universidades do grupo

Um sistema só atende as universidades do grupo. O mesmo time atende todas, então não há permissão por universidade. O que muda é
a marca, o nome que a IA usa e, nas próximas etapas, o catálogo, os modelos da Meta, o pagamento e os relatórios.

## Cadastro

CRM → Configurações → **Universidades** (`/institutions`, gestão). Cada universidade tem:

| Campo | Para que serve |
|---|---|
| Nome, CNPJ, logo | Cabeçalho da proposta e das páginas. |
| Nome curto | Como a IA e as mensagens chamam a universidade. Vazio: usa o nome. |
| Endereço (`slug`) | Endereço das páginas públicas da universidade. Gerado pelo nome se ficar vazio. Não se repete. |
| Cor da marca | Cor das páginas públicas (`#RRGGBB`). |
| Site, remetente e rodapé | Usados nas páginas e nos e-mails da universidade. |
| Padrão | Tudo que não disser outra universidade fica com a padrão. Há sempre uma só. |

Regras:
- A padrão não pode ser desativada nem apagada. Para trocar, marque outra como padrão. A instituição que era padrão na migração também não
  pode ser apagada porque registros históricos sem ID ainda dependem dela.
- Uma universidade com números, conversas, leads, campanhas, agentes, cursos, propostas ou configurações ligadas não pode ser apagada. Desative-a para encerrar o uso sem reclassificar o histórico.

## De onde vem a universidade

- **Número:** escolhida no cadastro do número (Conexões), quando há duas ou mais universidades. Ao salvar vazio, usa o padrão atual.
- **Conversa (`Tickets.institutionId`):** herda do número ao ser criada.
- **Lead (`Leads.institutionId`):** herda da conversa mais recente do contato, senão a padrão.
- **Dados antigos:** registros sem `institutionId` pertencem à instituição que era padrão quando a migração foi aplicada. A migração
  mantém esses campos vazios para evitar atualizar tabelas operacionais inteiras e grava esse ID em `Settings.legacy_institution_id`;
  uma troca futura do padrão não muda a marca do histórico. Novos registros recebem um ID explícito. A instituição inicial é escolhida
  pelo nome de Configurações → Geral, pelo catálogo mais usado ou pela primeira ativa; se nenhuma existir, é criada "Cruzeiro do Sul Virtual".

## Nome que a IA usa

`helpers/Institution.ts`:
- `institutionName()` devolve o nome da universidade da conversa em andamento.
- Fora de uma conversa, devolve o nome de Configurações → Geral.

As entradas que trabalham em nome de uma conversa rodam dentro de `withInstitutionOf({ ticketId }, ...)`:
- automação de mensagens recebidas (IA e chatbot);
- retomada de fluxos;
- contato da tutoria;
- copiloto.

Com uma universidade só, ou numa conversa da padrão, nada muda.

## O que segue a universidade

- **Cursos:** um curso pode ser de uma universidade ou de nenhuma em especial.
  - A IA, o chatbot e as ferramentas de cursos (`offeredCourses`, `findCourse`, a busca de cursos do agente) seguem
    `courseInstitutionWhere`. Uma universidade só passa a ter cursos próprios quando ganha pelo menos um número:
    - a conversa de uma universidade com número vê os cursos dela e os sem universidade;
    - a conversa da padrão vê tudo, menos os cursos das outras universidades que já têm número.
  - Assim nada some da IA antes de uma universidade começar a atender pelo número dela.
  - Na importação do catálogo, o mesmo nome, categoria e modalidade em duas universidades são dois cursos.
  - Na universidade padrão, a importação reaproveita os cursos sem universidade ou de universidades ainda sem número, em vez de
    duplicar.
- **Proposta:** usa a universidade do curso, senão a do lead. O cabeçalho mostra o nome e o logo da universidade; a tabela e o
  título usam a cor da marca; o rodapé da universidade aparece no fim.
- **E-mail:** os e-mails sobre um aluno (convite e senha do portal, análise publicada, acesso ativado) saem com o remetente da
  universidade dele. O nome é o do remetente da universidade, senão o nome curto. No Resend, o endereço também muda: precisa estar num
  domínio verificado. No SMTP, o endereço é sempre o da conta. A universidade padrão sem remetente próprio usa o de Configurações.
- **Páginas públicas:**
  - Formulário de captação de uma universidade: `/leadform/<token>/u/<endereço>`. Mostra o nome, o logo e a cor dela e só os cursos que
    a conversa dela ofereceria; o lead já chega com a universidade.
  - O link de cada universidade aparece em CRM → Configurações → Captação quando há duas ou mais.
  - No formulário geral, o lead que escolhe um curso de uma universidade fica com ela.
  - Página de um curso (`/curso/<id>-<nome>`): usa a cor da universidade do curso. Um curso de outra universidade que não a padrão
    mostra o nome dela no lugar do logo do grupo, e o lead fica com a universidade do curso.
- **Agente de IA:** cada número tem o seu agente, então um agente por universidade é só ligar o agente aos números dela.

## Reversão da migração

Antes de reverter `20261222000009-institutions`, faça rollback do código que lê e grava `institutionId`. A migração `down` é atômica,
mas remove as escolhas de universidade, as configurações próprias e os vínculos com polos; não execute `down` com a versão nova do código
em funcionamento.

## Estatísticas por universidade

- Com duas ou mais universidades, o seletor de período (Estatísticas, Central Comercial, Meu desempenho) ganha "Universidade".
- A escolha vai como `?institutionId=` e o middleware `analyticsInstitution` roda a tela inteira dentro dela.
- O filtro de "só clientes reais" das conversas (`VALID_TICKET`) e o trecho `LEAD_IN_INSTITUTION` das consultas de leads passam a
  contar só o que é da universidade escolhida. O que não tem universidade própria conta para a padrão.
- Sem escolha, vale o grupo inteiro. O cache de cada tela é separado por universidade.

## Próximas etapas

- Configurações próprias por universidade (`InstitutionSettings`), caindo na configuração geral: Efí, número da tutoria, formulário.
- Polos que servem várias universidades (`PoloInstitutions`).
- Logo da universidade nos e-mails e no portal do aluno e do afiliado.
- Filtro "Universidade" em Metas, Campanhas e Custos.
