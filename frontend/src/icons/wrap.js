import React from "react";
import { useTheme } from "@material-ui/core/styles";

// Drop-in replacement for Material SvgIcon props (fontSize/color/htmlColor/titleAccess)
const wrap = (Icon) => {
  const Wrapped = React.forwardRef(function MdIcon(
    { fontSize = "default", color = "inherit", htmlColor, titleAccess, className, style, ...rest },
    ref
  ) {
    const theme = useTheme();
    const fromTheme = {
      primary: theme.palette.primary.main,
      secondary: theme.palette.secondary.main,
      error: theme.palette.error.main,
      action: theme.palette.text.secondary,
      disabled: theme.palette.action.disabled,
    };
    const resolved = htmlColor || fromTheme[color];
    const cls = ["ico", fontSize === "small" && "ico-small", fontSize === "large" && "ico-large", className]
      .filter(Boolean)
      .join(" ");
    return (
      <Icon
        ref={ref}
        size="1em"
        strokeWidth={1.85}
        absoluteStrokeWidth={false}
        className={cls}
        style={resolved ? { color: resolved, ...style } : style}
        aria-hidden={titleAccess ? undefined : true}
        {...rest}
      >
        {titleAccess ? <title>{titleAccess}</title> : null}
      </Icon>
    );
  });
  return Wrapped;
};

export default wrap;
