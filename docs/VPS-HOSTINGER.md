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

## Custos de referência (nov/2026)
| Opção | Preço |
|---|---|
| Contabo antiga | US$ 9 + US$ 2 da região EUA (≈ R$ 113 com impostos) |
| Hostinger KVM 1 | R$ 30–40/mês nos planos longos |
| Hostinger KVM 2 | R$ 57/mês nos planos longos; no mensal renova por R$ 109 |
