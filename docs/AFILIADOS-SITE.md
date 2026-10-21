# Site público dos afiliados

Três páginas públicas, todas sem login e sem preço. O visual segue as Human Interface Guidelines da Apple (fonte do sistema, claro e escuro, grade de 8 pt, alvos de 44 pt, foco visível, movimento reduzido). A skill `apple-hig-designer` está em `.claude/skills/` para quem for mexer no design.

| Página | Endereço | Quem vê | Como é feita |
|---|---|---|---|
| **Landing de captação** | `https://API/r/CÓDIGO` (e `https://API/leadform/TOKEN` para o formulário do site) | A pessoa indicada | HTML do servidor (`backend/src/helpers/LeadPage.ts`), sem React |
| **Central do Afiliado** | `https://FRONT/afiliado/TOKEN` | O afiliado | React (`frontend/src/pages/AffiliatePortal`), estilo em `central.css` |
| **Página de curso** | `https://FRONT/curso/ID-nome` (aceita `?ref=CÓDIGO`, `?embed=1`, `utm_*`) | Lead de anúncio ou site | React (`frontend/src/pages/CoursePage`) |

## Do clique à comissão

1. O afiliado é criado (`POST /affiliates`); nascem o `refCode` (6 caracteres) e o `portalToken` (48 caracteres em hexadecimal). Os links já distribuídos **não mudam**.
2. `GET /r/CÓDIGO` mostra a landing e grava o clique (`AffiliateClicks`: uma pessoa por dia, sem guardar o IP; robôs e pré-visualizações do WhatsApp são ignorados). Na página de curso, `?ref=CÓDIGO` grava o clique do mesmo jeito.
3. `POST /r/CÓDIGO/submit` (ou `POST /public/courses/ID/lead` com `ref`) cria o lead com `affiliateId` e o consultor dono do afiliado. Corpo: `name`, `phone`, `courseId`, `email`, `city`, `modality`, `admissionType`, `consent: true`, `website` (armadilha, deve vir vazio), `utm_source`, `utm_medium`, `utm_campaign`. Sem consentimento, 400.
4. Quando o lead vai para "Matriculado" (ou a mensalidade é paga, conforme a regra), `recordBonus` cria a bonificação, uma só por lead. O afiliado vê o funil e as bonificações na Central.
5. Um lead que já existia (mesmo telefone, e-mail ou CPF) só recebe os campos que estavam vazios: a indicação não toma o lead de quem já o atendia.

## Limites e segurança

- Rotas públicas: 120 requisições por minuto por IP; envio do formulário 8 por 10 minutos; página de curso 20 por 10 minutos; indicação feita dentro da Central 12 por 10 minutos e 40 por dia por afiliado.
- Link errado e afiliado pausado dão a **mesma** resposta 404 (ninguém descobre quais códigos existem).
- A landing roda só o próprio estilo e script (CSP com `nonce` por requisição), não é indexada (`noindex`) e o link do afiliado não pode ser colocado em quadro de outro site; o formulário `/leadform` pode.
- A Central também não é indexada e abre os vídeos do YouTube em um quadro isolado (`sandbox`).

## Configurações que alimentam as páginas

`crm_form_title`, `crm_form_color`, `crm_form_thanks`, `crm_form_privacy_url` (link do aviso de privacidade, só https), `affiliate_portal_title`, `affiliate_portal_message`, `affiliate_faq`, `affiliate_video_program`, `affiliate_video_tutorial`, `affiliate_support_phone`.

## Imagens da landing

`backend/assets/brand/`: `aluna.webp` (foto), `logo-color.svg` (logo para fundo claro), `og.jpg` (imagem do link compartilhado, 1200×630) e `backend/assets/mail/logo.png` (logo claro para o modo escuro). São servidas por `/leadform/_aluna.webp`, `/_logo.svg`, `/_logo-light.png` e `/_og.jpg`, com cache de 7 dias.

## Como conferir

`cd backend && npx vitest run tests/analysis/unit/lead-page.test.ts` (contrato do formulário, escape, nonce, cores) e, com a API no ar, abrir `/r/CÓDIGO` em 390 px e 1280 px, claro e escuro, e enviar um lead.
