import Mustache from "mustache";
import Contact from "../models/Contact";

export default (body: string, contact: Contact): string => {
  const view = {
    name: contact ? contact.name : ""
  };
  // a name like "D'Ávila & Cia" goes out as typed: this is a WhatsApp text, not a web page
  return Mustache.render(body, view, {}, { escape: (v: string) => v });
};
