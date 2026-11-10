# Auditoria de segurança, infraestrutura e qualidade (outubro de 2026)

Escopo: backend (Express/Sequelize/socket.io), frontend (React), VPS Contabo (Docker + Caddy), Vercel e Supabase. Método: três revisões de código só de leitura
(segurança do backend, infraestrutura/deploy, telas/rotas/falhas), conferência no servidor (portas, firewall, SSH, fail2ban, contêiner, backups) e `npm audit`.
Cada achado abaixo diz o que foi corrigido (✔), o que está só no repositório e entra na próxima subida (◐) e o que depende de decisão ou conta sua (○).

## 1. O que estava escondido e agora está resolvido

| # | Gravidade | Achado | Correção |
|---|-----------|--------|----------|
| C1 | **Crítica** | O nome do anexo recebido pelo WhatsApp/web chat ia direto para `join(PUBLIC_DIR, nome)`: um remetente gravava um `.js` em qualquer pasta (por exemplo `dist/database/migrations`, que roda no próximo start). | ✔ `helpers/SafeFile.ts`: corta a pasta, limita os caracteres, extensão só de lista (nunca html/svg/js), parte única com `randomBytes`, guarda de caminho. Teste de unidade e de ponta a ponta. |
| H1 | Alta | Regex de e-mail com retrocesso quadrático (`^\S+@\S+\.\S+$`): um texto de 40 mil pontos congela o servidor (`/auth/forgot`, formulários públicos, automações). | ✔ `helpers/Email.ts` (tempo linear, limite de 254) em 9 pontos. |
| H2 | Alta | Arquivos enviados abriam dentro da origem da API (`.xhtml`, `.svgz`…): script rouba a sessão de quem abre. | ✔ `/public`: só imagem/áudio/vídeo/PDF abrem no navegador (com `sandbox`); o resto é download; `nosniff`. |
| H3 | Alta | `POST /tickets` aceitava `contactId` e `userId` do corpo sem checar acesso: tomava a conversa de outro setor. | ✔ O dono é quem pede (gestão pode atribuir) e exige acesso ao contato (ou contato ainda sem dono). |
| H4 | Alta/Média | `leads/from-contact` e `POST /leads` (e a API v1) davam acesso a contato alheio e aceitavam `contactId`, `affiliateId`, `consentAt` do corpo. | ✔ Checagem de acesso e lista de campos permitidos. |
| M1 | Média | Falta de checagem de objeto: tarefa de lead por `taskId`, campos personalizados do contato por `id`, respostas rápidas editáveis por qualquer papel. | ✔ Tarefa só pelo lead da rota; campo só do próprio contato; resposta rápida tem dono (migração `QuickAnswers.userId`) e só o dono ou a gestão altera. |
| M4/M5 | Média | Tempo de resposta do login revelava quais e-mails existem (também no portal do aluno); bcrypt custo 8; senha mínima 5. | ✔ Hash falso do mesmo custo, bcrypt 12 com recálculo no próximo login, mínimo 8 caracteres ao criar/trocar. |
| M6 | Média | O nó "webhook" do chatbot usava `axios` puro (segue redirecionamento, resolve o DNS de novo). | ✔ `safeRequest`. |
| M7 | Média | Uploads sem limite (mensagens, API) e web chat anônimo aceitava qualquer tipo. | ✔ Limites de tamanho/quantidade e lista de tipos para visitantes. |
| M9 | Média/Baixa | Exportações CSV (comissões, afiliados, relatório) sem proteção contra fórmula (`=HYPERLINK(...)` vindo de um nome digitado por estranho). | ✔ Todas usam `helpers/Csv.ts`. |
| L1 | Baixa | `/health` entregava commit e estado do pool; log de erro 500 gravava SQL e parâmetros (nome, telefone, CPF); sem HSTS na API. | ✔ `/health` mínimo (`ok` e versão), log sem parâmetros, HSTS e `Permissions-Policy`. Webhook da Efí compara o segredo em tempo constante. |
| — | **Alta (operação)** | **O backup do banco falhava desde 15/10**: o `pg_dump` da imagem era o 16 e o Supabase está no 17 (`server version mismatch`); como o script parava no primeiro erro, também não gerava mais o arquivo de dados. | ◐ `backup.sh` novo: `pg_dump` 17, banco e arquivos independentes, falha ruidosa (código de saída e ping opcional), criptografia e cópia externa opcionais, retenção de 14 dias, sem `--env-file` na imagem do dump. |
| — | Alta | SSH da VPS com **senha ligada e login de root** (2.857 tentativas inválidas em 24 h; o fail2ban já bloqueou 387). | ○ Plano na seção 3 (chave apenas). |
| — | Média | Deploy automático a cada 5 minutos direto da `main`, sem volta. | ◐ `update.sh` novo: backup antes de migração, imagem anterior guardada, espera a API ficar saudável e **volta sozinho**; commit que falhou não é repetido a cada 5 minutos. |
| — | Média | Contêiner rodava como root, sem limite de memória, parada em 10 s (o WhatsApp não fechava direito). | ◐ Usuário `node` (entrypoint com `gosu`), `cap_drop: ALL`, `no-new-privileges`, `mem_limit 8g`, `pids_limit`, `stop_grace_period 60s` e fechamento das sessões do WhatsApp no desligamento. |
| — | Média | Front sem cabeçalhos (CSP, X-Frame-Options…), 17 MB de mapas de código públicos; Caddy sem limite de corpo. | ◐ `vercel.json` com cabeçalhos e CSP em modo **somente relatório** (não quebra nada; vira regra depois de limpo no console); mapas desligados; Caddyfile com limite de 100 MB, HSTS e sem `Server`. |

