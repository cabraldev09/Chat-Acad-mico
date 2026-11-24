import React from "react";
import { toast } from "react-toastify";

// Every toast in the app (toast.success(...), toastError(...)) is a notification in the style of the Mac: a frosted card with the
// icon in a rounded square, the title in bold with "agora" on the right, and the message under it (styles/app.css, .mtoast).
const TYPES = {
  success: { title: "Tudo certo", color: "#16a34a", icon: <path d="M20 6 9 17l-5-5" /> },
  error: { title: "Algo deu errado", color: "#dc2626", icon: <path d="M18 6 6 18M6 6l12 12" /> },
  warn: { title: "Atenção", color: "#d97706", icon: <path d="M12 8v5M12 17h.01" /> },
  info: { title: "Aviso", color: "#0693e3", icon: <path d="M12 11v5M12 7.5h.01" /> },
};

const Body = ({ type, content }) => {
  const t = TYPES[type];
  return (
    <div className="mtoast">
      <span className="mtoast-icon" style={{ background: `linear-gradient(160deg, ${t.color}, ${t.color}cc)` }} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          {t.icon}
        </svg>
      </span>
      <div className="mtoast-text">
        <div className="mtoast-head"><span className="mtoast-title">{t.title}</span><span className="mtoast-time">agora</span></div>
        <div className="mtoast-msg">{content}</div>
      </div>
    </div>
  );
};

let installed = false;
export const installModernToast = () => {
  if (installed) return;
  installed = true;
  [
    ["success", "success"],
    ["error", "error"],
    ["warn", "warn"],
    ["warning", "warn"],
    ["info", "info"],
  ].forEach(([fn, type]) => {
    const original = toast[fn];
    toast[fn] = (content, options) =>
      typeof content === "string" || typeof content === "number" || React.isValidElement(content)
        ? original(<Body type={type} content={content} />, options)
        : original(content, options);
  });
};
