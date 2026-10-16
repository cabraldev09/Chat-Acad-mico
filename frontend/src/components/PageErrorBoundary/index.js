import React from "react";

import { newErrorCode, reportClientError } from "../../utils/errorReporting";

// A screen that fails to draw must never leave a blank page: say what happened and offer the way out.
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, code: "", detail: "" };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // a failed screen must not take the next ones down with it: moving to another address starts clean
  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, code: "", detail: "" });
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Screen failed to render:", error);
    // short code the user can read out; the same code is written to the server log with the message and the route
    const code = newErrorCode();
    this.setState({ code, detail: String((error && error.message) || "").slice(0, 160) });
    reportClientError({ code, error, info });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "inherit" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Não foi possível abrir esta tela</h2>
          <p style={{ opacity: 0.75, maxWidth: 420, margin: "10px auto 18px" }}>
            Pode ser uma versão nova do sistema. Atualize a página; se continuar, volte ao início.
            {this.state.code ? ` Código do erro: ${this.state.code}.` : ""}
          </p>
          {this.state.detail && <p style={{ opacity: 0.55, fontSize: 12, maxWidth: 460, margin: "-8px auto 16px", overflowWrap: "anywhere" }}>{this.state.detail}</p>}
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#0B4279", color: "#fff", fontSize: 15, cursor: "pointer", marginRight: 8 }}>
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
