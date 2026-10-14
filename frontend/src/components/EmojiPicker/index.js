import React, { Suspense } from "react";
import { bumpEmoji } from "../../utils/emojiUsage";

// loaded only when opened: the emoji data is large
const Impl = React.lazy(() => import("./Picker"));

// a failed download (offline, or the page is older than the server) must not blank the whole screen
class Guard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{ width: 300, padding: 16, borderRadius: 16, background: "#fff", color: "#111b21", fontSize: 14 }}>
          Não foi possível carregar os emojis. Recarregue a página e tente de novo.
        </div>
      );
    }
    return this.props.children;
  }
}

const EmojiPicker = ({ onSelect, dark, perLine }) => (
  <Guard>
    <Suspense fallback={<div style={{ width: 352, height: 380, borderRadius: 16, background: dark ? "#202c33" : "#f0f2f5" }} />}>
      <Impl
        dark={dark}
        perLine={perLine}
        onSelect={(emoji) => {
          bumpEmoji(emoji);
          onSelect(emoji);
        }}
      />
    </Suspense>
  </Guard>
);

export default EmojiPicker;
