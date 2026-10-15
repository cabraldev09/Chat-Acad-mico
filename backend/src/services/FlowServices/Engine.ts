import { FlowNode, Graph, handleOf, nextNodeId } from "./Graph";

// The engine walks a flow. It knows nothing about WhatsApp or the database: everything it does to the outside world goes
// through `Effects`. The same engine runs a real conversation (effects that send and save) and the simulator on screen
// (effects that only record what would happen).

export interface Effects {
  // the text is what the history shows; `choices` lets channels with buttons send them natively
  say(text: string, choices?: { question: string; options: Array<{ id: string; label: string }> }): Promise<void>;
  // the value a condition looks at ("lead.course", "tag", "hours", "channel", "message"...)
  readField(field: string): Promise<string>;
  // an answer to a question: saved on the lead when the field is one of its own
  saveField(field: string, value: string): Promise<void>;
  crm(node: FlowNode, vars: Record<string, any>): Promise<string>;
  transfer(node: FlowNode, vars: Record<string, any>): Promise<void>;
  handToAi(node: FlowNode): Promise<void>;
  close(): Promise<void>;
  webhook(url: string, vars: Record<string, any>): Promise<boolean>;
  // first name and full name of the person, for {{primeiro_nome}} and {{nome}}
  who(): { name: string; first: string };
  // the active polos the person can choose from, and the choice (lead polo + the sales queue of that polo); returns its name
  listPolos(): Promise<PoloOption[]>;
  setPolo(poloId: number): Promise<string>;
}

export interface PoloOption {
  id: number;
  name: string;
  city: string;
}

export interface RunState {
  // the block waiting for the person (buttons, ask) or the delay block that is counting time
  nodeId: string | null;
  vars: Record<string, any>;
  tries: number;
}

export interface StepResult {
  status: "waiting" | "delayed" | "done" | "handoff";
  state: RunState;
  resumeAt?: Date;
  // every block the person went through in this step (for the counters and the path on screen)
  path: string[];
}

const MAX_STEPS = 80;
const MAX_TRIES = 2;

export const normalize = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export const render = (text: string, vars: Record<string, any>, who: { name: string; first: string }): string =>
  String(text || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    if (key === "nome") return who.name;
    if (key === "primeiro_nome") return who.first;
    const v = vars[key.replace(/^vars\./, "")];
    return v === undefined || v === null ? "" : String(v);
  });

const menuText = (text: string, options: any[]): string => `${text}\n\n${options.map((o, i) => `*${i + 1}* - ${o.label}`).join("\n")}`;

// what a person typed, matched to one of the options: the number, the name, or a keyword of the option
const pickOption = (options: any[], answer: string): any | null => {
  const a = normalize(answer);
  if (/^\d+$/.test(a)) return options[Number(a) - 1] || null;
  const exact = options.find(o => normalize(o.label) === a);
  if (exact) return exact;
  // buttons cut long names (20 to 24 characters): the beginning of one option is enough when it is unambiguous
  if (a.length >= 3) {
    const starts = options.filter(o => normalize(o.label).startsWith(a));
    if (starts.length === 1) return starts[0];
  }
  return (
    options.find(o =>
      String(o.keywords || "")
        .split(",")
        .map(k => normalize(k))
        .filter(Boolean)
        .includes(a)
    ) || null
  );
};

// letters and digits only, without accents: "Ji-Paraná" and "ji parana" are the same thing
const plain = (s: string): string =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const distance = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
};

