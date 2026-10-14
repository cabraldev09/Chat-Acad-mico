import React from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import pt from "@emoji-mart/data/i18n/pt.json";
import words from "emojibase-data/pt/compact.json";

// emoji-mart searches English keywords. The Portuguese names and tags (emojibase) are added to each emoji once, with
// and without accents, so "foguete", "coração", "parabens" and "pizza" all find their emoji.
const plain = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
let enriched = false;
const enrich = () => {
  if (enriched) return;
  enriched = true;
  const byEmoji = new Map();
  words.forEach((e) => {
    const list = [e.label, ...(e.tags || [])].filter(Boolean);
    byEmoji.set(e.unicode.replace(/️/g, ""), list);
  });
  Object.values(data.emojis).forEach((emoji) => {
    const native = emoji.skins && emoji.skins[0] && emoji.skins[0].native;
    const list = native && byEmoji.get(native.replace(/️/g, ""));
    if (!list) return;
    const extra = [];
    list.forEach((w) => {
      extra.push(w.toLowerCase());
      extra.push(plain(w));
      w.split(/\s+/).forEach((part) => part.length > 2 && extra.push(part.toLowerCase(), plain(part)));
    });
    emoji.keywords = Array.from(new Set([...(emoji.keywords || []), ...extra]));
  });
};

const EmojiPickerImpl = ({ onSelect, dark, perLine = 8 }) => {
  enrich();
  return (
    <Picker
      data={data}
      i18n={pt}
      locale="pt"
      theme={dark ? "dark" : "light"}
      onEmojiSelect={(e) => onSelect(e.native)}
      previewPosition="none"
      skinTonePosition="none"
      navPosition="bottom"
      perLine={perLine}
      maxFrequentRows={2}
      emojiButtonSize={38}
      emojiSize={24}
      autoFocus={false}
    />
  );
};

export default EmojiPickerImpl;
