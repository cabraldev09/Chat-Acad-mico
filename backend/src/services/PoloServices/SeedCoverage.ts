import { getSetting, setSetting } from "../../helpers/AppSettings";
import Polo from "../../models/Polo";
import PoloCoverage from "../../models/PoloCoverage";
import { logger } from "../../utils/logger";
import { cityKeyOf, forgetPolos } from "./ResolvePolo";

// The 8 polos of Rondônia and the cities each one serves: every municipality of the state goes to the polo with the shortest driving time
// (road distances between the cities, measured once; when two polos are about equally far, Porto Velho, the main one, takes it).
// Semipresencial courses exist only in Rondônia: a lead from another state is served by the EAD side (central queue).
// Runs once and only fills what is empty: a city somebody already placed stays where it is, and every change can still be made in
// Polos > Cidades atendidas. "Porto Velho" itself has two polos and is left out on purpose: the agent asks which of the two is closer.
const COVERAGE: Record<string, string[]> = {
  "Alto Alegre dos Parecis": [
    "Alta Floresta D'Oeste",
    "Cacoal",
    "Costa Marques",
    "Espigão D'Oeste",
    "Nova Brasilândia D'Oeste",
    "Pimenta Bueno",
    "Presidente Médici",
    "Rolim de Moura",
    "Santa Luzia D'Oeste",
    "São Miguel do Guaporé",
    "Alto Alegre dos Parecis",
    "Novo Horizonte do Oeste",
    "Castanheiras",
    "Ministro Andreazza",
    "Parecis",
    "Primavera de Rondônia",
    "São Felipe D'Oeste",
    "São Francisco do Guaporé",
    "Seringueiras"
  ],
  "Buritis": [
    "Ariquemes",
    "Rio Crespo",
    "Alto Paraíso",
    "Buritis",
    "Cacaulândia",
    "Campo Novo de Rondônia",
    "Monte Negro"
  ],
  "Cerejeiras": [
    "Cabixi",
    "Cerejeiras",
    "Colorado do Oeste",
    "Corumbiara",
    "Pimenteiras do Oeste"
  ],
  "Porto Velho": [
    "Guajará-Mirim",
    "Machadinho D'Oeste",
    "Nova Mamoré",
    "Candeias do Jamari",
    "Cujubim",
    "Itapuã do Oeste"
  ],
  "Mirante da Serra": [
    "Jaru",
    "Ji-Paraná",
    "Ouro Preto do Oeste",
    "Alvorada D'Oeste",
    "Governador Jorge Teixeira",
    "Mirante da Serra",
    "Nova União",
    "Teixeirópolis",
    "Theobroma",
    "Urupá",
    "Vale do Anari",
    "Vale do Paraíso"
  ],
  "Vilhena": [
    "Vilhena"
  ],
  "Chupinguaia": [
    "Chupinguaia"
  ]
};

// Semipresencial courses (health, engineering, teaching) are enrolled only at Porto Velho and Vilhena; the other polos send their students to the
// nearest of them by road (Porto Velho: Buritis 5 h, Mirante da Serra 6.5 h; Vilhena: Cerejeiras 2 h, Chupinguaia 2.4 h, Alto Alegre 4.8 h).
const ENROLLS = ["porto velho", "vilhena"];
const SENDS_TO: Record<string, string> = { buritis: "porto velho", "mirante da serra": "porto velho", cerejeiras: "vilhena", chupinguaia: "vilhena", "alto alegre dos parecis": "vilhena" };

// "Alta Floresta D'Oeste" is also written "do Oeste"
const withVariants = (city: string): string[] => (/ D'Oeste$/.test(city) ? [city, city.replace(/ D'Oeste$/, " do Oeste")] : [city]);

const cityPoloKey = (p: Polo): string => cityKeyOf(p.name);

export const seedPoloCoverage = async (): Promise<void> => {
  try {
    if ((await getSetting("polo_coverage_ro_seeded", "")) === "1") return;
    const polos = await Polo.findAll();
    const taken = new Set((await PoloCoverage.findAll()).map(c => `${c.cityKey}|${c.state || ""}`));
    const rows: Array<{ poloId: number; city: string; cityKey: string; state: string }> = [];
    let matched = 0;
    for (const [home, cities] of Object.entries(COVERAGE)) {
      const homeKey = cityKeyOf(home);
      const mine = polos.filter(p => cityKeyOf(p.name).startsWith(homeKey) && (!p.state || String(p.state).toUpperCase() === "RO"));
      // Porto Velho has two polos: the one called "Centro" is the main one
      const polo = homeKey === "porto velho" ? mine.find(p => /\bcentro\b/.test(cityKeyOf(p.name))) : mine[0];
      if (!polo) continue;
      matched += 1;
      for (const city of cities.flatMap(withVariants)) {
        const cityKey = cityKeyOf(city);
        if (taken.has(`${cityKey}|RO`)) continue;
        taken.add(`${cityKey}|RO`);
        rows.push({ poloId: polo.id, city, cityKey, state: "RO" });
      }
    }
    // the city is written on the polo's name only: the field stays empty otherwise
    for (const p of polos) {
      if (p.city) continue;
      const home = Object.keys(COVERAGE).find(h => cityKeyOf(p.name).startsWith(cityKeyOf(h)));
      if (home) await p.update({ city: home });
    }
    if (rows.length) await PoloCoverage.bulkCreate(rows);
    // the released polos, and where each of the others sends its students (Porto Velho: the one called "Centro")
    const startsWith = (p: Polo, home: string): boolean => cityPoloKey(p).startsWith(home);
    const mainOf = (home: string): Polo | undefined => {
      const mine = polos.filter(p => startsWith(p, home));
      return home === "porto velho" ? mine.find(p => /\bcentro\b/.test(cityPoloKey(p))) || mine[0] : mine[0];
    };
    for (const p of polos) {
      if (ENROLLS.some(h => startsWith(p, h))) {
        if (!p.enrollsSemipresencial) await p.update({ enrollsSemipresencial: true });
        continue;
      }
      const home = Object.keys(SENDS_TO).find(h => startsWith(p, h));
      const target = home ? mainOf(SENDS_TO[home]) : undefined;
      if (target && !p.enrollPoloId) await p.update({ enrollPoloId: target.id });
    }
    forgetPolos();
    // no polo of Rondônia yet (a new installation): try again at the next start
    if (matched) {
      await setSetting("polo_coverage_ro_seeded", "1");
      logger.info(`Cidades dos polos de Rondônia cadastradas: ${rows.length}`);
    }
  } catch (err) {
    logger.warn(`Cidades dos polos de Rondônia não cadastradas: ${err}`);
  }
};
