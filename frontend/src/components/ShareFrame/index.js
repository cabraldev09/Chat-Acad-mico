import React, { useEffect, useRef, useState } from "react";

// Draws a picture at its real size (the size that is exported) and shrinks it to fit the column on screen.
const ShareFrame = ({ width, innerRef, children }) => {
  const boxRef = useRef(null);
  const ownRef = useRef(null);
  const node = innerRef || ownRef;
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const measure = () => {
      if (!boxRef.current || !node.current) return;
      const scale = Math.min(1, boxRef.current.clientWidth / width);
      const height = node.current.offsetHeight;
      setFit((f) => (f.scale === scale && f.height === height ? f : { scale, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    if (node.current) ro.observe(node.current);
    return () => ro.disconnect();
  }, [width, node]);
  return (
    <div ref={boxRef} style={{ width: "100%", height: fit.height ? fit.height * fit.scale : "auto", overflow: "hidden" }}>
      <div ref={node} style={{ width, transform: `scale(${fit.scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
};

export default ShareFrame;
