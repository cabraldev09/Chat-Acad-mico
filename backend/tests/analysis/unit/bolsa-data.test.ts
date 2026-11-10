import { describe, expect, it } from "vitest";
import { bolsaDataFrom } from "../../../src/services/CommercialServices/BolsaData";
import { internshipPitch, stripGradeAnnouncement } from "../../../src/services/CommercialServices/GradeChoice";

describe("name and CPF for the scholarship", () => {
  it("reads both from one message, in the way people write it", () => {
    expect(bolsaDataFrom("Meu nome é maria da silva santos, cpf 529.982.247-25")).toEqual({ cpf: "52998224725", fullName: "Maria da Silva Santos", invalidCpf: false });
    expect(bolsaDataFrom("Maria Souza 52998224725")).toMatchObject({ cpf: "52998224725", fullName: "Maria Souza" });
    expect(bolsaDataFrom("52998224725\nJoão Pedro Lima")).toMatchObject({ cpf: "52998224725", fullName: "João Pedro Lima" });
  });

  it("only a name, only a CPF, a wrong CPF and things that are neither", () => {
    expect(bolsaDataFrom("Ana Paula Ferreira")).toMatchObject({ cpf: null, fullName: "Ana Paula Ferreira", invalidCpf: false });
    expect(bolsaDataFrom("529.982.247-25")).toMatchObject({ cpf: "52998224725", fullName: null });
    expect(bolsaDataFrom("Ana Paula 111.111.111-11")).toMatchObject({ cpf: null, fullName: "Ana Paula", invalidCpf: true });
    expect(bolsaDataFrom("quero saber o valor da mensalidade").fullName).toBeNull();
    expect(bolsaDataFrom("Vou pensar e volto depois").fullName).toBeNull();
    expect(bolsaDataFrom("maria da silva").fullName).toBeNull();
    expect(bolsaDataFrom("meu nome é maria da silva").fullName).toBe("Maria da Silva");
    expect(bolsaDataFrom("Moro em Ji-Paraná").cpf).toBeNull();
    expect(bolsaDataFrom("Maria").fullName).toBeNull();
    expect(bolsaDataFrom("").cpf).toBeNull();
  });
});

describe("what comes after the grade", () => {
  it("explains the internship and the tutors from the matrix, never inventing", () => {
    const text = internshipPitch({ totalInternshipHours: 400 }, [
      { semester: 5, discipline: "Educação Infantil", hours: 150 },
      { semester: 6, discipline: "Anos Iniciais do Ensino Fundamental", hours: 150 },
      { semester: 7, discipline: "Gestão Educacional", hours: 100 }
    ]);
    expect(text).toMatch(/400 horas, a partir do 5º semestre/);
    expect(text).toContain("Educação Infantil, Anos Iniciais do Ensino Fundamental, Gestão Educacional");
    expect(text).toMatch(/tutoria acompanha você/);
    expect(internshipPitch({}, [])).toMatch(/não tem estágio obrigatório/);
  });

  it("drops the sentences that announce the grade, keeps the rest", () => {
    const said = "Vou te encaminhar a grade curricular atualizada para você conhecer as disciplinas.\n\nO estágio soma 400 horas e a tutoria acompanha você.\n\nO PDF já foi enviado com os estágios na legenda.";
    expect(stripGradeAnnouncement(said)).toBe("O estágio soma 400 horas e a tutoria acompanha você.");
    expect(stripGradeAnnouncement("Enviei a grade em PDF. A tutoria acompanha você.")).toBe("A tutoria acompanha você.");
    expect(stripGradeAnnouncement("A grade tem 8 semestres e a tutoria ajuda nas provas.")).toBe("A grade tem 8 semestres e a tutoria ajuda nas provas.");
  });
});
