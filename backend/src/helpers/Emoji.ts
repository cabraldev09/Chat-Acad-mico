// Few emojis, like a person who writes for work: a robot that fills every message with them sounds fake. Pure, so it is tested.
// Keeps the first `max` pictographs (with their variation selector or joined sequence) and drops the rest, then tidies the spaces they leave.
const PICTO = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*️?/gu;

export const countEmojis = (text: string): number => (String(text || "").match(PICTO) || []).length;

export const limitEmojis = (text: string, max = 1): string => {
  const source = String(text || "");
  if (countEmojis(source) <= max) return source;
  let seen = 0;
  const out = source.replace(PICTO, m => (++seen <= max ? m : ""));
  return out
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]+$/g, "");
};
