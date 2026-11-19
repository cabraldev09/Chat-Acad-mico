import { useEffect, useState } from "react";

import api from "../../services/api";

// How the assistant introduces itself, as the server writes it (with the institution of Configurações → Geral): one source for every screen
export default function useIntro(assistantName, greeting) {
  const [text, setText] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/ai-agent-intro", { params: { assistantName: assistantName || "", greeting: greeting || "", first: "Maria" } }).then(({ data }) => setText(data.text || "")).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [assistantName, greeting]);
  return text;
}
