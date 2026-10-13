import * as Yup from "yup";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import ShowWhatsAppService from "./ShowWhatsAppService";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";
import { mergeConfig } from "../../helpers/Secrets";

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
    allowedGroups: allowedGroups === undefined ? undefined : JSON.stringify(allowedGroups.map(String))
  });

  await AssociateWhatsappQueue(whatsapp, queueIds);

  return { whatsapp, oldDefaultWhatsapp };
};

export default UpdateWhatsAppService;
