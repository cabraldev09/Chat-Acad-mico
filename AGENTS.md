# Como trabalhar neste repositório (equipe de agentes)

Este arquivo vale para todo agente que abrir o projeto. Leia até o fim antes da primeira mudança.

## O produto

**Chat Acadêmico / Cruzeiro do Sul Virtual**: atendimento multicanal (WhatsApp oficial da Meta, WhatsApp por QR Code,
Telegram, Instagram, chat web) com CRM de matrículas, agentes de IA que conversam com leads, tutoria dos alunos,
análises curriculares e estatísticas.

Perfis de usuário: `admin`, `coordenacao`, `consultor`, `tutor`, `academico`, `relacionamento`
(`backend/src/helpers/Roles.ts`). Toda tela e toda rota nova precisa decidir quem pode ver e usar.

## Mapa do código

| Pasta | O que é |
|---|---|
| `frontend/` | React 16, Material UI v4, Vite. Telas em `src/pages`, componentes em `src/components`, textos de erro em `src/translate/languages/pt.js`. |
| `backend/` | Node, Express, Sequelize, Postgres, TypeScript. Rotas em `src/routes`, controllers finos em `src/controllers`, regras em `src/services`, tarefas em `src/workers`, migrações em `src/database/migrations`. |
| `deploy/vps/` | Instalação e atualização do servidor (Docker, Caddy, backups). |
| `.github/workflows/` | CI e workflows manuais (deploy, diagnóstico da VPS, modelos da Meta). |
| `docs/` | Como cada parte funciona. Leia o que for do seu assunto. |

Documentos por assunto: `COPILOTO.md` (copiloto do consultor), `AGENTE-COMERCIAL.md` e `IA-E-CONVERSAS.md` (agentes de IA e
conversas), `WHATSAPP-NUMEROS.md` (números e canais), `ANALYTICS.md` (estatísticas), `ROTAS.md` (rotas e permissões),
`BANCO-DE-DADOS.md`, `UNIVERSIDADES.md` (as universidades do grupo), `PROPOSTA.md` (proposta de bolsa e calendário de entradas), `FICHA-DE-MATRICULA.md` (ficha que o lead preenche pelo link),
`VERIFICACOES.md` (tudo que roda antes de publicar), `API-V1.md` (API das integrações: tokens, escopos e polos).

## Como verificar uma mudança

A lista completa, com a pasta de cada comando, está em **`docs/VERIFICACOES.md`**. O mínimo antes de abrir um PR:

- Backend (pasta `backend`): `npx tsc --noEmit`, `npx vitest run`, `node scripts/i18n-check.js`, `node scripts/audit-routes.js`.
  Mexeu em segurança ou em IA: `npm run test:security` e `npm run test:ai`.
- Frontend (pasta `frontend`): `npx vite build`, `node scripts/check-menu-icons.js`, `node scripts/check-lazy-events.js`,
  `node scripts/check-native-dialogs.js`.
  Instale com `npm install --legacy-peer-deps`.
- Ponta a ponta (a API inteira com WhatsApp e Efí simulados): suba o Postgres, rode `npm run build` e então
  `PGUSER=postgres PGHOST=localhost LOGIN_RATE_MAX=100 NODE_ENV=test node scripts/channels-e2e.js` (pasta `backend`).
  Leva cerca de 15 minutos. Rode quando a mudança tocar conversas, campanhas, IA, CRM ou Meta.
- Telas: `node scripts/smoke-pages.js` (pasta `frontend`) abre todas as telas, inclusive no celular (390×844). Precisa da API em 8080 e do `vite preview` em 3000 no ar (veja `docs/VERIFICACOES.md`).

Para um erro: reproduza antes de corrigir e mostre o mesmo teste passando depois.

## Padrões do código

- **Banco:** toda mudança de tabela ou coluna tem migração. Depois de criar uma, rode `node scripts/build-schema.js`.
- **Sequelize:** depois de `Model.update` com `where`, a instância em memória fica velha. Use `instance.set(...)` e depois
  `instance.update(...)`.
- **Textos:** tudo que o usuário lê é em português, claro e curto, sem emojis. Códigos de erro novos precisam de tradução
  em `pt.js` (o `i18n-check` confere).
- **Mensagens da IA para leads:** sem emojis, uma pergunta por vez, nunca inventar valor, bolsa ou prazo.
- **Ícones do menu:** passam por `frontend/src/icons/phosphor-shim.js` (o ícone precisa existir lá) e não podem se repetir
  no menu lateral.
- **React 16:** não leia `e.target.value` depois de um `await`, `setTimeout` ou dentro de `setX(x => ...)`
  (`check-lazy-events` pega isso).
