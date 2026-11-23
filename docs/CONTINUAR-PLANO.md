# Continuar o plano (passagem de trabalho entre sessões do Claude)

Atualizado em 23/11/2026. Este arquivo existe para que outra sessão ou conta do Claude continue de onde a anterior parou, sem depender do histórico do chat.

## 1. Onde está o código

| O quê | Onde |
|---|---|
| Já no `main` e no servidor | Até o #138 (velocidade, universidades, estatísticas numa tela principal) |
| Painéis remodelados (Estatísticas, Meu desempenho, Painel do CRM, Captação) | Branch `claude/lucid-hopper-jiqt51`: kit `frontend/src/components/peak`, posição do consultor na equipe, estados de carregando e erro em Metas e Matrículas, correções de estabilidade. Detalhes em `docs/ANALYTICS.md` |

## 2. O que já foi feito e o que falta

Feito e no `main`: custos da Meta e da IA como a cobrança é de verdade; `/estatisticas` como painel com abas; Captação,
Atendimento e Tutoria como abas do mesmo painel.

Falta, em ordem:
- **Universidades:** as próximas etapas de `docs/UNIVERSIDADES.md` (configurações próprias por universidade, polos que servem
  várias universidades, logo nos e-mails e portais, filtro em Metas, Campanhas e Custos).
- **Fluxos:** os gatilhos `datetime` e `field.changed` (`backend/src/services/FlowServices/Events.ts`), hoje "Em breve".
- **Painéis:** levar o kit `components/peak` para Atendimento (`pages/Reports`), Tutoria e Polos e metas, que ainda usam os
  cartões antigos.
- **Servidor (precisa do aval do usuário):** pool do banco com 4 conexões (`DATABASE_URL_POOL`), limite de processamento
  simultâneo dos webhooks da Meta, migração separada do início da API no deploy, cópia externa obrigatória do backup, versão fixa
  do Chromium na imagem.
- **Do usuário:** trocar a chave de serviço do Supabase que foi exposta; cancelar a VPS antiga.

## 3. Decisões do usuário (21/11)
- **OpenBot (openbot.run):** investigado e não usado.
  - É um aplicativo de computador que roda o Codex/Claude com o login da assinatura.
  - Não tem uma API que devolva a resposta ao servidor.
  - A licença é PolyForm Noncommercial e o WhatsApp dele é não oficial.
  - O processo comercial usa a chave de API da OpenAI (agente com provider `openai`).
- **A IA pode ler as conversas dos consultores** uma vez por dia, sem CPF, telefone e nomes, com teto de gasto.
- **Estatísticas:** um painel novo no lugar, com as telas repetidas virando abas.

## 6. Como trabalhar neste repositório (lições da sessão anterior)

- **Branch e push:**
  - desenvolver na branch `claude/system-agent-analysis-improvements-n0anpw`;
  - o push com `--force` é bloqueado: depois de um merge por squash, usar `git fetch origin <branch> && git merge -s ours FETCH_HEAD` e então dar push;
  - para recomeçar a partir do `main`: guardar o trabalho com `git stash -u`, depois `git checkout -B <branch> origin/main` e `git stash pop`.
- **Merge:** squash, passando `expectedHeadSha` com o SHA completo (`git rev-parse HEAD`).
- **CI:** jobs `verificar`, `telas` (varredura das telas, incluindo celular 390×844), `api-ponta-a-ponta` (canais, responsabilidade, estatísticas) e Vercel.
- **Verificações rápidas:**
  - backend: `node_modules/.bin/tsc --noEmit -p .`, `node scripts/i18n-check.js`, `node scripts/audit-routes.js`;
  - frontend: `node scripts/check-menu-icons.js`.
- **Ícones:** `lucide-react` passa pelo `frontend/src/icons/phosphor-shim.js`, e o ícone precisa existir lá (por exemplo `AlertCircle`; não existe `CircleAlert`).
- **Sequelize:** depois de `Model.update` com `where`, a instância em memória fica velha. Use `instance.set(...)` antes de `instance.update(...)`; foi assim que o Scheduler travou em "enviando".
- **Segurança:**
  - nunca pedir nem colar tokens ou chaves no chat; usar o formulário seguro;
  - workflows imprimem só IDs públicos;
  - a chave de serviço do Supabase que foi exposta deve ser trocada.
