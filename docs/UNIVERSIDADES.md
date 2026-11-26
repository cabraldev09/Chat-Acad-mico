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

## Bot da SESTED (número oficial compartilhado com o comercial)

A SESTED vende os próprios cursos (graduação, técnico, técnico por competência e pós) pelo mesmo número oficial do comercial. Para os
leads não se misturarem, o bot da SESTED só começa pela **palavra-chave "SESTED"**: o link dos anúncios (Chatbot e fluxos, abrir o
fluxo, "Quando este fluxo começa", Link para anúncios) já manda "Quero conhecer os cursos da SESTED". Quem escreve outra coisa segue o
atendimento de sempre do número. Ele também é o bot de uma campanha (campo "Bot para quem responder").

- Instalado pela migração `20270105000003-sested-bot.ts` (só onde a universidade SESTED existe): fluxo "Bot SESTED: qualificação"
  publicado, fila "Comercial SESTED" (vazia: a gestão coloca os consultores em Filas) e etiqueta "SESTED". O desenho está em
  `FlowServices/SestedBot.ts`; o fluxo se edita na tela como qualquer outro (textos, botões, ordem).
- O que pergunta, com botões: nome, cidade, o que procura (Graduação, Técnico, Técnico por competência, Pós-graduação), formação e, conforme
  o tipo, se é a primeira graduação, se já trabalha na área (técnico por competência; sem experiência sugere o técnico regular) ou, para a
  pós sem superior completo, se prefere graduação. Mostra um resumo para confirmar ou corrigir. Nunca fala valor, bolsa ou prazo.
- O primeiro bloco (`crm` "Definir a universidade") deixa o lead da SESTED: a cidade informada não leva a conversa para as filas dos polos
  da Cruzeiro (`AiServices/Tools.ts applyToLead`).
- "Enviar ao CRM" com "Rodízio entre os consultores de uma fila" (`FlowServices/QueueOwner.ts`): o próximo da fila que aceita atendimentos,
  com quem tem o próprio WhatsApp (QR Code) conectado primeiro. Ele recebe o aviso no sino e a tarefa "Chamar pelo seu WhatsApp". A última
  mensagem diz o nome e o número dele (`{{consultor}}`, `{{consultor_whatsapp}}`: o número digitado ao conectar, ou o telefone do usuário).
- Na ficha do lead, "Chamar pelo meu WhatsApp" abre a conversa no número próprio do consultor; a conversa do número oficial é encerrada com
  uma nota. O servidor recusa o número pessoal de outra pessoa (`LeadController.openTicket`).
- Campos novos do lead preenchidos pelos bots: `courseLevel` (Tipo de curso), `educationLevel` (Formação) e a primeira graduação (vira a
  motivação "Primeira graduação" ou "Segunda graduação" e o ingresso de portador de diploma).
- Modelos da Meta da SESTED (`SESTED_PACK` em `CampaignServices/Templates.ts`, nomes `sested_`): retomada do atendimento (o botão
  "Continuar na SESTED" abre o bot), consultor que continua pelo número dele, proposta pronta, documentos pendentes e matrícula confirmada.
  Vão com o pacote (Modelos da Meta, ou o workflow `meta-modelos.yml` com `confirmar_envio`).

## Bot de uma campanha

No passo Envio da campanha, "Bot para quem responder" escolhe um fluxo publicado. Quem responder à campanha nos 7 dias seguintes, no número
de onde ela saiu, entra nesse bot (`FlowServices/CampaignFlow.ts`, chamado em `RunInboundAutomation` antes do agente de IA e também fora do
horário). Só uma vez por envio, nunca por cima de um fluxo em andamento e nunca depois que alguém da equipe já escreveu para a pessoa.
