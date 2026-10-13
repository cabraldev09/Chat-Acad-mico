import React from "react";
import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";

// Icon-only button that always says what it does (tooltip on hover and for screen readers).
// The span keeps the tooltip working while the button is disabled.
const IconAction = ({ title, onClick, disabled, children, size = "small", ...rest }) => (
  <Tooltip title={title} arrow enterDelay={80} placement="top">
    <span style={{ display: "inline-flex" }}>
      <IconButton size={size} aria-label={title} disabled={disabled} onClick={onClick} {...rest}>
        {children}
      </IconButton>
    </span>
  </Tooltip>
);

export default IconAction;
