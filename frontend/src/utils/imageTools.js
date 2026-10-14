// Small canvas helpers used before sending pictures: crop, rotate and shrink very large photos.

export const isImageFile = (f) => !!(f && f.type && f.type.startsWith("image/"));

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    img.src = url;
  });

const toBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível gerar a imagem."))), type, quality));

const baseName = (name) => String(name || "imagem").replace(/\.[^.]+$/, "");

const outType = (file) => (file.type === "image/png" ? "image/png" : "image/jpeg");
const extOf = (type) => (type === "image/png" ? "png" : "jpg");

// scales a canvas down so its longest side is at most maxSide
const limit = (canvas, maxSide) => {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= maxSide) return canvas;
  const k = maxSide / longest;
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * k);
  small.height = Math.round(canvas.height * k);
  small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
  return small;
};

const finish = async (canvas, file, suffix, maxSide) => {
  const type = outType(file);
  const blob = await toBlob(limit(canvas, maxSide), type, 0.92);
  return new File([blob], `${baseName(file.name)}${suffix}.${extOf(type)}`, { type, lastModified: Date.now() });
};

// Photos from phones are often 5 MB or more: shrink to a size that still looks sharp in WhatsApp.
export const shrinkImage = async (file, maxSide = 2560) => {
  if (!isImageFile(file) || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (Math.max(img.width, img.height) <= maxSide && file.size < 2.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return await finish(canvas, file, "", maxSide);
  } catch (e) {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const rotatedBox = (w, h, deg) => {
  const r = (deg * Math.PI) / 180;
  return { w: Math.abs(Math.cos(r) * w) + Math.abs(Math.sin(r) * h), h: Math.abs(Math.sin(r) * w) + Math.abs(Math.cos(r) * h) };
};

const drawRotated = (img, deg) => {
  const box = rotatedBox(img.width, img.height, deg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(box.w);
  canvas.height = Math.round(box.h);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas;
};

// pixelCrop comes from react-easy-crop (coordinates on the rotated picture)
export const cropImage = async (file, pixelCrop, rotation = 0, maxSide = 2560) => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const rotated = drawRotated(img, rotation);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(pixelCrop.width));
    out.height = Math.max(1, Math.round(pixelCrop.height));
    out.getContext("2d").drawImage(rotated, Math.round(pixelCrop.x), Math.round(pixelCrop.y), out.width, out.height, 0, 0, out.width, out.height);
    return await finish(out, file, "-recortada", maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const rotateImage = async (file, degrees = 90) => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await finish(drawRotated(img, degrees), file, "-girada", 4096);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const imageSize = async (file) => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { width: img.width, height: img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
};
