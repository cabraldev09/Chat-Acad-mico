import React, { useEffect, useRef, useState } from "react";
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

// A window over the page (the referral form, the QR Code): the focus goes inside when it opens, stays inside while Tab is pressed, Esc closes it and the
// focus goes back to the button that opened it.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const useDialogFocus = (onClose) => {
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const node = ref.current;
    const first = node && node.querySelector(FOCUSABLE);
    if (first) first.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [onClose]);
  return ref;
};
