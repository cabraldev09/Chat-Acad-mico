import React from "react";

import { newErrorCode, reportClientError } from "../../utils/errorReporting";

// One part of a screen (a tab, a group of settings, a dialog) that fails to draw must not take the whole page down:
// the rest keeps working, this part says what happened and offers to try again. Changing `resetKey` (the open tab,
// for instance) starts it clean.
class SectionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, code: "", detail: "" };
  }

  static getDerivedStateFromError() {
    // the code exists from the first draw of the message
    return { failed: true, code: newErrorCode(), detail: "" };
  }

  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, code: "", detail: "" });
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Section failed to render:", error);
    const code = this.state.code || newErrorCode();
    this.setState({ code, detail: String((error && error.message) || "").slice(0, 160) });
    reportClientError({ code, error, info, kind: this.props.name ? `seção ${this.props.name}` : "seção" });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ border: "1px solid rgba(217,119,6,.45)", background: "rgba(217,119,6,.08)", borderRadius: 14, padding: "18px 20px", margin: "8px 0" }}>
        <strong style={{ display: "block", fontSize: 16 }}>Esta parte não abriu</strong>
        <p style={{ margin: "6px 0 12px", opacity: 0.8, fontSize: 14, lineHeight: 1.5 }}>
          O resto da tela continua funcionando. Tente de novo; se o problema voltar, avise a coordenação com o código {this.state.code}.
        </p>
        {this.state.detail && <p style={{ margin: "0 0 12px", opacity: 0.55, fontSize: 12, overflowWrap: "anywhere" }}>{this.state.detail}</p>}
        <button type="button" onClick={() => this.setState({ failed: false, code: "", detail: "" })} style={{ padding: "8px 16px", borderRadius: 10, border: 0, background: "#0B4279", color: "#fff", fontSize: 14, cursor: "pointer" }}>
          Tentar de novo
        </button>
      </div>
    );
  }
}

export default SectionBoundary;
