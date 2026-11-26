import React from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import MediaGallery, { openGallery, zoomStep } from "../components/MediaGallery";

afterEach(() => cleanup());

const scaleOf = (img) => Number((img.style.transform.match(/scale\(([\d.]+)\)/) || [])[1]);

describe("visualizador de fotos", () => {
  it("a pinça do trackpad (roda com Ctrl) amplia a foto e não a página", () => {
    render(<MediaGallery />);
    act(() => { openGallery([{ url: "data:image/png;base64,iVBORw0KGgo=", type: "image" }, { url: "data:image/png;base64,AAAA", type: "image" }], 0); });
    const dialog = document.querySelector('[role="dialog"]');
    const img = dialog.querySelector("img");
    expect(scaleOf(img)).toBe(1);
    const pinch = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { img.dispatchEvent(pinch); });
    expect(pinch.defaultPrevented).toBe(true);
    expect(scaleOf(dialog.querySelector("img"))).toBeGreaterThan(1);
    // the plain wheel with the photo whole does nothing to it (and the page is not held)
    act(() => { fireEvent.doubleClick(dialog.querySelector("img")); });
    expect(scaleOf(dialog.querySelector("img"))).toBe(1);
    const plain = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
    act(() => { dialog.querySelector("img").dispatchEvent(plain); });
    expect(plain.defaultPrevented).toBe(false);
    // the next photo opens whole
    act(() => { dialog.querySelector("img").dispatchEvent(new WheelEvent("wheel", { deltaY: -200, ctrlKey: true, bubbles: true, cancelable: true })); });
    act(() => { fireEvent.keyDown(document, { key: "ArrowRight" }); });
    expect(scaleOf(document.querySelector('[role="dialog"] img'))).toBe(1);
  });

  it("o zoom fica entre 1x e 5x", () => {
    expect(zoomStep(1, 1000)).toBe(1);
    expect(zoomStep(4, -1000)).toBe(5);
    expect(zoomStep(1, -50)).toBeGreaterThan(1);
  });
});
