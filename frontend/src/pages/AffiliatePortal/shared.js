import React, { useState } from "react";
import { toast } from "react-toastify";
import { Check, Copy } from "lucide-react";

// copy to the clipboard (with a fallback for pages that are not secure) and the button that does it
export const copyText = async (text, ok = "Copiado!") => {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    return false;
  }
};

export const CopyButton = ({ text, label = "Copiar mensagem", ok, className = "ca-btn", onCopied }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`${className}${done ? " is-done" : ""}`}
      onClick={async () => {
        if (await copyText(text, ok)) {
          setDone(true);
          if (onCopied) onCopied();
          setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? <Check size={16} /> : <Copy size={16} />}
      {done ? "Copiado" : label}
    </button>
  );
};
