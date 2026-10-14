import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";

const ListWhatsAppsService = async (): Promise<Whatsapp[]> => {
  const whatsapps = await Whatsapp.findAll({
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      },
      { model: User, as: "owner", attributes: ["id", "name"] }
    ]
  });

  return whatsapps;
};

export default ListWhatsAppsService;