- **Telas:** conferir no desktop e no celular. Nada pode passar da largura da tela. Campo e botão lado a lado têm a mesma altura.
  Sempre tratar carregando, vazio e erro.
- **Rotas novas:** com permissão explícita por perfil (`audit-routes` falha se faltar).
- **Não duplicar:** o que já existe no menu lateral não ganha um segundo caminho em Configurações.

## Como entregar

1. Uma branch por assunto, a partir do `main` atualizado. PR pequeno, com o que mudou e o que foi testado.
2. **Nunca** `git push --force`. Se a branch remota já recebeu um squash, faça `git fetch origin <branch>` e
   `git merge -s ours FETCH_HEAD` antes do push.
3. O CI precisa ficar verde: `verificar`, `telas` e os três `api-ponta-a-ponta`. Nunca pule, desligue ou apague um teste para
   passar. Um teste que falha de vez em quando tem uma causa: ache-a.
4. Mescle por **squash**, passando o `expectedHeadSha` completo (`git rev-parse HEAD`).
5. Depois do merge, o workflow "Atualizar a VPS" roda sozinho. Se o commit do `main` é o squash de um PR verde com exatamente
   o mesmo código (branch em dia com o `main`), ele publica logo após o merge; senão, quando as Verificações do `main` passam
   (`deploy/vps/check-ci.js`). Confira que terminou com sucesso e avise o usuário.
6. Nunca abra PR sem o usuário ter pedido.

## Segurança e privacidade

- **Nunca** peça nem escreva senhas, tokens ou chaves no chat, no código, em logs ou em commits. Use o formulário seguro da
  ferramenta ou as configurações do sistema.
- Dados de alunos e leads (nome, CPF, telefone) só no que a tarefa exige. Nada disso vai para serviços externos, issues ou logs.
- Workflows imprimem apenas identificadores públicos.
- Antes de qualquer ação que mexe em contas reais (enviar modelos para a Meta, mandar mensagem a leads, mexer no servidor,
  apagar dados), diga o que vai acontecer e espere o aval do usuário.

## Como se comunicar

- Fale em português, em linguagem simples, sem jargão desnecessário.
- Ao terminar, diga: o que mudou, o que foi testado (e com que resultado), e o que o usuário ainda precisa fazer.
- Se algo falhou ou foi pulado, diga isso com clareza. Não afirme que funciona sem ter verificado.
- Na dúvida entre duas opções, recomende uma e explique o motivo em uma frase.

## Skills

Em `.claude/skills/` (origem e licenças em `.claude/skills/ORIGEM.md`). Em conflito, vale este arquivo: as skills
falam em "merge" e "PR" de forma genérica, mas aqui o PR só abre a pedido do usuário e o merge segue "Como entregar".

| Skill | Use quando |
|---|---|
| `systematic-debugging` | Houver erro, teste falhando ou comportamento estranho: ache a causa antes de corrigir. |
| `test-driven-development` | For implementar função ou corrigir erro: escreva o teste que falha primeiro. |
| `verification-before-completion` | For dizer que está pronto, corrigido ou passando: rode os comandos e confira a saída antes. |
| `requesting-code-review` | Terminar uma tarefa ou funcionalidade, antes de entregar: peça revisão do que mudou. |
| `receiving-code-review` | Receber comentários de revisão: verifique cada um e responda com fundamento, sem concordar às cegas. |
| `webapp-testing` | Precisar abrir a tela no navegador (Playwright) para testar, ver erros do console ou tirar captura. |
| `frontend-design` | Criar ou refazer uma tela: escolha visual com intenção, respeitando as regras de "Telas" acima. |
| `web-design-guidelines` | Revisar interface quanto a boas práticas e acessibilidade. |
| `karpathy-guidelines` | Qualquer código: mudança pequena, simples e só no que foi pedido. |

## Papéis da equipe

| Agente | Cuida de |
|---|---|
| Coordenador | Recebe o pedido, quebra em tarefas pequenas, distribui, confere o resultado e resume ao usuário. |
| Backend | `backend/`: rotas, serviços, migrações, workers. |
| Frontend | `frontend/`: telas, componentes, celular, acessibilidade e textos. |
| Testes | Testes unitários, ponta a ponta e varredura de telas; encontra a causa de testes instáveis. |
| Revisor | Revisa cada mudança: segurança, permissões, bugs, desempenho. Aponta o caso real e a correção mínima. |
| Meta e WhatsApp | API oficial da Meta (modelos, webhook, janela de 24 h, custos) e números por QR Code. |
| Segurança e Estabilidade | Segurança (permissões por perfil, vazamento de dados, segredos, rotas sem proteção) e prevenção de queda (tarefas em segundo plano, banco, fila de mensagens, limites, backup, deploy, alertas). Aponta o caso real e a correção mínima; não altera servidor nem contas reais. |
