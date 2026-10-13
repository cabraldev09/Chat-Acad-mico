# Railway — passo a passo (API) e erros comuns

A API (Express + WhatsApp + rotinas) roda no Railway; o banco fica no Supabase e as telas na Vercel.
O repositório já traz o `Dockerfile` e o `railway.toml` na raiz: o Railway só precisa **enxergar** o repositório.

## 1. Conectar o repositório (a causa mais comum de "não sobe")
Se o serviço foi criado colando a **URL** do repositório (*Deploy Repo*), o Railway fez **um** deploy e nunca mais recebeu
os pushes. Sinal: a aba **Deployments** mostra um único deploy, de um commit antigo.

1. Abra o serviço → **Settings → Source → Connect Repo**.
2. Autorize o *GitHub app* do Railway para `cabraldev09/Chat-Acad-mico` (se o botão pedir, escolha o repositório).
3. Branch: `main`. A partir daí cada `git push` cria um deploy novo.
4. Clique em **Redeploy** no commit mais recente para não esperar o próximo push.

Alternativa sem o app do GitHub: crie um *Project Token* (**Settings → Tokens**), cadastre-o no GitHub como segredo
`RAILWAY_TOKEN` (e o nome do serviço em `RAILWAY_SERVICE`) e use o workflow `.github/workflows/deploy-railway.yml`
(botão *Run workflow* ou a cada push em `main`).

## 2. Build
**Settings → Build** deve mostrar **Dockerfile**. Se aparecer *Railpack/Nixpacks*, escolha Dockerfile (o `railway.toml` já pede).
O primeiro build leva alguns minutos (instala o Chromium).

## 3. Volume
**Settings → Volumes → New Volume**, ponto de montagem `/data`. Sem o volume a sessão do WhatsApp e os arquivos se perdem
a cada deploy (e o número pede QR Code de novo).

## 4. Variáveis
| Variável | Valor |
|---|---|
| `DB_DIALECT` | `postgres` |
| `DATABASE_URL` | string do **Session pooler** do Supabase (*Connect → Session pooler*, porta 5432). A conexão direta (`db.xxx.supabase.co`) é só IPv6 e o Railway não a alcança |
| `DB_SSL` | `true` |
| `JWT_SECRET` | `${{ secret(64) }}` (o Railway gera) |
| `JWT_REFRESH_SECRET` | `${{ secret(64) }}` |
| `BACKEND_URL` / `PUBLIC_URL` | URL pública do serviço (*Settings → Networking → Generate Domain*, ou seu domínio da API) |
| `FRONTEND_URL` | URL da Vercel / domínio do app |
| `TRUST_PROXY` | `1` |
| `APP_TIMEZONE` | `America/Porto_Velho` |
| `UPLOAD_DIR` | `/data/public` |
| `WWEBJS_AUTH_PATH` | `/data/wwebjs` |
| `ZAPO_AUTH_PATH` | `/data/zapo/state.sqlite` |
| `NODE_ENV` | `production` |

`PORT` o Railway define sozinho. Mantenha **1 réplica**.

## 5. Primeiro acesso
Depois do deploy ficar verde (`/health` responde `{"ok":true}`), no terminal do serviço:
`npx sequelize db:seed:all` — cria o administrador (`admin@whaticket.com` / `admin`). **Troque a senha na hora.**

## Erros comuns
| Sintoma | Causa e solução |
|---|---|
| "Railpack failed to prepare the build" | o deploy é de um commit antigo ou o build não usa o Dockerfile → itens 1 e 2 |
| `ENETUNREACH` / `ECONNREFUSED` ao banco | URL do Supabase direta (IPv6) → use o Session pooler |
| `no pg_hba.conf entry … no encryption` | falta `DB_SSL=true` |
| API sobe, mas "Another instance owns the WhatsApp sessions" | havia outra cópia no ar (deploy sobrepondo); a nova assume sozinha em até 15 s |
| QR Code pede de novo a cada deploy | volume `/data` ausente ou variáveis de caminho não definidas |
| Login funciona e a tela volta para o login | `FRONTEND_URL`/`BACKEND_URL` errados ou sem `https://` (cookie de sessão) |
