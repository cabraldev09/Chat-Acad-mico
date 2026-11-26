# Servidor da API na Hostinger (no lugar da Contabo)

O site continua na Vercel e o banco no Supabase. A VPS só roda a API: webhooks da Meta e do Resend, tempo real e rotinas.
Trocar de servidor não apaga conversas nem leads, porque eles ficam no banco. Ficam para trás os arquivos enviados nas
conversas (fotos e documentos guardados na VPS antiga) e as sessões de WhatsApp por QR.

## 1. Comprar
- Na Hostinger, escolha VPS **KVM 1** ou **KVM 2**. Prefira o período de 12 ou 24 meses: no plano mensal a renovação dobra de preço.
- **Localização: Brasil (São Paulo).**
- **Sistema: Ubuntu 24.04**, sem painel.
- **Backups automáticos:** desnecessários, porque o banco fica no Supabase.
- Anote o **IP** e a **senha de root**.

## 2. Antes de instalar
1. **Supabase:** abra o projeto do banco do Chat. Se estiver *Paused*, clique em **Restore**. Depois copie **Connect → Session pooler** (a `DATABASE_URL`).
2. **GitHub:** crie um token **fine-grained**, só deste repositório, com **Contents: Read**, em Settings → Developer settings → Personal access tokens. Ele serve só para o primeiro clone e não fica no servidor.
3. **GitHub Actions:** rode **"Mostrar a chave pública de deploy"** e copie a linha `ssh-ed25519 …` (a `DEPLOY_PUBKEY`).

## 3. Instalar
No terminal do navegador da Hostinger (ou `ssh root@IP`):

```bash
curl -fsSL -H "Authorization: Bearer SEU_TOKEN" \
  https://raw.githubusercontent.com/cabraldev09/Chat-Acad-mico/main/deploy/vps/install.sh -o install.sh
GH_TOKEN=SEU_TOKEN DEPLOY_PUBKEY="ssh-ed25519 AAAA... deploy-chat-academico" bash install.sh
```

O instalador pede:
- **Endereço da API:** aceite o sugerido, `IP-com-traços.sslip.io`.
- **Endereço do site.**
- **`DATABASE_URL`.**
- **E-mail e senha do administrador.**

No fim ele mostra a linha para `deploy/vps/known_hosts`.

## 4. Ligar o resto
1. **`deploy/vps/known_hosts`:** troque a linha pela nova. É o único lugar com o endereço do servidor; os workflows leem dali.
2. **Vercel:** em `VITE_BACKEND_URL`, coloque `https://NOVO-ENDERECO/` (com a barra) e faça **Redeploy**.
3. **Meta** (developers.facebook.com → WhatsApp → Configuração): na URL de retorno, use `https://NOVO-ENDERECO/webhooks/meta/<id da conexão>`.
4. **Resend → Webhooks:** o endpoint passa a ser `https://NOVO-ENDERECO/webhooks/resend`.
5. **No Chat, digite de novo as chaves salvas.** Elas são cifradas com o `JWT_SECRET` do servidor, então as do servidor antigo não abrem:
   - token, App Secret e Verify Token da conexão API Oficial;
   - chave e segredo do webhook do Resend;
   - chaves de IA;
   - senha de e-mail.
6. **Contabo:** cancele a VPS antiga e o saldo em aberto.

## Trava de publicação (rótulo `publicar`)

O workflow "Atualizar a VPS" só publica o commit da `main` que veio de um PR **mesclado com o rótulo `publicar`** (`deploy/vps/check-label.js`; `check-ci.js` repete a conferência).

- **Quem aplica:** só a coordenação (Maestro), depois da auditoria e da aprovação do dono. Nenhuma outra frente aplica o rótulo.
- **Publicar leva a `main` inteira, então a trava confere todos os commits:** desde a última versão publicada até a ponta da `main`, **cada
  commit** precisa vir de um PR mesclado com o rótulo. Se um PR anterior ficou sem rótulo, a publicação do seguinte também espera, e o aviso
  lista os commits sem autorização (PR e motivo). A versão publicada é a que está no ar (`GIT_SHA` do servidor; no GitHub, a última execução de
  "Atualizar a VPS" cuja etapa "Atualiza a VPS" terminou com sucesso). Mais de 100 commits desde a última publicação, ou uma versão publicada
  que não está na história da `main`, falham fechado: publique por partes e confira antes.
- **O rótulo vale só se foi aplicado depois do último commit do PR:** empurrar um commit novo no PR depois do rótulo (inclusive "atualizar
  com o main") deixa o rótulo desatualizado; a coordenação aplica de novo (remove e põe) depois da última conferência. A comparação usa
  **só o relógio do GitHub**: o último evento `labeled` (lidos todos os eventos do PR, página por página) contra o início da primeira
  verificação (check run) do último commit do PR; a data escrita dentro do commit não conta, porque quem commita a controla. PR sem
  verificações não tem horário e o rótulo não vale.
- **Parada cedo e cota da API:** a conferência para no primeiro commit sem autorização (o aviso cita esse e diz que outros podem faltar);
  o cron do servidor repete a cada 5 minutos, então isso evita centenas de consultas por hora.
- **Servidor (`update.sh`):** a versão no ar vem do `GIT_SHA` do contêiner da API. Se a API estiver doente e a conferência rodar num contêiner
  novo (`docker run`), o `update.sh` passa a versão do checkout como `PUBLISHED_SHA` (o checkout volta à versão no ar quando uma atualização
  falha). Mesmo assim, o `GH_TOKEN` usado no servidor precisa de leitura de **Pull requests**, **Contents/Checks** e, para achar a última
  publicação pelo histórico do GitHub (quando não há `GIT_SHA` nem `PUBLISHED_SHA`), **Actions: read**; sem isso a conferência falha fechada e
  a atualização não acontece. Não verifiquei o token do servidor.
- **Mesclar sem o rótulo:** o código fica na `main`, o workflow termina em sucesso com o aviso "Publicação aguardando o rótulo publicar" e o `/health` continua na versão anterior.
- **Rótulo aplicado depois do merge:** rode "Atualizar a VPS" (`workflow_dispatch`) na `main`. A regra é a mesma: só publica a ponta da `main`, e só se o PR dela tiver o rótulo. (Escolhido no lugar de disparar por evento de rótulo: é mais simples e deixa a hora da publicação sob controle da coordenação.)
- **Commit sem PR** (push direto): não publica.
- **Se a API do GitHub não responder:** o job falha (vermelho) e nada é publicado; reexecute depois.
- **Limite conhecido:** o rótulo é só um filtro do workflow; quem tem escrita no repositório pode aplicá-lo ou criar outro workflow. A proteção real de branch não existe no plano atual para repositório privado.
- **Reverter:** reverta o commit da trava; o deploy volta a publicar todo merge.

## Custos de referência (nov/2026)
| Opção | Preço |
|---|---|
| Contabo antiga | US$ 9 + US$ 2 da região EUA (≈ R$ 113 com impostos) |
| Hostinger KVM 1 | R$ 30–40/mês nos planos longos |
| Hostinger KVM 2 | R$ 57/mês nos planos longos; no mensal renova por R$ 109 |
