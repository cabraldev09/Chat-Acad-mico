import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/models/Message", () => ({ default: {} }));
vi.mock("../../src/models/Ticket", () => ({ default: {} }));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async () => "" }));
vi.mock("../../src/services/WbotServices/SendWhatsAppMedia", () => ({ default: async () => undefined }));
vi.mock("../../src/config/paths", () => ({ PUBLIC_DIR: "/tmp" }));
import { asksCourseList } from "../../src/services/CommercialServices/CourseFolder";

describe("the person asks which courses there are", () => {
  it("recognises the usual ways of asking", () => {
    for (const t of ["Quais cursos vocês ofertam?", "quais são os cursos?", "Que cursos vcs tem", "tem lista de cursos?", "Quais os cursos disponíveis", "cursos que vocês oferecem"]) expect(asksCourseList(t)).toBe(true);
  });
  it("does not fire on a course already chosen or on other questions", () => {
    for (const t of ["Tenho interesse em ADS", "Quanto custa o curso de Pedagogia?", "Oi", "o curso é EAD?"]) expect(asksCourseList(t)).toBe(false);
  });
});
