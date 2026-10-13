import { v4 as uuid } from "uuid";
import { ChannelAdapter, getConfig } from "./types";
import { setChannelStatus } from "../services/ChannelServices/ChannelStatus";
import Whatsapp from "../models/Whatsapp";

export const WEBCHAT_PREFIX = "web_";

// Messages are stored in the database and fetched by the visitor's widget via
// polling, so "sending" only needs to hand back an id.
const webchat: ChannelAdapter = {
  type: "webchat",
  prefix: WEBCHAT_PREFIX,

  async start(whatsapp: Whatsapp) {
    const config = getConfig(whatsapp);
    if (!config.token) {
      config.token = uuid().replace(/-/g, "");
      await whatsapp.update({ config: JSON.stringify(config) });
    }
    await setChannelStatus(whatsapp, "CONNECTED");
  },

  async stop() {
    // nothing to tear down
  },

  async sendText() {
    return { id: `web-out-${uuid()}` };
  },

  async sendMedia() {
    return { id: `web-out-${uuid()}` };
  }
};

export default webchat;
