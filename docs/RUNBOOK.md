# Runbook: o que fazer quando algo falha

## Deploy e volta
- O `deploy/vps/update.sh` roda a cada 5 minutos: faz backup antes de migração, guarda a imagem anterior, espera a API ficar saudável e **volta sozinho** se não subir. Um commit que falhou não é repetido.
- Conferir: `curl https://API/health` devolve `{"ok":true,"leader":true,"version":"abc1234"}`. **`leader: false`** em todas as instâncias significa que os workers (lembretes, SLA, campanhas, retomada do agente) estão parados: veja o log por `Leader lock` e se `DATABASE_URL` usa a conexão direta (5432), nunca o pooler de transação (6543).

## Banco e backup
- `./deploy/vps/backup.sh` gera `banco-*.dump` e os arquivos em `/opt/backups` (14 dias). Restaurar numa cópia: `pg_restore --no-owner -d banco_teste banco-AAAAMMDD.dump`. Teste a restauração de tempos em tempos.
- As grades em PDF ficam em `$PUBLIC_DIR/grades`. Se o volume for recriado, na subida o sistema recoloca os PDFs que acompanham o código (`restoreMissingGradeFiles`); os que só existem no banco aparecem na Central como "grades sem PDF".

## "O agente não fez X"
Abra **Agentes de IA → Abrir central → Início**. Os avisos dizem o que está errado:
| Aviso | O que significa | O que fazer |
|---|---|---|
| Grades dos cursos | Curso sem grade, ou grade sem o PDF no servidor | Enviar a matriz em Grades (ou rodar `scripts/import-grades-from-analysis.js`). Enquanto falta, o agente avisa o lead e cria a tarefa "Enviar a grade de X" |
| Roteiro atualizado | O agente foi criado antes de melhorias do modelo | **Atualizar agente** e depois publicar o roteiro |
| Leads entregues sem resposta | Consultor ainda não respondeu | O SLA avisa duas vezes e passa ao próximo da fila; veja Conversas |
| Limite diário de IA | Acabaram os tokens do dia (as conversas novas vão para a equipe) | Subir o limite em Ajustes |
| Chave de IA / Falhas | Sem chave, 401, 429 | Conferir a chave e o saldo do provedor |

Para uma conversa específica: o log do servidor tem uma linha `Automação do ticket N: …` dizendo por que o robô não entrou (conversa já com atendente, fora do agente, nenhum agente serve a fila/conexão) e, no teste da Central, o simulador mostra o que a IA fez em cada turno.

## Consultas de leitura úteis (somente leitura)
- Motivos de repasse: `SELECT event, count(*) FROM "AgentMetricEvents" WHERE event LIKE 'handoff\_%' GROUP BY 1 ORDER BY 2 DESC;`
- Falhas de grade: `SELECT count(*) FROM "AgentMetricEvents" WHERE event = 'grade_failed';` e enviadas: `event = 'grade_sent'`.
- O desenho que o agente usa: `SELECT id, status, version FROM "ChatFlows" WHERE kind = 'agent';`
- Gasto do dia: soma de `inputTokens + outputTokens` em `AiUsages` com `createdAt` de hoje.

## Importar as grades do sistema de análise curricular
O sistema "Sistema de previsão de análise curricular" guarda as matrizes em um bucket privado do Supabase dele. Com a chave de serviço **dele** (nunca no repositório): `ANALYSIS_SUPABASE_URL=… ANALYSIS_SUPABASE_SERVICE_KEY=… node backend/scripts/import-grades-from-analysis.js --dry-run` mostra o que mudaria; sem `--dry-run` grava os PDFs em `backend/data/grades`. Faça o commit e suba: na inicialização as grades novas ou atualizadas são publicadas (uma versão nova de um curso atualiza a matriz que já existe, a menos que a equipe tenha colocado uma vigência mais nova).