// What the person wrote, matched to a polo: the number, the exact name or city, a phrase that contains it ("moro em ji
// parana") or something close to it ("ji parna"). Several polos fit equally: the answer is returned as `ambiguous`.
export const matchPolo = (polos: PoloOption[], answer: string): { polo?: PoloOption; ambiguous?: PoloOption[] } => {
  const a = plain(answer);
  if (!a) return {};
  if (/^\d+$/.test(a)) return polos[Number(a) - 1] ? { polo: polos[Number(a) - 1] } : {};
  const keys = (p: PoloOption): string[] => [plain(p.city), plain(p.name), plain(p.name).replace(/^polo /, "")].filter(k => k.length >= 3);
  const words = a.split(" ");
  const score = (p: PoloOption): number => {
    let best = 0;
    for (const k of keys(p)) {
      if (k === a) best = Math.max(best, 100);
      else if (` ${a} `.includes(` ${k} `)) best = Math.max(best, 80 + Math.min(k.length, 15));
      else if (a.length >= 3 && ` ${k} `.includes(` ${a} `)) best = Math.max(best, 50 + a.length);
      else {
        // close spellings: compare with every stretch of the answer that has as many words as the key
        const n = k.split(" ").length;
        const tolerance = k.length >= 8 ? 2 : k.length >= 5 ? 1 : 0;
        for (let i = 0; i + n <= words.length; i += 1) {
          const d = distance(words.slice(i, i + n).join(" "), k);
          if (d <= tolerance) best = Math.max(best, 40 - d * 5);
        }
      }
    }
    return best;
  };
  const scored = polos.map(p => ({ p, s: score(p) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s);
  if (!scored.length) return {};
  const top = scored.filter(x => x.s === scored[0].s);
  return top.length === 1 ? { polo: top[0].p } : { ambiguous: top.map(x => x.p) };
};

const validators: Record<string, (v: string) => string | null> = {
  text: v => (v.trim() ? v.trim().slice(0, 200) : null),
  email: v => (/^\S+@\S+\.\S+$/.test(v.trim()) ? v.trim().toLowerCase().slice(0, 120) : null),
  phone: v => (v.replace(/\D/g, "").length >= 10 ? v.replace(/\D/g, "").slice(0, 15) : null),
  number: v => (/\d/.test(v) ? v.replace(/\D/g, "").slice(0, 12) : null)
};
const invalidText: Record<string, string> = {
  email: "Não consegui entender o e-mail. Pode digitar de novo?",
  phone: "Não consegui entender o telefone. Digite com DDD, por exemplo 69 99999-0000.",
  number: "Preciso de um número. Pode digitar de novo?",
  text: "Não consegui entender. Pode escrever de novo?"
};

const ruleHolds = async (rule: any, vars: Record<string, any>, fx: Effects): Promise<boolean> => {
  for (const c of rule.all || []) {
    const field = String(c.field || "");
    // eslint-disable-next-line no-await-in-loop
    const left = normalize(field.startsWith("var:") ? String(vars[field.slice(4)] ?? "") : await fx.readField(field));
    const right = normalize(String(c.value ?? ""));
    let ok = false;
    switch (c.op) {
      case "eq": ok = left === right; break;
      case "neq": ok = left !== right; break;
      case "contains": ok = left.includes(right); break;
      case "notcontains": ok = !left.includes(right); break;
      case "in": ok = String(c.value ?? "").split(",").map(v => normalize(v)).filter(Boolean).includes(left); break;
      case "empty": ok = left === ""; break;
      case "notempty": ok = left !== ""; break;
      default: ok = false;
    }
    if (!ok) return false;
  }
  return (rule.all || []).length > 0;
};

// Runs from a block until the flow has to wait (for an answer or for time) or ends.
export const advance = async (graph: Graph, startId: string | null, state: RunState, fx: Effects): Promise<StepResult> => {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const path: string[] = [];
  let current = startId;
  const done = (status: StepResult["status"], resumeAt?: Date): StepResult => ({ status, state, path, resumeAt });

  for (let steps = 0; steps < MAX_STEPS; steps += 1) {
    if (!current) return done("done");
    const node = byId.get(current);
    if (!node) return done("done");
    path.push(node.id);
    const d = node.data || {};
    const go = (handle = "out") => nextNodeId(graph, node.id, handle);
    const who = fx.who();
    switch (node.type) {
      case "start":
        current = go();
        break;
      case "comment":
        current = go();
        break;
      case "message":
        // eslint-disable-next-line no-await-in-loop
        await fx.say(render(d.text, state.vars, who));
        current = go();
        break;
      case "buttons": {
        state.nodeId = node.id;
        state.tries = 0;
        // eslint-disable-next-line no-await-in-loop
        await fx.say(menuText(render(d.text, state.vars, who), d.options || []), { question: render(d.text, state.vars, who), options: (d.options || []).map((o: any) => ({ id: String(o.id), label: String(o.label) })) });
        return done("waiting");
      }
      case "ask":
        state.nodeId = node.id;
        state.tries = 0;
        // eslint-disable-next-line no-await-in-loop
        await fx.say(render(d.text, state.vars, who));
        return done("waiting");
      case "polo": {
        // eslint-disable-next-line no-await-in-loop
        const polos = await fx.listPolos();
        if (!polos.length) {
          // nothing to choose from: go on instead of asking a question nobody can answer
          current = go("other") || go();
          break;
        }
        state.nodeId = node.id;
        state.tries = 0;
        const question = render(d.text, state.vars, who);
        const options = polos.map(p => ({ id: String(p.id), label: p.name }));
        // eslint-disable-next-line no-await-in-loop
        await fx.say(menuText(question, options), polos.length <= 10 ? { question, options } : undefined);
        return done("waiting");
      }
      case "condition": {
        let handle = "else";
        for (const rule of d.rules || []) {
          // eslint-disable-next-line no-await-in-loop
          if (await ruleHolds(rule, state.vars, fx)) {
            handle = String(rule.id);
            break;
          }
        }
        current = go(handle);
        break;
      }
      case "crm": {
        // eslint-disable-next-line no-await-in-loop
        const label = await fx.crm(node, state.vars);
        if (d.action === "send_to_crm") state.vars.__crm = label || true;
        current = go();
        break;
      }
      case "delay":
        state.nodeId = node.id;
        return done("delayed", new Date(Date.now() + Math.max(1, Number(d.minutes) || 1) * 60000));
      case "ai":
        // eslint-disable-next-line no-await-in-loop
        if (d.text) await fx.say(render(d.text, state.vars, who));
        // eslint-disable-next-line no-await-in-loop
        await fx.handToAi(node);
        return done("handoff");
      case "transfer":
        // eslint-disable-next-line no-await-in-loop
        if (d.text) await fx.say(render(d.text, state.vars, who));
        // eslint-disable-next-line no-await-in-loop
        await fx.transfer(node, state.vars);
        return done("handoff");
      case "webhook": {
        // eslint-disable-next-line no-await-in-loop
        const ok = await fx.webhook(String(d.url || ""), state.vars);
        current = ok ? go() : go("error") || go();
        break;
      }
      case "random": {
        const branches = d.branches || [];
        const total = branches.reduce((t: number, b: any) => t + (Number(b.weight) || 1), 0) || 1;
        let roll = Math.random() * total;
        let chosen = branches[branches.length - 1];
        for (const b of branches) {
          roll -= Number(b.weight) || 1;
          if (roll <= 0) {
            chosen = b;
            break;
          }
        }
        current = chosen ? go(String(chosen.id)) : null;
        break;
      }
      case "goto":
        current = d.target ? String(d.target) : null;
        break;
      case "end":
        // eslint-disable-next-line no-await-in-loop
        if (d.text) await fx.say(render(d.text, state.vars, who));
        // eslint-disable-next-line no-await-in-loop
        if (d.close) await fx.close();
        return done("done");
      default:
        return done("done");
    }
  }
  return done("done");
};

// The person answered the block the flow was waiting at (or the delay finished).
export const resume = async (graph: Graph, state: RunState, input: string, fx: Effects): Promise<StepResult> => {
  const node = graph.nodes.find(n => n.id === state.nodeId);
  if (!node) return { status: "done", state, path: [] };
  const d = node.data || {};
  const who = fx.who();
  state.vars.__last = input;

  if (node.type === "delay") return advance(graph, nextNodeId(graph, node.id), state, fx);

  if (node.type === "buttons") {
    const options = d.options || [];
    const chosen = pickOption(options, input);
    if (chosen) {
      if (d.saveTo) {
        state.vars[d.saveTo] = chosen.label;
        await fx.saveField(String(d.saveTo), chosen.label);
      }
      state.vars.__choice = chosen.label;
      const target = nextNodeId(graph, node.id, String(chosen.id));
      const step = await advance(graph, target, state, fx);
      return { ...step, path: [node.id, ...step.path] };
    }
    state.tries += 1;
    const other = nextNodeId(graph, node.id, "other");
    if (state.tries >= MAX_TRIES && other) {
      const step = await advance(graph, other, state, fx);
      return { ...step, path: [node.id, ...step.path] };
    }
    await fx.say(`Não entendi. Responda com o número de uma das opções:\n\n${options.map((o: any, i: number) => `*${i + 1}* - ${o.label}`).join("\n")}`);
    return { status: "waiting", state, path: [] };
  }

  if (node.type === "polo") {
    const polos = await fx.listPolos();
    const found = matchPolo(polos, input);
    if (found.polo) {
      state.vars.polo = found.polo.name;
      state.vars.poloId = found.polo.id;
      await fx.setPolo(found.polo.id);
      const step = await advance(graph, nextNodeId(graph, node.id), state, fx);
      return { ...step, path: [node.id, ...step.path] };
    }
    state.tries += 1;
    const other = nextNodeId(graph, node.id, "other");
    if (state.tries >= MAX_TRIES && other) {
      const step = await advance(graph, other, state, fx);
      return { ...step, path: [node.id, ...step.path] };
    }
    const list = (found.ambiguous || polos).map(p => `*${polos.indexOf(p) + 1}* - ${p.name}`).join("\n");
    await fx.say(found.ambiguous ? `Encontrei mais de um polo. Qual deles?\n\n${list}` : `Não encontrei esse polo. Responda com o número, o nome ou a cidade:\n\n${list}`);
    return { status: "waiting", state, path: [] };
  }

  if (node.type === "ask") {
    const kind = d.validate && validators[d.validate] ? d.validate : "text";
    const value = validators[kind](input);
    if (value === null) {
      state.tries += 1;
      await fx.say(invalidText[kind]);
      return { status: "waiting", state, path: [] };
    }
    const field = String(d.field);
    state.vars[field] = value;
    await fx.saveField(field, value);
    const step = await advance(graph, nextNodeId(graph, node.id), state, fx);
    return { ...step, path: [node.id, ...step.path] };
  }
  void who;
  return { status: "done", state, path: [] };
};

export const firstNode = (graph: Graph): FlowNode | undefined => graph.nodes.find(n => n.type === "start");
export { handleOf };
