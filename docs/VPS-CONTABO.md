# Instalação no VPS da Contabo

Servidor: **Cloud VPS 6** · IP **209.145.48.49** · Ubuntu · usuário `root`.
O banco continua no **Supabase** e as telas na **Vercel**. O VPS roda só a API e o WhatsApp.

## 1. Apontar o endereço da API para o servidor (2 minutos)

No Railway (onde o domínio `cruzeirodosulvirtual.xyz` foi comprado) → **Domains/DNS → Adicionar registro**:

| Tipo | Nome | Valor |
|---|---|---|
| A | `api` | `209.145.48.49` |

Sem esse registro a instalação ainda funciona, com um endereço provisório `209-145-48-49.sslip.io`.

## 2. Instalar

No Terminal do Mac:

```bash
ssh root@209.145.48.49
```

Digite a senha que você escolheu na Contabo (ela não aparece enquanto você digita). Depois cole:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/cabraldev09/Chat-Acad-mico/main/deploy/vps/install.sh)
```

O script instala Docker, firewall e 4 GB de memória extra, baixa o código, faz 6 perguntas e sobe tudo:

| Pergunta | O que responder |
|---|---|
| Endereço da API | Enter (usa `api.cruzeirodosulvirtual.xyz` se o DNS já estiver pronto) |
| Endereço do site | o endereço do seu projeto na Vercel |
| DATABASE_URL | Supabase → **Connect → Session pooler** (porta **5432**, não 6543) |
| E-mail e senha do administrador | os que você vai usar para entrar |

**Velocidade com muitos usuários:** em `/opt/chat-academico/deploy/vps/.env` acrescente `DATABASE_URL_POOL` com o endereço do **Transaction pooler** (porta **6543**) e rode `./update.sh --force`. A API passa a atender as requisições por ele (pool de 12 conexões); o lock do WhatsApp e as migrações seguem na `DATABASE_URL` (porta 5432). `curl https://SEU-ENDERECO/health` mostra o pool (`using`, `waiting`): `waiting` acima de zero por muito tempo indica pool pequeno.

A senha do banco e a do administrador são digitadas por você no servidor e ficam só no arquivo `/opt/chat-academico/deploy/vps/.env`.

Ao terminar, aparece **PRONTO** e `{"ok":true,...}`.

## 3. Ligar a Vercel ao novo endereço

Vercel → projeto → **Settings → Environment Variables**:
`VITE_BACKEND_URL` = `https://api.cruzeirodosulvirtual.xyz/` (com a barra no final) → **Redeploy**.

## 4. Conectar o WhatsApp

Entre no sistema → **Conexões → Conectar meu WhatsApp**. Se o WhatsApp avisar "Não é possível conectar novos dispositivos", espere algumas horas antes de tentar de novo.

## O que fica automático

- **Atualização**: a cada 5 minutos o servidor confere o GitHub e, se houver versão nova, reconstrói e reinicia sozinho (`/var/log/chat-academico-update.log`).
- **Backup**: todo dia às 3h salva as sessões do WhatsApp e os arquivos em `/opt/backups` (guarda os mais recentes) e, **a cada hora**, uma cópia do banco de dados (onde ficam todas as mensagens).
- **HTTPS**: certificado gratuito, renovado sozinho.
- **Reinício**: se o servidor reiniciar, tudo volta sozinho.

## Comandos úteis (dentro do servidor)

```bash
cd /opt/chat-academico/deploy/vps
docker compose logs --tail 80 api        # ver o que a API está fazendo
docker compose ps                        # estado dos serviços
./update.sh --force                      # atualizar agora
./backup.sh                              # backup agora
docker stats --no-stream                 # memória em uso
```

## Limites

- Cada número com QR Code usa cerca de **500 MB**. Com 12 GB cabem ~10 números (`WHATSAPP_MAX_QR=10`).
- Mantenha **uma única API** conectada ao mesmo banco: duas cópias disputam as sessões. Desligue o serviço no Railway depois de migrar.
- A conexão do banco precisa ser **Session pooler (5432)**.

## Restaurar um backup

```bash
cd /opt/chat-academico/deploy/vps && docker compose stop api
docker run --rm -v chat-academico-data:/data -v /opt/backups:/backup alpine \
  sh -c "cd /data && tar xzf /backup/dados-AAAA-MM-DD.tar.gz"
docker compose start api
```

## Backup externo S3 e restauração verificada

