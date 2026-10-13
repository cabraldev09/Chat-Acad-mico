// Safety net: any button that has an accessible name but no tooltip gets the name as its
// native title, so icon-only buttons never stay anonymous on hover.
const label = (el) => el.getAttribute("aria-label");

const apply = (root) => {
  root.querySelectorAll('button[aria-label]:not([title]), [role="button"][aria-label]:not([title])').forEach((el) => {
    const text = label(el);
    if (text) el.setAttribute("title", text);
  });
};

export const installAutoTitles = () => {
  if (typeof window === "undefined" || window.__autoTitles) return;
  window.__autoTitles = true;
  const run = () => apply(document);
  new MutationObserver(() => requestAnimationFrame(run)).observe(document.documentElement, { childList: true, subtree: true });
  run();
};
