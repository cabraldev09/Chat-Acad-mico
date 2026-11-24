import React from "react";
import { toast } from "react-toastify";

// Every toast in the app (toast.success(...), toastError(...)) gets the same
// modern card: colored icon bubble, a short title and the message.
const TYPES = {
  success: { title: "Tudo certo", color: "#16a34a", icon: <path d="M20 6 9 17l-5-5" /> },
  error: { title: "Algo deu errado", color: "#dc2626", icon: <path d="M18 6 6 18M6 6l12 12" /> },
  warn: { title: "Atenção", color: "#d97706", icon: <path d="M12 8v5M12 17h.01" /> },
  info: { title: "Aviso", color: "#0693e3", icon: <path d="M12 11v5M12 7.5h.01" /> },
};

const Body = ({ type, content, title, action }) => {
  const t = TYPES[type];
  return (
    <div className="mtoast">
      <span className="mtoast-icon" style={{ color: t.color, background: `${t.color}1f` }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {t.icon}
        </svg>
      </span>
      <div className="mtoast-text">
        <div className="mtoast-title">{title || t.title}</div>
        {content ? <div className="mtoast-msg">{content}</div> : null}
        {action ? (
          <button type="button" className="mtoast-action" onClick={(e) => { e.stopPropagation(); action.onClick(); }}>{action.label}</button>
        ) : null}
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
      // a card already drawn (noticeToast) goes as it is
      (typeof content === "string" || typeof content === "number" || React.isValidElement(content)) && !(React.isValidElement(content) && content.type === Body)
        ? original(<Body type={type} content={content} />, options)
        : original(content, options);
  });
};

// A notice of the system (the bell's "Avisos") as a toast: its own title, one sentence and the button that takes to where it is solved
const LEVEL_TYPE = { urgent: "error", warning: "warn", info: "info", success: "success" };
export const noticeToast = ({ title, body, level, actionLabel, onAction, id }) => {
  const type = LEVEL_TYPE[level] || "info";
  const fn = type === "error" ? "error" : type === "warn" ? "warning" : type === "success" ? "success" : "info";
  const content = <Body type={type} title={title} content={body || ""} action={onAction ? { label: actionLabel || "Abrir", onClick: onAction } : null} />;
  return toast[fn](content, { toastId: id, autoClose: level === "urgent" ? false : 8000, closeOnClick: false });
};
