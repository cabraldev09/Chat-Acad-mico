// Safety net: any button that has an accessible name but no tooltip gets the name as its
// native title, so icon-only buttons never stay anonymous on hover.
const label = (el) => el.getAttribute("aria-label");

// Safety net 2: a field written as <TextField label="..."> without an id keeps its label only on screen (the label is not tied to the
// field: a screen reader says only "campo de texto", and tapping the label does not focus the field). Each one gets an id here.
let seq = 0;
const linkLabels = (root) => {
  root.querySelectorAll(".MuiFormControl-root > label.MuiInputLabel-root:not([for])").forEach((lab) => {
    const field = lab.parentElement.querySelector("input:not([type=hidden]):not([aria-hidden=true]), textarea:not([aria-hidden=true]), [role=button][aria-haspopup]");
    if (!field) return;
    if (!field.id) { seq += 1; field.id = `campo-${seq}`; }
    if (!lab.id) lab.id = `${field.id}-rotulo`;
    lab.setAttribute("for", field.id);
    // a select (a div with a button role) is named by its label
    if (field.getAttribute("role") === "button" && !field.getAttribute("aria-labelledby")) field.setAttribute("aria-labelledby", `${lab.id} ${field.id}`);
  });
};

const apply = (root) => {
  linkLabels(root);
  // the items of the folded menu already show their own name beside the icon (the dock label): a native tooltip would be a second one
  root.querySelectorAll('button[aria-label]:not([title]):not([data-dock]), [role="button"][aria-label]:not([title]):not([data-dock])').forEach((el) => {
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
