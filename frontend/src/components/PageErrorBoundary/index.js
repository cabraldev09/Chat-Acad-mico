import React from "react";

import { newErrorCode, reportClientError } from "../../utils/errorReporting";
import { checkVersion } from "../../utils/versionWatch";
import { reloadForNewVersion } from "../../utils/lazyPage";

// a page file that could not be loaded: a new version was being published at that moment (the file appears a few seconds later)
const CHUNK = /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i;
const RETRY_KEY = "chunk-retries";
// up to 3 automatic tries in 2 minutes, 6 s apart, before asking the person to act
const scheduleRetry = () => {
  try {
    const now = Date.now();
    const list = JSON.parse(sessionStorage.getItem(RETRY_KEY) || "[]").filter((t) => now - t < 120000);
    if (list.length >= 3) return false;
    sessionStorage.setItem(RETRY_KEY, JSON.stringify([...list, now]));
  } catch (e) { return false; }
  setTimeout(() => window.location.reload(), 6000);
  return true;
};

// A screen that fails to draw must never leave a blank page: say what happened and offer the way out.
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, code: "", detail: "", updating: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // a failed screen must not take the next ones down with it: moving to another address starts clean
  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, code: "", detail: "", updating: false });
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Screen failed to render:", error);
    // short code the user can read out; the same code is written to the server log with the message and the route
    const code = newErrorCode();
    this.setState({ code, detail: String((error && error.message) || "").slice(0, 160) });
    // a deploy in progress: wait a few seconds and load the new version, without showing an error to the person
    if (CHUNK.test(String((error && error.message) || "")) && scheduleRetry()) { this.setState({ updating: true }); return; }
    reportClientError({ code, error, info });
    // a tab that still runs an old version of the code is the usual reason for a screen that was fixed to fall again:
    // when a newer version is published, load it (once; reloadForNewVersion does not loop)
    checkVersion().then((outOfDate) => { if (outOfDate) reloadForNewVersion(); });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.updating) {
      return (
        <div role="status" style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "inherit" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Carregando a versão nova do sistema</h2>
            <p style={{ opacity: 0.75, maxWidth: 420, margin: "10px auto 0" }}>Uma atualização acabou de ser publicada. A tela abre sozinha em alguns segundos.</p>
          </div>
        </div>
      );
    }
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "inherit" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Não foi possível abrir esta tela</h2>
          <p style={{ opacity: 0.75, maxWidth: 420, margin: "10px auto 18px" }}>
            Pode ser uma versão nova do sistema. Atualize a página; se continuar, volte ao início.
            {this.state.code ? ` Código do erro: ${this.state.code}.` : ""}
          </p>
          {this.state.detail && <p style={{ opacity: 0.55, fontSize: 12, maxWidth: 460, margin: "-8px auto 16px", overflowWrap: "anywhere" }}>{this.state.detail}</p>}
          <button type="button" onClick={() => { try { sessionStorage.removeItem("chunk-reload-at"); sessionStorage.removeItem(RETRY_KEY); } catch (e) { /* blocked */ } window.location.reload(); }} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#0B4279", color: "#fff", fontSize: 15, cursor: "pointer", marginRight: 8 }}>
            Atualizar a página
          </button>
          <button type="button" onClick={() => { window.location.href = "/"; }} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #9aa9bd", background: "transparent", color: "inherit", fontSize: 15, cursor: "pointer" }}>
            Ir para o início
          </button>
        </div>
      </div>
    );
  }
}

export default PageErrorBoundary;
