import { QueryInterface } from "sequelize";

// Ready-made quick replies for the admissions routine. They are plain rows, so they are always there (they do not
// depend on any WhatsApp connection being up) and each one can be edited or deleted. A shortcut that already exists is
// left untouched, so nothing the team wrote is overwritten. No prices and no scholarship promises in any of them.
const DEFAULTS: Array<[string, string]> = [
  [
    "fichamatricula",
    `Ficha de matrícula (fotos ou PDFs legíveis)

• Nome completo:
• Data de nascimento:
• CPF:
• RG (nº, órgão emissor, UF):
• Nome completo da mãe:
• Endereço completo (rua, nº, bairro, cidade, CEP):
• Telefone celular atualizado:
• E-mail pessoal:
• Histórico do Ensino Médio (caso tenha já em mãos)`
  ],
  [
    "documentos",
    `{{saudacao}}, {{primeiro_nome}}! Para a matrícula, preciso destes documentos (fotos ou PDFs legíveis):

• RG e CPF (frente e verso)
• Comprovante de residência atualizado
• Certificado e histórico do Ensino Médio
• Certidão de nascimento ou casamento

Pode ir me enviando por aqui mesmo, um de cada vez.`
  ],
  [
    "boasvindas",
    `{{saudacao}}, {{primeiro_nome}}! Aqui é {{atendente}}, da Cruzeiro do Sul Virtual. Vi que você tem interesse em estudar com a gente. Como posso te ajudar?`
  ],
  [
    "curso",
    `Que bom falar com você, {{primeiro_nome}}! Me conta: qual curso você tem interesse e qual é a sua forma de ingresso preferida (ENEM, vestibular online, transferência ou segunda graduação)?`
  ],
  [
    "ingresso",
    `Para te orientar melhor, {{primeiro_nome}}: você pretende ingressar por:

• ENEM
• Vestibular online
• Transferência
• Segunda graduação

Qual deles combina mais com você?`
  ],
  [
    "aguarde",
    `Só um momento, {{primeiro_nome}}, estou verificando isso para você e já te respondo.`
  ],
  [
    "retorno",
    `{{primeiro_nome}}, estou confirmando essa informação e volto a falar com você ainda hoje, combinado?`
  ],
  [
    "followup",
    `{{saudacao}}, {{primeiro_nome}}! Passando para saber se ficou alguma dúvida sobre a sua matrícula. Posso te ajudar com mais alguma coisa?`
  ],
  [
    "pagamento",
    `{{primeiro_nome}}, assim que o pagamento da taxa de matrícula for confirmado eu sigo com a sua matrícula e te aviso por aqui.`
  ],
  [
    "ambientacao",
    `{{saudacao}}, {{primeiro_nome}}! Eu sou {{atendente}}, seu tutor na Cruzeiro do Sul Virtual. Vou te acompanhar nos primeiros passos: acesso ao ambiente virtual, calendário e dúvidas do começo do curso. Pode contar comigo!`
  ],
  [
    "obrigado",
    `Eu que agradeço, {{primeiro_nome}}! Qualquer dúvida é só chamar por aqui. Bons estudos!`
  ]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    for (const [shortcut, message] of DEFAULTS) {
      await queryInterface.sequelize.query(
        `INSERT INTO "QuickAnswers" ("shortcut", "message", "createdAt", "updatedAt")
         SELECT :shortcut, :message, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM "QuickAnswers" WHERE LOWER("shortcut") = LOWER(:shortcut))`,
        { replacements: { shortcut, message } }
      );
    }
  },
  down: async () => undefined
};
