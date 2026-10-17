// The buttons and the list of the WhatsApp Cloud API (the official one). The rules of Meta are strict and a message that breaks
// them is refused, so everything is built here, in one place that the tests cover:
//   - up to 3 reply buttons (title up to 20 characters) or a list of up to 10 rows (title up to 24, description up to 72);
//   - more than 10 options cannot be sent as buttons at all: the caller sends the numbered text instead;
//   - the titles of one message must be different, and the ids too (the person's tap comes back as the TITLE, so two options that
//     look the same after being cut would be impossible to tell apart);
//   - the text of the body is limited to 1024 characters and cannot be empty.
// Interactive messages only exist inside the 24 hours after the person last wrote (see CloudWindow); the connections by QR
// Code never send them (the library of that connection does not support them, and trying is a reason for a ban).
export interface ChoiceOption {
  id?: string;
  label: string;
}

const BUTTON_TITLE = 20;
const ROW_TITLE = 24;
const ROW_DESC = 72;
const MAX_BUTTONS = 3;
const MAX_ROWS = 10;

// the titles cut to `max` characters and made different: two that collide get their number in front ("2. Curso de Ped...")
export const uniqueTitles = (labels: string[], max: number): string[] => {
  const base = labels.map((l, i) => (String(l || "").trim() || `Opção ${i + 1}`).replace(/\s+/g, " "));
  const cut = base.map(l => (l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l));
  return cut.map((t, i) => {
    if (cut.filter(x => x.toLowerCase() === t.toLowerCase()).length === 1) return t;
    const prefix = `${i + 1}. `;
    const rest = base[i].length + prefix.length > max ? `${base[i].slice(0, max - prefix.length - 1).trimEnd()}…` : base[i];
    return `${prefix}${rest}`;
  });
};

export const buildInteractive = (question: string, options: ChoiceOption[]): Record<string, any> | null => {
  if (!options.length || options.length > MAX_ROWS) return null;
  const body = { text: String(question || "").trim().slice(0, 1000) || "Escolha uma opção" };
  const labels = options.map(o => o.label);
  if (options.length <= MAX_BUTTONS) {
    const titles = uniqueTitles(labels, BUTTON_TITLE);
    return {
      type: "button",
      body,
      action: { buttons: titles.map((title, i) => ({ type: "reply", reply: { id: String(i + 1), title } })) }
    };
  }
  const titles = uniqueTitles(labels, ROW_TITLE);
  return {
    type: "list",
    body,
    action: {
      button: "Escolher",
      sections: [
        {
          title: "Opções",
          rows: titles.map((title, i) => {
            const full = String(labels[i] || "").trim().replace(/\s+/g, " ");
            // a name that did not fit in the title goes complete in the description
            return { id: String(i + 1), title, ...(full.length > title.length ? { description: full.slice(0, ROW_DESC) } : {}) };
          })
        }
      ]
    }
  };
};
