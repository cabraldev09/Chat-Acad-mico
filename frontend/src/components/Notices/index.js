import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";

// The notices on top of every screen (a number that fell, tasks and leads waiting): one compact line each, shown one at a time, with
// "1/2 ›" to see the next. Each notice keeps its own rules (when it appears, when it comes back); this only lays them out.
const Ctx = createContext({ count: 1, index: 0, next: () => undefined });

export const Notices = ({ children }) => {
  const ref = useRef(null);
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  // each notice decides by itself whether it shows (and may appear later, after its data loads): the box watches its own children
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof MutationObserver === "undefined") return undefined;
    const sync = () => setCount(el.querySelectorAll(":scope > [data-notice]").length);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { childList: true });
    return () => obs.disconnect();
  }, []);
  // mark the one in view (the others stay hidden by the CSS until "1/2 ›")
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = [...el.querySelectorAll(":scope > [data-notice]")];
    const i = items.length ? index % items.length : 0;
    items.forEach((n, k) => n.setAttribute("data-active", k === i ? "true" : "false"));
  });
  const value = { count, index: count ? index % count : 0, next: () => setIndex((i) => i + 1) };
  return <Ctx.Provider value={value}><div ref={ref} className="notices">{children}</div></Ctx.Provider>;
};

// One notice: icon, the text in one line (the whole text on hover), the action and the close
export const Notice = ({ tone = "info", icon: Icon, children, title, action, onAction, onClose }) => {
  const { count, index, next } = useContext(Ctx);
  return (
    <div role="alert" className="notice" data-notice data-tone={tone}>
      {Icon ? <span className="notice-ico" aria-hidden="true"><Icon size={17} /></span> : null}
      <span className="notice-text" title={title}>{children}</span>
      {count > 1 && (
        <button type="button" className="notice-step" onClick={next} aria-label={`Próximo aviso (${index + 1} de ${count})`}>
          {index + 1}/{count}<ChevronRight size={14} />
        </button>
      )}
      {action ? <button type="button" className="notice-btn" onClick={onAction}>{action}</button> : null}
      {onClose ? <button type="button" className="notice-x" aria-label="Dispensar o aviso" onClick={onClose}><X size={16} /></button> : null}
    </div>
  );
};
