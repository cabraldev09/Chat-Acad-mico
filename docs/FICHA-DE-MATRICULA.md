# Ficha de matrícula

O lead preenche a ficha de matrícula por um link pessoal, no celular, em vez de digitar os dados no WhatsApp.

## Como chega ao lead

- **CRM**, ficha do lead, aba **Ficha e documentos**: "Enviar pelo WhatsApp" ou "Copiar link".
- **Conversa**, menu **+**: **Ficha de matrícula** envia o link na própria conversa. Se o contato ainda não for lead, ele vira lead.
- **Copiloto**, etapa "Ficha de matrícula e documentos": a mensagem sugerida já leva o link. O lembrete diz quanto já foi preenchido.

O link é `https://<site>/ficha/<código>`:
- vale 30 dias e, quando vence, nasce outro com os mesmos dados;
- depois da matrícula confirmada, só mostra que a ficha já foi recebida.

## O que o lead preenche

- **Dados pessoais:**
  - nome completo;
  - data de nascimento;
  - CPF (os dígitos verificadores são conferidos);
  - nome completo da mãe.
- **Documento:**
  - RG (número, órgão emissor e UF);
  - foto do RG ou da CNH, frente e verso, pela câmera ou pela galeria. Um PDF na frente vale pelos dois lados.
- **Endereço:** CEP, rua, número, complemento (opcional), bairro, cidade e UF.
- **Contato:** celular e e-mail pessoal.
- **Histórico do ensino médio:** opcional.
- **Autorização de uso dos dados (LGPD).** Sem ela a ficha não é enviada.

Cada alteração é salva na hora, e a pessoa pode parar e continuar depois.

O topo mostra:
- a porcentagem preenchida;
- o que falta;
- quando foi salvo pela última vez.

As fotos grandes são reduzidas no próprio celular antes de subir, com até 10 MB por arquivo. Só aceitamos JPG, PNG, WEBP, HEIC e PDF, conferidos pelos primeiros bytes do arquivo.

## Quando o lead envia

- O lead recebe nome completo, CPF, e-mail, cidade e UF da ficha.
- O contato recebe o e-mail, se ainda não tinha.
- Os documentos "RG ou CNH", "CPF" e, se veio, "Histórico escolar" ficam como recebidos.
- O dono do lead recebe um aviso no sino.

## Na matrícula

- O e-mail da ficha atualiza o lead.
- O aluno do Portal do Aluno é criado com o RGM e esse e-mail.
- O convite do portal vai para esse e-mail, se o e-mail do sistema estiver configurado.

## Privacidade (LGPD)

- Os dados digitados ficam cifrados no banco (AES-256-GCM, coluna `EnrollmentForms.data`).
- As fotos ficam cifradas no disco, fora da pasta pública: em `FICHA_DIR` ou, se não houver, na pasta `fichas` ao lado de `UPLOAD_DIR`, no mesmo volume.
- O link do lead nunca devolve as fotos. Só a equipe logada, com acesso ao lead, as abre em `GET /leads/:id/enrollment-form/files/:kind`.
- A gestão (administração e coordenação) pode apagar os dados e as fotos a pedido do titular ("Apagar dados da ficha"). O registro fica dizendo quando foi apagado.

## Rotas

- **Público (link do lead):**
  - `GET` e `PUT /ficha-publica/:token`;
  - `POST` e `DELETE /ficha-publica/:token/files/:kind`;
  - `POST /ficha-publica/:token/submit`.
- **Equipe:**
  - `GET` e `POST /leads/:id/enrollment-form`;
  - `POST /leads/:id/enrollment-form/send`;
  - `GET /leads/:id/enrollment-form/files/:kind`;
  - `DELETE /leads/:id/enrollment-form` (gestão);
  - `POST /tickets/:ticketId/enrollment-form`.
