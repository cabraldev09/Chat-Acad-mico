import React, { useEffect, useRef, useState } from "react";

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Counts up to `value` (Magic UI number ticker). Non numeric values render as is.
const NumberTicker = ({ value, duration = 900, format }) => {
  const target = Number(value);
  const [shown, setShown] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (Number.isNaN(target)) return undefined;
    const from = prev.current;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(from + (target - from) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(step);
      else prev.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  if (Number.isNaN(target)) return <>{value}</>;
  const n = Math.round(shown);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{format ? format(n) : n}</span>;
};

export default NumberTicker;
