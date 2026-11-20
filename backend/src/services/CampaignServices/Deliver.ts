import Campaign from "../../models/Campaign";
import Whatsapp from "../../models/Whatsapp";
import { renderCampaignText, CampaignStep } from "../../helpers/CampaignText";
import SendToContact from "../ChannelServices/SendToContact";
import { resolveOutboundContact } from "../ChannelServices/ResolveOutboundContact";
import { fillTemplate, templateValues } from "./Templates";
import { withButtons } from "../../helpers/QuickButtons";

// An approved template opens the conversation on the official API; the messages after it need the person to answer first.
export const usesTemplate = (campaign: Campaign, whatsapp: Whatsapp): boolean => whatsapp.channel === "whatsapp_cloud" && !!campaign.templateName;

// Sends one message of a campaign to one number. Returns the text that went out.
export const deliverStep = async (opts: {
  campaign: Campaign;
  whatsapp: Whatsapp;
  number: string;
  name: string;
  step: CampaignStep;
  index: number;
  idempotencyKey?: string;
}): Promise<string> => {
  const { campaign, whatsapp, number, name, step, index } = opts;
  const contact = await resolveOutboundContact(whatsapp, number, name || "");
  const body = renderCampaignText(step.body, { name: name || contact.name, number });
  const viaTemplate = index === 0 && usesTemplate(campaign, whatsapp);
  let template: { name: string; language: string; params: string[] } | null = null;
  let sentText = body;
  if (viaTemplate) {
    // each {{n}} of the approved template gets the value chosen for it (first name, course, polo, consultant...)
    let keys: string[] = [];
    try { keys = JSON.parse(campaign.templateParams || "[]"); } catch (e) { keys = []; }
    const filled = fillTemplate(Array.isArray(keys) ? keys : [], await templateValues(contact.id, name || contact.name, number), campaign.templateBody || null);
    template = { name: campaign.templateName, language: campaign.templateLanguage || "pt_BR", params: filled.params };
    // the conversation keeps what the person really received
    if (filled.text) sentText = filled.text;
  }
  // the buttons of the step (the approved template brings its own, if any)
  const tapped = viaTemplate || step.mediaUrl ? { body: sentText, choices: null } : withButtons(whatsapp.channel, sentText, step.buttons);
  sentText = tapped.body;
  await SendToContact({
    idempotencyKey: opts.idempotencyKey,
    contact,
    whatsapp,
    body: sentText,
    mediaUrl: viaTemplate ? undefined : step.mediaUrl,
    template,
    choices: tapped.choices
  });
  return sentText;
};
