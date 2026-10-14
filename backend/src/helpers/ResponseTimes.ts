import { BusinessConfig, businessMinutes } from "./BusinessTime";

// Response times, the way a manager needs them. The average lies: three conversations forgotten for two days make a
// fast team look slow. So everything here reports the MEDIAN (what a typical customer waited), the P90 (how long the
// slowest tenth waited) and the share answered within the target. Time is counted in working hours when the company
// has them set; the wall-clock time is kept next to it.
export interface MessageRow {
  ticketId: number;
  fromMe: boolean | number | string;
  createdAt: Date | string;
}

export interface Gap {
  ticketId: number;
  at: Date; // when the customer wrote
  minutes: number; // working minutes until the team answered
  wall: number; // clock minutes
}

const isMine = (v: any): boolean => v === true || v === 1 || v === "t" || v === "true";

// messages must be ordered by ticket, then time. Each customer message (or run of them) waits for the next team message.
export const pairGaps = (rows: MessageRow[], business: BusinessConfig | null): Gap[] => {
  const gaps: Gap[] = [];
  let ticket = -1;
  let waitingSince: Date | null = null;
  rows.forEach(r => {
    if (r.ticketId !== ticket) {
      ticket = r.ticketId;
      waitingSince = null;
    }
    const at = new Date(r.createdAt);
    if (isMine(r.fromMe)) {
      if (waitingSince) {
        gaps.push({
          ticketId: r.ticketId,
          at: waitingSince,
          minutes: businessMinutes(business, waitingSince, at),
          wall: (at.getTime() - waitingSince.getTime()) / 60000
        });
        waitingSince = null;
      }
    } else if (!waitingSince) {
      waitingSince = at;
    }
  });
  return gaps;
};

export const percentile = (sorted: number[], p: number): number | null => {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10);

export interface Summary {
  count: number;
  avg: number | null;
  median: number | null;
  p90: number | null;
  withinSlaPct: number | null;
}

export const summarize = (minutes: number[], slaMinutes: number): Summary => {
  if (!minutes.length) return { count: 0, avg: null, median: null, p90: null, withinSlaPct: null };
  const sorted = [...minutes].sort((a, b) => a - b);
  const sum = sorted.reduce((t, v) => t + v, 0);
  return {
    count: sorted.length,
    avg: round1(sum / sorted.length),
    median: round1(percentile(sorted, 0.5)),
    p90: round1(percentile(sorted, 0.9)),
    withinSlaPct: Math.round((sorted.filter(v => v <= slaMinutes).length / sorted.length) * 100)
  };
};

// "1 h 20 min", "45 min", "3 d" for the sentences of the insights
export const human = (min: number | null): string => {
  if (min === null) return "—";
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d`;
  const m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
};

export interface Insight {
  tone: "good" | "warn" | "info";
  text: string;
}

// plain rules that turn the numbers into sentences someone can act on
export const buildInsights = (input: {
  reply: Summary;
  previous: Summary;
  slaMinutes: number;
  byHour: Array<{ hour: number; median: number | null; count: number }>;
  unanswered: number;
  waiting: number;
  rangeDays: number;
  scopeName?: string;
}): Insight[] => {
  const out: Insight[] = [];
  const { reply, previous, slaMinutes, byHour, unanswered, waiting } = input;
  if (reply.count >= 5 && reply.median !== null) {
    if (reply.median <= slaMinutes) {
      out.push({ tone: "good", text: `O cliente típico é respondido em ${human(reply.median)}, dentro da meta de ${slaMinutes} min. ${reply.withinSlaPct}% das respostas saíram no prazo.` });
    } else if (reply.median > slaMinutes * 2) {
      out.push({ tone: "warn", text: `O cliente típico espera ${human(reply.median)} por uma resposta, mais que o dobro da meta de ${slaMinutes} min. Só ${reply.withinSlaPct}% das respostas saíram no prazo.` });
    } else {
      out.push({ tone: "info", text: `O cliente típico espera ${human(reply.median)} (meta: ${slaMinutes} min). ${reply.withinSlaPct}% das respostas saíram no prazo.` });
    }
    if (reply.avg !== null && reply.median > 0 && reply.avg > reply.median * 2.5) {
      out.push({ tone: "warn", text: `A média (${human(reply.avg)}) é bem pior que a mediana (${human(reply.median)}): poucas conversas esquecidas puxam o número. Veja as mais antigas sem resposta.` });
    }
    if (reply.p90 !== null && reply.p90 > slaMinutes * 6) {
      out.push({ tone: "warn", text: `1 em cada 10 clientes espera mais de ${human(reply.p90)}.` });
    }
  }
  if (reply.median !== null && previous.median !== null && reply.count >= 8 && previous.count >= 8 && previous.median > 0) {
    const change = (reply.median - previous.median) / previous.median;
    if (change >= 0.25) out.push({ tone: "warn", text: `Respostas ${Math.round(change * 100)}% mais lentas que no período anterior (${human(previous.median)} para ${human(reply.median)}).` });
    else if (change <= -0.25) out.push({ tone: "good", text: `Respostas ${Math.round(-change * 100)}% mais rápidas que no período anterior (${human(previous.median)} para ${human(reply.median)}).` });
  }
  const worst = byHour.filter(h => h.median !== null && h.count >= 3).sort((a, b) => (b.median as number) - (a.median as number))[0];
  if (worst && reply.median !== null && (worst.median as number) > Math.max(reply.median * 1.6, slaMinutes)) {
    out.push({ tone: "info", text: `Quem escreve por volta das ${String(worst.hour).padStart(2, "0")}h espera mais: mediana de ${human(worst.median)}. Vale reforçar a equipe nesse horário.` });
  }
  if (unanswered > 0) out.push({ tone: "warn", text: `${unanswered} conversa${unanswered === 1 ? "" : "s"} com o cliente esperando resposta há mais de ${slaMinutes} min agora.` });
  if (waiting > 0) out.push({ tone: "info", text: `${waiting} pessoa${waiting === 1 ? "" : "s"} na fila de espera, ainda sem atendente.` });
  if (!out.length) out.push({ tone: "info", text: "Ainda não há dados suficientes neste período para uma leitura. Os destaques aparecem conforme as conversas acontecem." });
  return out;
};