A cópia externa usa Restic com criptografia, compatível com S3 e serviços que oferecem a mesma API. No servidor, copie `deploy/vps/.backup.env.example` para `deploy/vps/.backup.env`, aplique `chmod 600` e informe endpoint/bucket, chave, segredo e uma senha exclusiva do repositório. Esse arquivo é ignorado pelo Git e não deve ser enviado pelo chat. Guarde a senha do Restic fora da VPS: sem ela, a restauração é impossível.

Execute uma vez `bash offsite.sh init`. Depois, `backup.sh` identifica a versão do PostgreSQL e gera um dump do schema `public` usado pela aplicação (não inclui os serviços internos de Auth/Storage do Supabase). Um arquivo `.major` acompanha o dump para escolher a mesma versão na restauração. O script envia os dumps e mídias locais para o repositório externo e verifica sua integridade. A configuração da aplicação também é incluída na cópia criptografada; as credenciais do próprio backup devem ficar em um gerenciador de senhas separado. Se `.backup.env` não existir, o backup local continua e o log informa a ausência da cópia externa. Se o envio externo falhar, o script termina com erro. Histórico externo é mantido; acompanhe o espaço utilizado no bucket e defina retenção conforme a política da instituição.

Comandos em `/opt/chat-academico/deploy/vps`:

```bash
bash offsite.sh snapshots
bash offsite.sh check
bash offsite.sh restore latest
bash verify-backup.sh --offsite
```

A restauração externa fica em `/opt/backups/restored-offsite`, sem sobrescrever o sistema em execução. A verificação restaura o dump em um PostgreSQL descartável, sem rede, consulta leads e mensagens e valida a integridade do arquivo de mídias. Não troca o banco de produção. O instalador agenda essa verificação semanalmente às 5h de domingo; instalações existentes precisam atualizar a entrada de cron, além de publicar os scripts. Confira os logs em `/var/log/chat-academico-backup.log` e `/var/log/chat-academico-restore-check.log`.

O atualizador também precisa consultar os checks do GitHub antes de publicar. Para repositório privado, configure `GH_TOKEN` no ambiente da API com permissão de leitura dos checks. Sem checks aprovados ou quando a consulta falhar, a atualização é adiada.
## Atualização automática pelo GitHub (repositório privado)

Com o repositório privado, a VPS não consegue buscar o código sozinha. O arquivo `.github/workflows/deploy-vps.yml` resolve sem guardar senha na VPS:
a cada mudança em `backend/`, `deploy/` ou no Dockerfile que entra na `main`, o GitHub entra por SSH e roda `update.sh --force`, usando um token que ele mesmo cria e que expira ao fim da execução.

Configurar uma vez (no Mac):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_chat_academico -N "" -C "github-deploy"      # chave só para isso
ssh -i ~/.ssh/contabo_chat_academico root@209.145.48.49 "cat >> ~/.ssh/authorized_keys" < ~/.ssh/deploy_chat_academico.pub
cat ~/.ssh/deploy_chat_academico | pbcopy                    # cola em: GitHub > Settings > Secrets and variables > Actions > VPS_SSH_KEY
# a identidade pública do servidor já está em deploy/vps/known_hosts (o workflow confere com a que o servidor mostra)
```

Depois, em **Actions > Atualizar a VPS > Run workflow** dá para atualizar quando quiser.


## E-mail (Resend)
- Configurações → E-mail → **Como enviar = Resend**: chave do Resend com **Full access** (a Sending access só envia: o encaminhamento dos e-mails recebidos precisa ler a mensagem no Resend, e isso exige Full access), remetente `nao-responda@mail.cruzeirodosulvirtual.app.br`, "Respostas vão para" (opcional). O SMTP continua disponível no mesmo seletor.
- Todo e-mail do sistema passa por `backend/src/services/MailServices/SendMail.ts` (SDK oficial `resend`): chave de idempotência por envio (recuperação de senha e convites do portal usam uma por pedido), nova tentativa em 429/5xx.
- **E-mails recebidos**: o domínio recebe no Resend, o webhook `email.received` chama `POST https://<API>/webhooks/resend` (assinatura conferida com o segredo `whsec_…` salvo na mesma tela) e o sistema encaminha a mensagem, com o `.eml` original anexado e "responder para" o remetente, ao endereço de "Encaminhar para".
- A chave e o segredo ficam cifrados no banco (`mail_resend_key`, `mail_inbound_secret`).
