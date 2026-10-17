import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import ContactListItem from "../../models/ContactListItem";

// The recipients of a campaign are copied from its list the first time it starts (or is scheduled to start), so editing the
// list later does not change a campaign that already began.
export const ensureShippings = async (campaign: Campaign): Promise<number> => {
  const existing = await CampaignShipping.count({ where: { campaignId: campaign.id } });
  if (existing) return existing;
  const items = await ContactListItem.findAll({ where: { contactListId: campaign.contactListId } });
  if (!items.length) throw new AppError("ERR_CAMPAIGN_EMPTY_LIST");
  await CampaignShipping.bulkCreate(
    items.map(i => ({ campaignId: campaign.id, name: i.name, number: i.number, status: "pending" }))
  );
  return items.length;
};

// What a person reads in the report instead of an internal code.
const ERROR_TEXT: Array<[RegExp, string]> = [
  [/ERR_WAPP_INVALID_CONTACT/, "Este número não tem WhatsApp."],
  [/ERR_WAPP_CHECK_CONTACT/, "Não foi possível conferir se o número tem WhatsApp."],
  [/ERR_RATE_LIMITED/, "Envio em ritmo alto demais para proteger o número."],
  [/ERR_WAPP_NOT_INITIALIZED|ERR_NO_DEF_WAPP_FOUND|ERR_NO_WAPP_FOUND/, "A conexão não estava disponível no momento do envio."],
  [/ERR_SENDING_WAPP_MSG|ERR_SENDING_WAPP_MEDIA_MSG/, "O WhatsApp não aceitou o envio."],
  [/ERR_MEDIA_NOT_FOUND/, "O arquivo anexado não foi encontrado."],
  [/ERR_TEMPLATES_UNSUPPORTED/, "Esta conexão não envia modelos aprovados."],
  [/ERR_[A-Z0-9_]+/, "Não foi possível enviar."]
];

export const describeShippingError = (raw: string | null | undefined): string => {
  const text = String(raw || "");
  if (!text) return "";
  const hit = ERROR_TEXT.find(([re]) => re.test(text));
  if (!hit) return text;
  // "Mensagem 2 de 3: ERR_X" keeps the prefix
  const prefix = text.match(/^(Mensagem \d+ de \d+): /);
  return `${prefix ? `${prefix[1]}: ` : ""}${hit[1]}`;
};
