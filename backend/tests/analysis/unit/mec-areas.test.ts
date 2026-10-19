import { describe, expect, it } from "vitest";

import { areaOf } from "../../../src/services/CommercialServices/MecAreas";
import { MEC_DOC } from "../../../src/services/CommercialServices/MecDoc";

describe("area of a course in the Portaria MEC 378/2025", () => {
  it("Direito, Enfermagem, Medicina, Odontologia and Psicologia are presencial only", () => {
    for (const n of ["Direito", "Enfermagem", "Medicina", "Odontologia", "Psicologia"]) expect(areaOf(n, null, null)).toBe("presencial");
  });

  it("veterinary medicine is agriculture (40%), not Medicina", () => {
    expect(areaOf("Medicina Veterinária", null, null)).toBe("saude_eng_agro");
  });

  it("health, engineering and agriculture: 40%", () => {
    for (const n of ["Biomedicina", "Farmácia", "Fisioterapia", "Nutrição", "Cst Em Estética E Cosmética", "Cst Em Radiologia", "Engenharia Civil", "Engenharia De Produção 2.0", "Arquitetura E Urbanismo", "Agronomia", "Cst Em Gestão Do Agronegócio"]) {
      expect(areaOf(n, null, null), n).toBe("saude_eng_agro");
    }
  });

  it("teaching degrees and natural sciences, mathematics and statistics: 30%", () => {
    for (const n of ["Pedagogia", "Letras Português", "Matemática", "Física", "Química", "Ciências Biológicas", "Educação Especial"]) expect(areaOf(n, null, null), n).toBe("educacao_ciencias");
    expect(areaOf("História", "Licenciatura", null)).toBe("educacao_ciencias");
  });

  it("Educação Física follows its degree; humanities without teaching degree are not impacted", () => {
    expect(areaOf("Educação Física", "Licenciatura", null)).toBe("educacao_ciencias");
    expect(areaOf("Educação Física", "Bacharelado", null)).toBe("saude_eng_agro");
    expect(areaOf("Filosofia", "Bacharelado", "EAD")).toBe("livre");
    expect(areaOf("Filosofia", null, "Semipresencial")).toBe("educacao_ciencias");
  });

  it("management courses that only mention health follow the catalogue", () => {
    expect(areaOf("Cst Em Gestão Da Saúde Pública", null, "EAD")).toBe("livre");
    expect(areaOf("Cst Em Gestão Hospitalar", null, "Semipresencial")).toBe("saude_eng_agro");
  });

  it("the other courses are not impacted", () => {
    for (const n of ["Administração", "Ciências Contábeis", "Ciência Da Computação", "Engenharia De Software", "Cst Em Marketing Digital", "Cst Em Gestão Da Tecnologia Da Informação"]) expect(areaOf(n, null, "EAD"), n).toBe("livre");
  });

  it("the knowledge text carries the official percentages and no invented schedule", () => {
    expect(MEC_DOC.content).toMatch(/40%/);
    expect(MEC_DOC.content).toMatch(/30%/);
    expect(MEC_DOC.content).toMatch(/Portaria MEC nº 378/);
    expect(MEC_DOC.content).toMatch(/nunca invente dias, locais ou datas/);
  });
});
