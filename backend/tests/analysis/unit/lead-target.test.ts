import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/database", () => ({ default: {} }));
vi.mock("../../../src/libs/socket", () => ({ getIO: vi.fn() }));
vi.mock("../../../src/helpers/Institution", () => ({ legacyInstitutionId: async () => 1 }));
vi.mock("../../../src/models/Contact", () => ({ default: { findByPk: vi.fn(), findOne: vi.fn() } }));
vi.mock("../../../src/models/Ticket", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../src/models/Whatsapp", () => ({ default: { findByPk: vi.fn() } }));
vi.mock("../../../src/helpers/GetDefaultWhatsApp", () => ({ default: vi.fn() }));
vi.mock("../../../src/services/ChannelServices/ResolveOutboundContact", () => ({ resolveOutboundContact: vi.fn() }));

import Contact from "../../../src/models/Contact";
import Ticket from "../../../src/models/Ticket";
import Whatsapp from "../../../src/models/Whatsapp";
import GetDefaultWhatsApp from "../../../src/helpers/GetDefaultWhatsApp";
import { resolveOutboundContact } from "../../../src/services/ChannelServices/ResolveOutboundContact";
import { resolveLeadTarget } from "../../../src/services/CrmServices/LeadCore";

describe("abrir o histórico já existente do lead", () => {
  beforeEach(() => vi.resetAllMocks());
  it("resolve o contato pelo telefone antes de escolher o número padrão", async () => {
    const contact = { id: 41, number: "5569999112233" };
    const qr = { id: 8, channel: "whatsapp", ownerId: 3 };
    const official = { id: 1, channel: "whatsapp_cloud" };
    vi.mocked(Contact.findOne).mockResolvedValue(contact as any);
    vi.mocked(Ticket.findOne).mockResolvedValue({ whatsappId: 8 } as any);
    vi.mocked(Whatsapp.findByPk).mockResolvedValue(qr as any);
    vi.mocked(GetDefaultWhatsApp).mockResolvedValue(official as any);
    vi.mocked(resolveOutboundContact).mockResolvedValue(contact as any);
    const lead = { contactId: null, phone: "(69) 99911-2233", name: "Contato de teste", update: vi.fn() };
    const target = await resolveLeadTarget(lead as any, 3);
    expect(target.whatsapp.id).toBe(8);
    expect(target.contact.id).toBe(41);
    expect(lead.update).toHaveBeenCalledWith({ contactId: 41 });
    expect(GetDefaultWhatsApp).not.toHaveBeenCalled();
    expect(resolveOutboundContact).not.toHaveBeenCalled();
  });
});
