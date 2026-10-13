import React from "react";
import logoWhite from "../../assets/logo-cruzeiro.svg";
import logoColor from "../../assets/logo-cruzeiro-color.svg";

// Institution logo (vector, transparent background).
//   tone="color": navy text + blue star (light surfaces)
//   tone="white": the official white-text file turned into a white silhouette (blue / dark surfaces)
const BrandLogo = ({ height = 40, tone = "color", style, className }) => (
  <img
    className={className}
    src={tone === "white" ? logoWhite : logoColor}
    alt="Universidade Cruzeiro do Sul Virtual"
    // a logo is a mark, not a picture to grab: no drag ghost, no selection
    draggable={false}
    onDragStart={(e) => e.preventDefault()}
    style={{
      userSelect: "none",
      WebkitUserDrag: "none",
      pointerEvents: "none",
      height,
      width: "auto",
      alignSelf: "flex-start",
      filter: tone === "white" ? "brightness(0) invert(1)" : undefined,
      ...style,
    }}
  />
);

export default BrandLogo;
