import * as Yup from "yup";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import ShowWhatsAppService from "./ShowWhatsAppService";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";
import { cleanCredential, isMasked, looksLikeAppSecret, mergeConfig } from "../../helpers/Secrets";
import { forgetWebhook } from "../../channels/WebhookLog";
import { defaultInstitution, forgetInstitutions } from "../../helpers/Institution";
import Institution from "../../models/Institution";

interface WhatsappData {
  name?: string;
  status?: string;
  session?: string;
  isDefault?: boolean;
  greetingMessage?: string;
  farewellMessage?: string;
  queueIds?: number[];
  config?: string;
  businessHours?: string;
  outOfHoursMessage?: string;
  riskMode?: string;
  groupsMode?: string;
  allowedGroups?: string[];
  aiFirst?: boolean;
  team?: string | null;
  institutionId?: number | string | null;
}

interface Request {
  whatsappData: WhatsappData;
  whatsappId: string;
}

interface Response {
  whatsapp: Whatsapp;
  oldDefaultWhatsapp: Whatsapp | null;
}

const UpdateWhatsAppService = async ({
  whatsappData,
  whatsappId
}: Request): Promise<Response> => {
  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    status: Yup.string(),
    isDefault: Yup.boolean()
  });

  const {
    name,
    status,
    isDefault,
    session,
    greetingMessage,
    farewellMessage,
    config,
    businessHours,
    outOfHoursMessage,
    riskMode,
    groupsMode,
    allowedGroups,
    aiFirst,
    team,
    institutionId,
    queueIds = []
  } = whatsappData;

  try {
    await schema.validate({ name, status, isDefault });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (queueIds.length > 1 && !greetingMessage) {
    throw new AppError("ERR_WAPP_GREETING_REQUIRED");
  }

  if (riskMode !== undefined && !["strict", "relaxed"].includes(riskMode)) {
    throw new AppError("ERR_INVALID_RISK_MODE", 400);
  }

  if (groupsMode !== undefined && !["off", "selected", "all"].includes(groupsMode)) {
    throw new AppError("ERR_INVALID_GROUPS_MODE", 400);
  }

  // the university the number speaks for (empty = the default one)
  let ownInstitution: number | null | undefined;
  if (institutionId !== undefined) {
    ownInstitution = institutionId === null || institutionId === "" || Number(institutionId) === 0
      ? (await defaultInstitution())?.id || null
      : Number(institutionId);
    if (ownInstitution !== null && !(await Institution.count({ where: { id: ownInstitution } as any }))) throw new AppError("ERR_NOT_FOUND", 404);
  }

  let oldDefaultWhatsapp: Whatsapp | null = null;

  if (isDefault) {
    oldDefaultWhatsapp = await Whatsapp.findOne({
      where: { isDefault: true, id: { [Op.not]: whatsappId } }
    });
    if (oldDefaultWhatsapp) {
      await oldDefaultWhatsapp.update({ isDefault: false });
    }
  }

  const whatsapp = await ShowWhatsAppService(whatsappId);

  // an official number: the Access Token field must not receive the App Secret (it would replace a working token and take the number down)
  if (config !== undefined && whatsapp.channel === "whatsapp_cloud") {
    let typed: unknown;
    try { typed = JSON.parse(config)?.accessToken; } catch (e) { typed = undefined; }
    if (typeof typed === "string" && !isMasked(typed) && looksLikeAppSecret(cleanCredential(typed))) throw new AppError("ERR_CLOUD_TOKEN_IS_SECRET", 400);
  }

  const mergedConfig =
    config !== undefined ? mergeConfig(whatsapp.getDataValue("config"), config) : undefined;

  await whatsapp.update({
    name,
    status,
    session,
    greetingMessage,
    farewellMessage,
    isDefault,
    config: mergedConfig,
    businessHours,
    outOfHoursMessage,
    riskMode,
    groupsMode,
    aiFirst: aiFirst === undefined ? undefined : !!aiFirst,
    team: team === undefined ? undefined : team === "atendimento" || team === "tutoria" ? team : null,
    allowedGroups: allowedGroups === undefined ? undefined : JSON.stringify(allowedGroups.map(String)),
    institutionId: ownInstitution
  } as any);

  if (config !== undefined) forgetWebhook(whatsapp.id);
  if (ownInstitution !== undefined) forgetInstitutions();

  await AssociateWhatsappQueue(whatsapp, queueIds);

  return { whatsapp, oldDefaultWhatsapp };
};

export default UpdateWhatsAppService;
