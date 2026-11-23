import React, { useEffect, useState } from "react";

// What a screen shows while its file downloads: nothing for the first moment (most pages are already in the browser) and then a thin
// moving bar at the top of the content. The menu and the header stay where they are, so moving between screens never blinks.
const css = `@keyframes page-loading-run{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
.page-loading{position:relative;height:3px;overflow:hidden;background:transparent}
.page-loading span{position:absolute;inset:0;width:40%;background:var(--c-brand,#0B4279);border-radius:3px;animation:page-loading-run 1s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.page-loading span{animation:none;width:100%;opacity:.4}}`;

const PageLoading = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div role="progressbar" aria-label="Carregando a tela" aria-busy="true">
      <style>{css}</style>
      <div className="page-loading"><span /></div>
    </div>
  );
};

export default PageLoading;
