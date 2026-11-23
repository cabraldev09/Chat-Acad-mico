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
- A padrão não pode ser desativada nem apagada. Para trocar, marque outra como padrão.
- Uma universidade com números, conversas, leads, campanhas, agentes, cursos, propostas ou configurações ligadas não pode ser apagada. Desative-a para encerrar o uso sem reclassificar o histórico.

## De onde vem a universidade

- **Número:** escolhida no cadastro do número (Conexões), quando há duas ou mais universidades. Vazio quer dizer a padrão.
- **Conversa (`Tickets.institutionId`):** herda do número ao ser criada.
- **Lead (`Leads.institutionId`):** herda da conversa mais recente do contato, senão a padrão.
- **Dados antigos:** registros sem `institutionId` pertencem à universidade padrão. A migração mantém esses campos vazios para evitar
  atualizar tabelas operacionais inteiras e bloquear o atendimento no início do deploy. A padrão é a instituição ativa com o nome de
  Configurações → Geral; se não houver, a primeira ativa; se nenhuma existir, é criada "Cruzeiro do Sul Virtual".

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

## Reversão da migração

Antes de reverter `20261222000009-institutions`, faça rollback do código que lê e grava `institutionId`. A migração `down` é atômica,
mas remove as escolhas de universidade, as configurações próprias e os vínculos com polos; não execute `down` com a versão nova do código
em funcionamento.

## Próximas etapas

- Configurações próprias por universidade (`InstitutionSettings`), caindo na configuração geral.
- Catálogo, agente de IA, base de conhecimento, modelos da Meta, Efí e e-mail por universidade.
- Polos que servem várias universidades (`PoloInstitutions`).
- Páginas públicas pelo endereço, com a marca da universidade.
- Filtro "Universidade" em Estatísticas, Metas, Campanhas e Custos.
