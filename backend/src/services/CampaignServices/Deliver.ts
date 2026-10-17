import Campaign from "../../models/Campaign";
import Whatsapp from "../../models/Whatsapp";
import { renderCampaignText, CampaignStep } from "../../helpers/CampaignText";
import SendToContact from "../ChannelServices/SendToContact";
import { resolveOutboundContact } from "../ChannelServices/ResolveOutboundContact";

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
}): Promise<string> => {
  const { campaign, whatsapp, number, name, step, index } = opts;
  const contact = await resolveOutboundContact(whatsapp, number, name || "");
  const body = renderCampaignText(step.body, { name: name || contact.name, number });
  const viaTemplate = usesTemplate(campaign, whatsapp);
  await SendToContact({
    contact,
    whatsapp,
    body,
    mediaUrl: step.mediaUrl,
    template:
      index === 0 && viaTemplate
        ? {
            name: campaign.templateName,
            language: campaign.templateLanguage || "pt_BR",
            // {{1}} of the approved template receives the first name
            params: [(name || contact.name || "").split(" ")[0]]
          }
        : null
  });
  return body;
};
