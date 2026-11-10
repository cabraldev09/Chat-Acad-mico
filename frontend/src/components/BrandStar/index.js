import React from "react";

import flow from "../../assets/brand/estrela-cauda.webp";
import emblem from "../../assets/brand/estrela-cromada.webp";
import escolha from "../../assets/brand/escolha-ter-estrela.webp";

// The star of the brand (chrome and blue, 3D) for the screens where someone arrives: the sign-in screens.
//   variant="emblem"   the chrome star alone (small marks, above a card)
//   variant="flow"     the star riding a blue ribbon (large art for the side of a screen)
//   variant="escolha"  the "Escolha ter estrela" logo
// Options: `glow` (a soft light behind), `float` (slow, small movement), `shine` (a pass of light over the metal now and
// then). Movement stops for people who asked their system for less motion. The image is a decoration: it cannot be
// dragged or selected and has no text for a screen reader unless `alt` is given.
const SOURCES = { flow, emblem, escolha };

const BrandStar = ({ variant = "emblem", size = 96, glow = true, float = false, shine = false, shadow = true, alt = "", className = "", style }) => {
  const src = SOURCES[variant] || emblem;
  return (
    <span className={`brand-star ${float ? "brand-star-float" : ""} ${className}`} style={{ width: size, ...style }} aria-hidden={alt ? undefined : true}>
      {glow && <span className="brand-star-glow" />}
      <img src={src} alt={alt} draggable={false} onDragStart={(e) => e.preventDefault()} className={shadow ? "brand-star-img" : "brand-star-img brand-star-flat"} />
      {shine && <span className="brand-star-shine" style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }} />}
    </span>
  );
};

export default BrandStar;
