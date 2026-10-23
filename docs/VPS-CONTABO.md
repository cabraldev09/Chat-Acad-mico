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
