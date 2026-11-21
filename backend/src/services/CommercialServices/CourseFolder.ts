import fs from "fs";
import path from "path";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { PUBLIC_DIR } from "../../config/paths";
import { getSetting } from "../../helpers/AppSettings";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";

// "Quais cursos vocês têm?": the person gets the folder with every course (graduation and post-graduation) and the question of which one
// interests them, instead of a list typed by the AI (that would be incomplete and could carry a wrong format or duration). Once per conversation.
export const FOLDER_CAPTION = "Temos esses cursos de graduação e pós-graduação. Qual deles te interessa?";

const plain = (s: string): string => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const asksCourseList = (text: string): boolean => {
  const t = plain(text);
  return (
    /\b(quais|que|qual)\s+(sao\s+(os\s+)?)?cursos?\b/.test(t) ||
    /\bcursos?\b[^?.!]{0,30}\b(voces?|vcs?|tem|tens|oferece[mn]?|oferta[mn]?|disponive(l|is)|existe[mn]?)\b/.test(t) ||
    /\b(lista|catalogo|relacao|folder)\s+(de|dos)\s+cursos\b/.test(t)
  );
};

// the folder the team uploaded (Cursos e materiais) or the one that comes with the system
const folderFile = async (): Promise<string | null> => {
  const uploaded = String(await getSetting("courses_folder", "")).trim();
  if (uploaded && fs.existsSync(path.join(PUBLIC_DIR, uploaded))) return path.join(PUBLIC_DIR, uploaded);
  const shipped = path.join(__dirname, "..", "..", "..", "data", "folder-cursos.jpg");
  return fs.existsSync(shipped) ? shipped : null;
};

export const sendCourseFolder = async (ticket: Ticket): Promise<boolean> => {
  if (await Message.count({ where: { ticketId: ticket.id, fromMe: true, body: FOLDER_CAPTION } as any })) return false;
  const source = await folderFile();
  if (!source) return false;
  // SendWhatsAppMedia consumes the file it sends: it gets a copy
  const ext = path.extname(source).toLowerCase() === ".png" ? "png" : "jpg";
  const copyName = `folder-cursos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  fs.copyFileSync(source, path.join(PUBLIC_DIR, copyName));
  await SendWhatsAppMedia({
    media: { filename: copyName, originalname: `Cursos.${ext}`, mimetype: ext === "png" ? "image/png" : "image/jpeg", path: path.join(PUBLIC_DIR, copyName) } as Express.Multer.File,
    ticket,
    body: FOLDER_CAPTION
  });
  return true;
};