## 2. O que ainda está aberto (por prioridade)

1. ○ **Segredos em claro no banco** (token e segredo das conexões, tokens de API, segredos de webhook, Efí): selar com chave própria `DATA_KEY` (hoje só chaves de IA e e-mail são seladas, derivadas do `JWT_SECRET`).
2. ○ **Mídia pública sem login** (`/public`): nomes agora imprevisíveis; falta URL assinada para documentos de aluno.
3. ○ **Rotação do refresh token** com detecção de reuso e limite de tentativas por conta (hoje por IP+e-mail).
4. ○ **Coordenação = administração** (decisão da empresa): separar os segredos (tokens de API, webhooks, chaves de IA, Efí, e-mail) só para administrador, ou aceitar e registrar.
5. ○ **Trilha de auditoria** (quem exportou, viu CPF, mudou configuração, criou token, excluiu lead) e política de retenção/anonimização (LGPD).
6. ○ Dependências: `nodemailer` 6 → 10 (2 avisos altos no `npm audit`), `whatsapp-web.js` por `https` em vez de `git+ssh`, Dependabot e `npm audit` no CI.
7. ○ Observabilidade: definir `SENTRY_DSN`, monitor externo em `/health`, alerta de disco/memória/certificado (precisa de contas suas).
8. ○ Domínio próprio no lugar de `sslip.io` (limite compartilhado do Let's Encrypt); cópia externa do backup (Backblaze B2 / Cloudflare R2: precisa de conta).

## 3. Passos de infraestrutura que mexem na VPS

* **SSH só por chave**: criar usuário com sudo e chave, provar o login numa segunda sessão e só então `PasswordAuthentication no` + `PermitRootLogin prohibit-password` + `X11Forwarding no` + `MaxAuthTries 3`.
* **Contêiner endurecido**: a primeira subida usa o `update.sh` antigo (sem volta automática); por isso a imagem nova é testada antes numa execução avulsa, e o volume é entregue ao usuário `node` uma única vez.
* **Backup**: depois da subida rodar `./deploy/vps/backup.sh` à mão, conferir `banco-*.dump` em `/opt/backups` e restaurar uma cópia num banco de teste (`pg_restore`).

## 4. Falhas escondidas (código) ainda a corrigir

Mensagem perdida por corrida ao criar contato novo; tickets duplicados (falta índice único parcial); campanha duplicada no duplo clique e destinatários repetidos; agendador que reenvia após queda; `AckReconciler` forçando "enviado"; erros engolidos que perdem bônus de afiliado e mídia; fusos horários fixos (comissões, dashboard, ambientação, semestre de ingresso, afiliados); busca de leads sem `iLike`; limites silenciosos (comissões 5.000, ambientação 300); índices `pg_trgm` para busca de mensagens; papel `academico` bloqueado no front; sem página 404; workers sem guarda de sobreposição.

## 5. Sugestões por departamento

* **Comercial**: mover etapa por menu (feito no funil), idempotência na matrícula e no pagamento, metas no fuso da empresa, comissões paginadas no SQL.
* **Atendimento**: fila de processamento por conversa, conflito ao aceitar o mesmo ticket, busca de mensagens com índice, filtros modernos (feito).
* **Tutoria/Secretaria**: ambientação sem o teto de 300, atribuir+enviar+iniciar como uma operação só, retenção com trava de duplo envio.
* **Análises**: barra de progresso no envio (feito), paginação das listas, leitura por IA também na análise acadêmica quando o PDF vem sem texto.
* **Agentes de IA**: botão de despublicar, parada de emergência por agente, selo de erros das últimas 24 h, agente comercial que também encaminha tutoria/secretaria (feito).
* **Campanhas/Agendamentos**: trava no "Iniciar", índice único por destinatário, agendamento mostrando o fuso.
* **Afiliados/Polos/Estatísticas/Configurações/Conexões**: data final de campanha sem deslocamento de um dia, atualização manual nos painéis que se atualizam sozinhos, todas as telas ligadas no `SettingsHub`, aviso quando uma conexão não grava o desligamento.

## 6. Como conferir

`cd backend && npm run build && npx vitest run && node scripts/channels-e2e.js` (cenários novos: nome de anexo malicioso, `/public` inline, e-mail hostil, conversa de outro dono, respostas rápidas, tarefas de outro lead, exclusão de lead). No servidor: `sshd -T`, `docker ps` (healthy), `docker inspect` (usuário e limites), `curl /health`, `ls -la /opt/backups`.
